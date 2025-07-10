// Typy pre hru Paddock Bubbles

// Import herných nastavení z centrálneho súboru
export { 
  GAME_CONSTANTS,
  GAME_SETTINGS,
  calculateRadius,
  calculateLevelUpScore,
  calculatePlayerSpeed,
  getLevelColor
} from '../config/gameSettings';

// Základné typy
export interface Vector2 {
  x: number;
  y: number;
}

// Spoločný interface pre všetky entity, na ktoré môže AI cieliť
export interface TargetableEntity {
  position: Vector2;
  score: number;
}

// Hráčska bublina
export interface PlayerBubble extends TargetableEntity {
  id: string;
  nickname: string;
  level: number;
  baseSpeed: number;
  velocity: Vector2;
  color?: string;
  radius?: number;
  isBot?: boolean;
  spawnTime?: number; // Čas spawn-u v milisekundách
  isInvulnerable?: boolean; // Či je hráč chránený
}

// Bot bublina - identická s hráčskou, ale s príznakom isBot
export type BotBubble = PlayerBubble & { isBot: true };

// NPC bublina (jedlo)
export interface NPCBubble extends TargetableEntity {
  id: string;
}

// Herný stav
export interface GameState {
  players: { [key: string]: PlayerBubble };
  npcBubbles: { [key: string]: NPCBubble };
  worldSize: { width: number; height: number };
}

// Vstup od hráča
export interface PlayerInput {
  position: Vector2; // cieľová pozícia (myš alebo joystick)
  turbo: boolean;
}

// Socket.IO udalosti
export interface ServerToClientEvents {
  gameState: (state: GameState) => void;
  gameUpdate: (state: GameState) => void;
  playerJoined: (player: PlayerBubble) => void;
  playerLeft: (playerId: string) => void;
  bubblePopped: (bubbleId: string) => void;
  levelUp: (playerId: string, newLevel: number) => void;
  monthlyLeaderboard: (leaderboard: Array<{id: string, nickname: string, level: number, score: number}>) => void;
  leaderboardStats: (stats: {totalPlayers: number, topLevel: number, topScore: number}) => void;
  pong: (timestamp: number) => void;
}

export interface ClientToServerEvents {
  join: (nickname: string) => void;
  updateInput: (input: PlayerInput) => void;
  leave: () => void;
  getMonthlyLeaderboard: (limit?: number) => void;
  getLeaderboardStats: () => void;
  ping: (timestamp: number) => void;
} 