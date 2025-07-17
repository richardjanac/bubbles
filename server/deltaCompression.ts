import { GameState, PlayerBubble, NPCBubble } from '../types/game';

export interface DeltaUpdate {
  // Timestamp pre synchronizáciu
  timestamp: number;
  
  // Zmeny v hráčoch
  players?: {
    added?: { [id: string]: PlayerBubble };
    updated?: { [id: string]: Partial<PlayerBubble> };
    removed?: string[];
  };
  
  // Zmeny v NPC
  npcs?: {
    added?: { [id: string]: NPCBubble };
    removed?: string[];
  };
  
  // Celý state sa pošle len občas alebo pri reconnect
  fullState?: GameState;
}

export class DeltaCompressor {
  private lastSentState: Map<string, GameState> = new Map();
  private fullStateSendInterval = 10000; // Pošli full state každých 10 sekúnd
  private lastFullStateSend: Map<string, number> = new Map();
  
  // Vypočítaj delta medzi dvoma stavmi
  computeDelta(clientId: string, currentState: GameState, forceFullState: boolean = false): DeltaUpdate {
    const now = Date.now();
    const lastState = this.lastSentState.get(clientId);
    const lastFullSend = this.lastFullStateSend.get(clientId) || 0;
    
    // Pošli full state ak:
    // 1. Je to prvý update pre klienta
    // 2. Prešiel čas na pravidelný full update
    // 3. Je vynútený (napr. po reconnect)
    if (!lastState || forceFullState || (now - lastFullSend) > this.fullStateSendInterval) {
      this.lastSentState.set(clientId, JSON.parse(JSON.stringify(currentState)));
      this.lastFullStateSend.set(clientId, now);
      
      return {
        timestamp: now,
        fullState: currentState
      };
    }
    
    // Vypočítaj delta
    const delta: DeltaUpdate = {
      timestamp: now
    };
    
    // Porovnaj hráčov
    const playerDelta = this.computePlayerDelta(lastState.players, currentState.players);
    if (playerDelta) {
      delta.players = playerDelta;
    }
    
    // Porovnaj NPC
    const npcDelta = this.computeNPCDelta(lastState.npcBubbles, currentState.npcBubbles);
    if (npcDelta) {
      delta.npcs = npcDelta;
    }
    
    // Aktualizuj posledný odoslaný stav
    this.lastSentState.set(clientId, JSON.parse(JSON.stringify(currentState)));
    
    return delta;
  }
  
  private computePlayerDelta(
    oldPlayers: { [id: string]: PlayerBubble },
    newPlayers: { [id: string]: PlayerBubble }
  ) {
    const delta: any = {};
    
    // Nájdi pridaných hráčov
    const added: { [id: string]: PlayerBubble } = {};
    for (const id in newPlayers) {
      if (!oldPlayers[id]) {
        added[id] = newPlayers[id];
      }
    }
    if (Object.keys(added).length > 0) {
      delta.added = added;
    }
    
    // Nájdi aktualizovaných hráčov
    const updated: { [id: string]: Partial<PlayerBubble> } = {};
    for (const id in newPlayers) {
      if (oldPlayers[id]) {
        const changes = this.getPlayerChanges(oldPlayers[id], newPlayers[id]);
        if (Object.keys(changes).length > 0) {
          updated[id] = changes;
        }
      }
    }
    if (Object.keys(updated).length > 0) {
      delta.updated = updated;
    }
    
    // Nájdi odstránených hráčov
    const removed: string[] = [];
    for (const id in oldPlayers) {
      if (!newPlayers[id]) {
        removed.push(id);
      }
    }
    if (removed.length > 0) {
      delta.removed = removed;
    }
    
    return Object.keys(delta).length > 0 ? delta : null;
  }
  
  private getPlayerChanges(oldPlayer: PlayerBubble, newPlayer: PlayerBubble): Partial<PlayerBubble> {
    const changes: Partial<PlayerBubble> = {};
    
    // Pozícia - zaokrúhli na 2 desatinné miesta pre úsporu
    if (Math.abs(oldPlayer.position.x - newPlayer.position.x) > 0.01 ||
        Math.abs(oldPlayer.position.y - newPlayer.position.y) > 0.01) {
      changes.position = {
        x: Math.round(newPlayer.position.x * 100) / 100,
        y: Math.round(newPlayer.position.y * 100) / 100
      };
    }
    
    // Ostatné vlastnosti
    if (oldPlayer.score !== newPlayer.score) changes.score = newPlayer.score;
    if (oldPlayer.level !== newPlayer.level) changes.level = newPlayer.level;
    if (oldPlayer.nickname !== newPlayer.nickname) changes.nickname = newPlayer.nickname;
    if (oldPlayer.isInvulnerable !== newPlayer.isInvulnerable) changes.isInvulnerable = newPlayer.isInvulnerable;
    
    // Velocity len ak sa výrazne zmenila
    if (oldPlayer.velocity && newPlayer.velocity) {
      if (Math.abs(oldPlayer.velocity.x - newPlayer.velocity.x) > 10 ||
          Math.abs(oldPlayer.velocity.y - newPlayer.velocity.y) > 10) {
        changes.velocity = newPlayer.velocity;
      }
    }
    
    return changes;
  }
  
  private computeNPCDelta(
    oldNPCs: { [id: string]: NPCBubble },
    newNPCs: { [id: string]: NPCBubble }
  ) {
    const delta: any = {};
    
    // NPC sa nehýbu, takže stačí sledovať pridané/odstránené
    const added: { [id: string]: NPCBubble } = {};
    for (const id in newNPCs) {
      if (!oldNPCs[id]) {
        added[id] = newNPCs[id];
      }
    }
    if (Object.keys(added).length > 0) {
      delta.added = added;
    }
    
    const removed: string[] = [];
    for (const id in oldNPCs) {
      if (!newNPCs[id]) {
        removed.push(id);
      }
    }
    if (removed.length > 0) {
      delta.removed = removed;
    }
    
    return Object.keys(delta).length > 0 ? delta : null;
  }
  
  // Vyčisti dáta pre odpojených klientov
  removeClient(clientId: string) {
    this.lastSentState.delete(clientId);
    this.lastFullStateSend.delete(clientId);
  }
} 