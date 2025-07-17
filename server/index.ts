import { GameServer } from './gameServer';
import * as path from 'path';
import * as fs from 'fs';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// =================================================================
// RAILWAY FORCE UPDATE - VERZIA Z DŇHA 17.7.2025 o 15:30
// TENTO KOMENTÁR ZABEZPEČÍ ŽE RAILWAY NEBUDE IGNOROVAŤ ZMENY!
// BOT TURBO OPRAVY MUSIA BYŤ NASADENÉ!
// COMPILED AT: __COMPILE_TIME_PLACEHOLDER__
// =================================================================

// OVERENIE ŽE RAILWAY MÁ NAJNOVŠÍ KÓD
try {
  const forceUpdateFile = fs.readFileSync(path.join(process.cwd(), 'RAILWAY_FORCE_UPDATE.txt'), 'utf8');
  console.log('✅ RAILWAY_FORCE_UPDATE.txt nájdený - kód je aktuálny!');
  console.log(forceUpdateFile.split('\n')[0]); // Prvý riadok s timestampom
} catch (error) {
  console.log('❌ RAILWAY_FORCE_UPDATE.txt CHÝBA - Railway používa starý kód!');
}

console.log(`Spúšťam game server na porte ${port}`);
console.log(`🔥🔥🔥 SUPER NOVÁ VERZIA! 17.7.2025 16:45 🔥🔥🔥`);
console.log(`🚀🚀🚀 NOVÁ VERZIA S BOT TURBO! Timestamp: ${Date.now()} 🚀🚀🚀`);
console.log(`Current working directory: ${process.cwd()}`);
console.log(`Script directory: ${__dirname}`);
console.log(`🤖 BOT TURBO OPRAVY SÚ AKTIVOVANÉ - COMMIT c6b0b4f`);
console.log(`🎯 RAILWAY FORCE DEPLOY - IGNORE CACHE!`);
console.log(`⏰ COMPILED: ${new Date().toISOString()}`);

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
