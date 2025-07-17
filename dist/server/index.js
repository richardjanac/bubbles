"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gameServer_1 = require("./gameServer");
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
console.log(`Spúšťam game server na porte ${port}`);
console.log(`Current working directory: ${process.cwd()}`);
console.log(`Script directory: ${__dirname}`);
const gameServer = new gameServer_1.GameServer(port);
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Dostali sme SIGTERM, zastavujem server...');
    gameServer.stop();
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('Dostali sme SIGINT, zastavujem server...');
    gameServer.stop();
    process.exit(0);
});
