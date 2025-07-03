// Typy pre hru Paddock Bubbles

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
}

// Bot bublina - identická s hráčskou, ale s príznakom isBot
export type BotBubble = PlayerBubble & { isBot: true };

// NPC bublina (jedlo)
export interface NPCBubble extends TargetableEntity {
  id: string;
  score: number; // vždy 1
  position: Vector2;
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
  playerJoined: (player: PlayerBubble) => void;
  playerLeft: (playerId: string) => void;
  bubblePopped: (bubbleId: string) => void;
  levelUp: (playerId: string, newLevel: number) => void;
}

export interface ClientToServerEvents {
  join: (nickname: string) => void;
  updateInput: (input: PlayerInput) => void;
  leave: () => void;
}

// Konštanty hry
export const GAME_CONSTANTS = {
  MIN_PLAYERS: 10,
  STARTING_SCORE: 100,
  STARTING_LEVEL: 1,
  BASE_SPEED: 100, // pixely za sekundu
  TURBO_MULTIPLIER: 2,
  TURBO_DRAIN_RATE: 50, // bodov za sekundu
  MIN_TURBO_SCORE: 5,
  COLLISION_OVERLAP: 2, // pixely
  PARTICLE_LIFETIME: 30, // sekúnd
  NPC_BUBBLE_SCORE: 1,
  LEVEL_UP_BASE: 400,
  LEVEL_UP_INCREMENT: 100,
  SPEED_LEVEL_MULTIPLIER: 1.5,
};

// Helper funkcie
export function calculateRadius(score: number): number {
  const baseRadius = 10; // polomer pre score = 1
  return baseRadius * Math.sqrt(score);
}

export function calculateLevelUpScore(currentLevel: number): number {
  return GAME_CONSTANTS.LEVEL_UP_BASE + (currentLevel * GAME_CONSTANTS.LEVEL_UP_INCREMENT);
}

export function getLevelColor(level: number): string {
  const colors = [
    '#FFFFFF', // Level 1 - biela
    '#FFFACD', // Level 2 - svetložltá
    '#FFDAB9', // Level 3 - svetlooranžová
    '#FFB6C1', // Level 4 - svetloružová
    '#E6E6FA', // Level 5 - lavender
    '#B0E0E6', // Level 6 - powder blue
    '#98FB98', // Level 7 - pale green
    '#DDA0DD', // Level 8 - plum
    '#F0E68C', // Level 9 - khaki
    '#87CEEB', // Level 10 - sky blue
  ];
  return colors[(level - 1) % colors.length];
} 