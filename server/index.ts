import { GameServer } from './gameServer';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

console.log(`Spúšťam game server na porte ${port}`);

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