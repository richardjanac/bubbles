import { GameState, PlayerBubble, NPCBubble } from '../types/game';
import { DeltaUpdate } from '../server/deltaCompression';

export class DeltaHandler {
  private currentState: GameState | null = null;
  
  // Aplikuj delta update na súčasný stav
  applyDelta(delta: DeltaUpdate): GameState | null {
    // Ak máme full state, použi ho
    if (delta.fullState) {
      this.currentState = delta.fullState;
      return this.currentState;
    }
    
    // Ak nemáme súčasný stav, nemôžeme aplikovať delta
    if (!this.currentState) {
      console.warn('Received delta update without current state');
      return null;
    }
    
    // Vytvor kópiu súčasného stavu
    const newState: GameState = {
      players: { ...this.currentState.players },
      npcBubbles: { ...this.currentState.npcBubbles },
      worldSize: this.currentState.worldSize
    };
    
    // Aplikuj zmeny hráčov
    if (delta.players) {
      // Pridaj nových hráčov
      if (delta.players.added) {
        for (const id in delta.players.added) {
          newState.players[id] = delta.players.added[id];
        }
      }
      
      // Aktualizuj existujúcich hráčov
      if (delta.players.updated) {
        for (const id in delta.players.updated) {
          if (newState.players[id]) {
            // Aplikuj len zmeny
            newState.players[id] = {
              ...newState.players[id],
              ...delta.players.updated[id]
            };
          }
        }
      }
      
      // Odstráň hráčov
      if (delta.players.removed) {
        for (const id of delta.players.removed) {
          delete newState.players[id];
        }
      }
    }
    
    // Aplikuj zmeny NPC
    if (delta.npcs) {
      // Pridaj nové NPC
      if (delta.npcs.added) {
        for (const id in delta.npcs.added) {
          newState.npcBubbles[id] = delta.npcs.added[id];
        }
      }
      
      // Odstráň NPC
      if (delta.npcs.removed) {
        for (const id of delta.npcs.removed) {
          delete newState.npcBubbles[id];
        }
      }
    }
    
    this.currentState = newState;
    return newState;
  }
  
  // Získaj súčasný stav
  getCurrentState(): GameState | null {
    return this.currentState;
  }
  
  // Reset stavu
  reset() {
    this.currentState = null;
  }
} 