import { PlayerBubble, Vector2 } from '../types/game';

interface PositionSnapshot {
  timestamp: number;
  position: Vector2;
  velocity: Vector2;
}

export class LagCompensation {
  // História pozícií pre každého hráča
  private positionHistory: Map<string, PositionSnapshot[]> = new Map();
  private maxHistoryDuration = 1000; // 1 sekunda histórie
  private maxSnapshotsPerPlayer = 60; // Max 60 snapshots per hráč
  
  // Zaznamenaj pozíciu hráča
  recordPosition(playerId: string, position: Vector2, velocity: Vector2, timestamp: number) {
    if (!this.positionHistory.has(playerId)) {
      this.positionHistory.set(playerId, []);
    }
    
    const history = this.positionHistory.get(playerId)!;
    history.push({ timestamp, position: { ...position }, velocity: { ...velocity } });
    
    // Udržuj len relevantnú históriu
    this.cleanupHistory(playerId, timestamp);
  }
  
  // Získaj interpolovanú pozíciu hráča v minulosti
  getInterpolatedPosition(playerId: string, targetTime: number): Vector2 | null {
    const history = this.positionHistory.get(playerId);
    if (!history || history.length === 0) {
      return null;
    }
    
    // Ak je target time v budúcnosti alebo príliš v minulosti
    const now = Date.now();
    if (targetTime > now || targetTime < now - this.maxHistoryDuration) {
      return null;
    }
    
    // Nájdi dva snapshots okolo target time
    let before: PositionSnapshot | null = null;
    let after: PositionSnapshot | null = null;
    
    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].timestamp <= targetTime && history[i + 1].timestamp >= targetTime) {
        before = history[i];
        after = history[i + 1];
        break;
      }
    }
    
    // Ak nemáme dva body, použi najbližší
    if (!before || !after) {
      // Použi posledný známy snapshot pred target time
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].timestamp <= targetTime) {
          return { ...history[i].position };
        }
      }
      
      // Ak všetky snapshots sú po target time, použi prvý
      return history.length > 0 ? { ...history[0].position } : null;
    }
    
    // Interpoluj medzi dvoma snapshots
    const t = (targetTime - before.timestamp) / (after.timestamp - before.timestamp);
    return {
      x: before.position.x + (after.position.x - before.position.x) * t,
      y: before.position.y + (after.position.y - before.position.y) * t
    };
  }
  
  // Vyčisti starú históriu
  private cleanupHistory(playerId: string, currentTime: number) {
    const history = this.positionHistory.get(playerId);
    if (!history) return;
    
    // Odstráň staré snapshots
    const cutoffTime = currentTime - this.maxHistoryDuration;
    const filtered = history.filter(snapshot => snapshot.timestamp > cutoffTime);
    
    // Obmedz počet snapshots
    if (filtered.length > this.maxSnapshotsPerPlayer) {
      // Ponechaj len posledných N snapshots
      this.positionHistory.set(playerId, filtered.slice(-this.maxSnapshotsPerPlayer));
    } else {
      this.positionHistory.set(playerId, filtered);
    }
  }
  
  // Odstráň všetku históriu pre hráča
  removePlayer(playerId: string) {
    this.positionHistory.delete(playerId);
  }
  
  // Získaj všetkých hráčov v určitom čase (pre collision detection)
  getAllPlayersAtTime(players: { [key: string]: PlayerBubble }, targetTime: number): { [key: string]: PlayerBubble } {
    const compensatedPlayers: { [key: string]: PlayerBubble } = {};
    
    for (const playerId in players) {
      const historicalPosition = this.getInterpolatedPosition(playerId, targetTime);
      
      if (historicalPosition) {
        compensatedPlayers[playerId] = {
          ...players[playerId],
          position: historicalPosition
        };
      } else {
        // Ak nemáme históriu, použi súčasnú pozíciu
        compensatedPlayers[playerId] = players[playerId];
      }
    }
    
    return compensatedPlayers;
  }
} 