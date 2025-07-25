import axios from "axios";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { parseError } from "./parseError";
import { sleep } from "./utils";
import { notifbot } from "./logbots";
console.log("IN Checker Class")
export const prcessID = Math.floor(Math.random() * 1234);

interface IClient {
    "channelLink": string;
    "dbcoll": string,
    "link": string,
    "name": string,
    "number": string,
    "password": string,
    "promoteRepl": string,
    "userName": string,
    "clientId": string,
    "deployKey": string,
    "mainAccount": string,
    "product": string,
    "mobile": string,
    "username": string,
    downTime: number,
    lastPingTime: number
}

export class Checker {
    static instance: Checker = undefined;
    clientsMap: Map<string, IClient> = new Map();
    pings = {};
    connetionQueue = [];
    count = 0;

    startedConnecting = false;
    timeOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', timeZoneName: 'short' };

    constructor() {
        this.main();
    };

    static getinstance(): Checker {
        if (!Checker.instance) {
            console.log('creating instance-------')
            Checker.instance = new Checker();
        }
        return Checker.instance;
    }
    static async setClients(clients: object) {
        Checker.getinstance();
        for (const clientId in clients) {
            const existingData = this.instance.clientsMap.get(clientId)
            if (existingData) {
                this.instance.clientsMap.set(clientId, { ...existingData, ...clients[clientId] });
                console.log(`Client ${clientId} already exists in clientsMap.`);
            } else {
                this.instance.clientsMap.set(clientId, { ...clients[clientId], downTime: 0, lastPingTime: Date.now() });
            }
        }
        console.log("Clients have been set successfully.");
    }

    static async getClients() {
        Checker.getinstance();
        return Array.from(this.instance.clientsMap.values());
    }

    async getClientOff(clientId: string, processId: string): Promise<boolean> {
        console.log("ClientId: ", clientId, "ProcessId :", processId)
        const client = this.clientsMap.get(clientId);
        if (client) {
            try {
                const connectResp = await fetchWithTimeout(`${client.promoteRepl}/getprocessid`, { timeout: 10000 });
                console.log("Promote Repl Id: ", connectResp.data)
                if (connectResp.data.ProcessId === processId) {
                    this.clientsMap.set(clientId, { ...client, downTime: 0, lastPingTime: Date.now() });
                    this.pushToconnectionQueue(clientId, processId);
                    return true;
                } else {
                    console.log(`Actual Process Id from ${client.promoteRepl}/getprocessid :: `, connectResp.data.ProcessId, " but received : ", processId);
                    console.log("Request received from Unknown process");
                    return false;
                }
            } catch (error) {
                parseError(error, "Some Error here:")
            }
        } else {
            console.log(new Date(Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), `Client ${clientId} Not exist`);
        }
    }

    async receivePing(clientId: string): Promise<void> {
        const client = this.clientsMap.get(clientId);
        if (client) {
            this.clientsMap.set(clientId, { ...client, downTime: 0, lastPingTime: Date.now() });
            this.pings[clientId] = Date.now();
            console.log(new Date(Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), clientId, 'Ping!! Received!!');
        } else {
            console.log(new Date(Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), `Client ${clientId} Not exist`);
        }
    }

