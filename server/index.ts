import { GameServer } from './gameServer';
import * as path from 'path';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// =================================================================
// RAILWAY FORCE UPDATE - VERZIA Z DŇHA 17.7.2025 o 15:30
// TENTO KOMENTÁR ZABEZPEČÍ ŽE RAILWAY NEBUDE IGNOROVAŤ ZMENY!
// BOT TURBO OPRAVY MUSIA BYŤ NASADENÉ!
// =================================================================

console.log(`Spúšťam game server na porte ${port}`);
console.log(`🔥🔥🔥 SUPER NOVÁ VERZIA! 17.7.2025 15:30 🔥🔥🔥`);
console.log(`🚀🚀🚀 NOVÁ VERZIA S BOT TURBO! Timestamp: ${Date.now()} 🚀🚀🚀`);
console.log(`Current working directory: ${process.cwd()}`);
console.log(`Script directory: ${__dirname}`);
console.log(`🤖 BOT TURBO OPRAVY SÚ AKTIVOVANÉ - COMMIT fbe0ad3`);
console.log(`🎯 RAILWAY FORCE DEPLOY - IGNORE CACHE!`);

const gameServer = new GameServer(port);

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
