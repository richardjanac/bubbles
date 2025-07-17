import { GameState, PlayerBubble, NPCBubble } from '../types/game';

export class MessageOptimizer {
  
  // Komprimuj čísla na 2 desatinné miesta
  private static roundNumber(num: number): number {
    return Math.round(num * 100) / 100;
  }
  
  // Optimalizuj pozíciu - zaokrúhli na celé čísla
  private static optimizePosition(pos: { x: number; y: number }) {
    return {
      x: Math.round(pos.x),
      y: Math.round(pos.y)
    };
  }
  
  // Optimalizuj hráča - odstráň nepotrebné polia
  static optimizePlayer(player: PlayerBubble): any {
    return {
      id: player.id,
      n: player.nickname, // Skrátené názvy polí
      s: player.score,
      l: player.level,
      p: this.optimizePosition(player.position),
      v: player.velocity ? {
        x: Math.round(player.velocity.x),
        y: Math.round(player.velocity.y)
      } : undefined,
      r: Math.round(player.radius!),
      b: player.isBot ? 1 : undefined, // Použi 1 miesto true
      i: player.isInvulnerable ? 1 : undefined
    };
  }
  
  // Optimalizuj NPC - ešte viac zjednodušené
  static optimizeNPC(npc: NPCBubble): any {
    return {
      i: npc.id.substring(0, 8), // Skráť ID
      p: this.optimizePosition(npc.position),
      s: npc.score
    };
  }
  
  // Optimalizuj celý game state
  static optimizeGameState(state: GameState): any {
    const optimized: any = {
      p: {}, // players
      n: {}, // npcs
      w: state.worldSize // world size sa nemení, môže ostať
    };
    
    // Optimalizuj hráčov
    for (const id in state.players) {
      optimized.p[id] = this.optimizePlayer(state.players[id]);
    }
    
    // Optimalizuj NPC
    for (const id in state.npcBubbles) {
      // Použi skrátené ID ako kľúč
      const shortId = id.substring(0, 8);
      optimized.n[shortId] = this.optimizeNPC(state.npcBubbles[id]);
    }
    
    return optimized;
  }
  
  // Dekóduj optimalizovaný game state späť
  static decodeGameState(optimized: any): GameState {
    const state: GameState = {
      players: {},
      npcBubbles: {},
      worldSize: optimized.w
    };
    
    // Dekóduj hráčov
    for (const id in optimized.p) {
      const p = optimized.p[id];
      state.players[id] = {
        id: p.id,
        nickname: p.n,
        score: p.s,
        level: p.l,
        position: p.p,
        velocity: p.v,
        radius: p.r,
        baseSpeed: 0, // Vypočíta sa na klientovi
        isBot: p.b === 1,
        isInvulnerable: p.i === 1
      };
    }
    
    // Dekóduj NPC
    for (const shortId in optimized.n) {
      const n = optimized.n[shortId];
      // Rekonštruuj plné ID
      const fullId = n.i + '_restored';
      state.npcBubbles[fullId] = {
        id: fullId,
        position: n.p,
        score: n.s
      };
    }
    
    return state;
  }
  
  // Optimalizuj delta update
  static optimizeDelta(delta: any): any {
    const optimized: any = {
      t: delta.timestamp
    };
    
    if (delta.fullState) {
      optimized.f = this.optimizeGameState(delta.fullState);
    }
    
    if (delta.players) {
      optimized.p = {};
      
      if (delta.players.added) {
        optimized.p.a = {};
        for (const id in delta.players.added) {
          optimized.p.a[id] = this.optimizePlayer(delta.players.added[id]);
        }
      }
      
      if (delta.players.updated) {
        optimized.p.u = {};
        for (const id in delta.players.updated) {
          const update = delta.players.updated[id];
          const opt: any = {};
          
          if (update.position) opt.p = this.optimizePosition(update.position);
          if (update.velocity) opt.v = {
            x: Math.round(update.velocity.x),
            y: Math.round(update.velocity.y)
          };
          if (update.score !== undefined) opt.s = update.score;
          if (update.level !== undefined) opt.l = update.level;
          if (update.isInvulnerable !== undefined) opt.i = update.isInvulnerable ? 1 : 0;
          
          optimized.p.u[id] = opt;
        }
      }
      
      if (delta.players.removed) {
        optimized.p.r = delta.players.removed;
      }
    }
    
    if (delta.npcs) {
      optimized.n = {};
      
      if (delta.npcs.added) {
        optimized.n.a = {};
        for (const id in delta.npcs.added) {
          const shortId = id.substring(0, 8);
          optimized.n.a[shortId] = this.optimizeNPC(delta.npcs.added[id]);
        }
      }
      
      if (delta.npcs.removed) {
        optimized.n.r = delta.npcs.removed.map((id: string) => id.substring(0, 8));
      }
    }
    
    return optimized;
  }
} 