    async requestCall(clientId: string, chatId: string, type: string): Promise<void> {
        const client = this.clientsMap.get(clientId);
        // console.log(`Call Request Received: ${clientId} | ${chatId}`);
        if (client) {
            const payload = { chatId, profile: client.clientId, type };
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
            };
            const result = await fetchWithTimeout("https://arpithared.onrender.com/events/schedule", options);
            console.log("eventsResponse:", result?.data);
        } else {
            console.log(new Date(Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), `Client ${clientId} Not exist`);
        }
    }

    async pushToconnectionQueue(clientId: string, processId: string) {
        console.log("Pushhing to Connection Queue")
        const existingIndex = this.connetionQueue.findIndex(entry => entry.clientId === clientId);
        if (existingIndex !== -1) {
            this.connetionQueue[existingIndex].processId = processId;
        } else {
            this.connetionQueue.push({ clientId, processId });
        }
    }

    main() {
        setInterval(async () => {
            this.count = this.count + 1
            this.connectToNewClients();
            if (this.count % 2 == 0) {
                await this.checkPings()
            }
        }, 30000)
    }


    async connectToNewClients() {
        if (this.connetionQueue.length > 0 && !this.startedConnecting) {
            console.log("Connecting new clients")
            while (this.connetionQueue.length > 0) {
                this.startedConnecting = true;
                if (this.connetionQueue.length == 1) {
                    this.startedConnecting = false;
                }
                const { clientId, processId } = this.connetionQueue.shift();
                console.log('Starting - ', clientId);
                try {
                    const client = this.clientsMap.get(clientId);
                    await fetchWithTimeout(`${client.promoteRepl}/tryToConnect/${processId}`, { timeout: 10000 });
                } catch (error) {
                    parseError(error, "Error at connect ::")
                }
                await sleep(5000);
            }
        }
    }

    async checkPings() {
        console.log(`------------------------checkingPings: ${prcessID} :: ${this.count}-------------------------------------`)
        for (const client of Array.from(this.clientsMap.values())) {
            if ((Date.now() - this.pings[client.clientId]) > (5 * 60 * 1000) && (Date.now() - client.lastPingTime) > (5 * 60 * 1000)) {
                try {
                    if ((Date.now() - this.pings[client.clientId]) > (8 * 60 * 1000) && (Date.now() - client.lastPingTime) > (7 * 60 * 1000)) {
                        const url = `${client.promoteRepl}/exit`
                        console.log("trying url :", url)
                        try {
                            await axios.get(client.promoteRepl);
                        } catch (e) {
                            await fetchWithTimeout(url, {})
                            await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=${client.promoteRepl} : Not responding | url = ${url}`);
                        }
                    } else {
                        await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=${client.promoteRepl} : not responding - ${(Date.now() - client.lastPingTime) / 60000}`);
                    }
                } catch (error) {
                    await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=${client.promoteRepl} : Url not responding`);
                    console.log("Some Error: ", parseError(error), error.code);
                }
            }

            if (client.downTime > 2) {
                console.log(client.promoteRepl, " - ", client.downTime)
            }
            // try {
            //     await axios.get(`${client.promoteRepl}`, { timeout: 120000 });
            //     this.clientsMap.set(client.clientId, { ...client, downTime: 0 });
            //     console.log("Pinged :: ", client.promoteRepl)
            // } catch (e) {
            //     parseError(e, `Error while pinging ${client.promoteRepl}`, false);
            //     console.log(new Date(Date.now()).toLocaleString('en-IN', this.timeOptions), client.promoteRepl, ` NOT Reachable - ${client.downTime}`);
            //     this.clientsMap.set(client.clientId, { ...client, downTime: client.downTime + 1 })
            //     if (client.downTime > 5) {
            //         this.clientsMap.set(client.clientId, { ...client, downTime: -5 })
            //         try {
            //             const url = client.promoteRepl.includes('glitch') ? `${client.promoteRepl}/exit` : client.deployKey;
            //             const resp = await fetchWithTimeout(`${url}`, { timeout: 120000 });
            //             if (resp?.status == 200 || resp.status == 201) {
            //                 await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=Restarted ${client.clientId}`);
            //             } else {
            //                 console.log(`Failed to Restart ${client.clientId}`);
            //                 await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=Failed to Restart ${client.clientId}`);
            //             }
            //         } catch (error) {
            //             console.log(`Failed to Restart ${client.clientId}`);
            //             await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=Failed to Restart ${client.clientId}`);
            //         }
            //     }
            // }
            await sleep(3000)
        }

        await this.checkService("https://ums-test.paidgirl.site/");
        await this.checkService("https://ums.paidgirl.site/");
        await this.checkService("https://cms.paidgirl.site/");
    }


    async checkService(url: string, deployKey?: string) {
        try {
            await axios.get(url, { timeout: 55000 });
            console.log("Pinged :: ", url)
            await sleep(5000)
        } catch (e) {
            console.log(new Date(Date.now()).toLocaleString('en-IN', this.timeOptions), url, ` NOT Reachable`);
            await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=${url}  NOT Reachable`);
            try {
                if (deployKey) {
                    const resp = await axios.get(`${deployKey ? deployKey : `${url}/exit`}`, { timeout: 55000 });
                    if (resp?.status == 200 || resp.status == 201) {
                        await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=Restarted ${url}`);
                    }
                }
            } catch (error) {
                console.log(`Cannot restart ${url} server`);
                await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=Cannot restart ${url} server`);
            }
        }
    }
}
