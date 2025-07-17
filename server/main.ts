import { GameServer } from './gameServer';
import * as path from 'path';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

console.log(`Game server starting on port ${port}`);

const gameServer = new GameServer(port);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  gameServer.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  gameServer.stop();
  process.exit(0);
});
