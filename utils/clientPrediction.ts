import { PlayerBubble, Vector2, GAME_SETTINGS, calculatePlayerSpeed } from '../types/game';

// Buffer pre ukladanie server snapshots
export interface ServerSnapshot {
  timestamp: number;
  players: { [key: string]: PlayerBubble };
  serverTime: number;
}

// Predikovaná pozícia lokálneho hráča
export interface PredictedState {
  position: Vector2;
  velocity: Vector2;
  lastInputSequence: number;
}

// Input história pre server reconciliation
export interface InputCommand {
  sequence: number;
  input: {
    position: Vector2;
    turbo: boolean;
  };
  timestamp: number;
}

export class ClientPrediction {
  private snapshotBuffer: ServerSnapshot[] = [];
  private maxSnapshots = 120; // 2 sekundy pri 60 FPS
  private inputHistory: InputCommand[] = [];
  private maxInputHistory = 60; // 1 sekunda inputov
  private inputSequence = 0;
  private interpolationDelay = 100; // 100ms interpolation buffer

  // Pridaj server snapshot do bufferu
  addSnapshot(snapshot: ServerSnapshot) {
    this.snapshotBuffer.push(snapshot);
    
    // Udržuj len posledné snapshots
    if (this.snapshotBuffer.length > this.maxSnapshots) {
      this.snapshotBuffer.shift();
    }
  }

  // Získaj nasledujúce input sequence číslo
  getNextInputSequence(): number {
    return ++this.inputSequence;
  }

  // Ulož input do histórie
  addInputToHistory(command: InputCommand) {
    this.inputHistory.push(command);
    
    // Udržuj len poslednú históriu
    if (this.inputHistory.length > this.maxInputHistory) {
      this.inputHistory.shift();
    }
  }

  // Vypočítaj predikovanú pozíciu lokálneho hráča
  predictLocalPlayer(
    playerId: string, 
    serverState: PlayerBubble,
    currentTime: number
  ): PlayerBubble {
    // Kópia server state
    const predicted = { ...serverState };
    
    // Aplikuj všetky inputy od posledného server update
    const unacknowledgedInputs = this.inputHistory.filter(
      cmd => cmd.timestamp > (serverState as any).lastProcessedInput || 0
    );

    // Simuluj pohyb pre každý nepotvrdený input
    for (const cmd of unacknowledgedInputs) {
      const deltaTime = 0.016; // Predpokladaj 60 FPS
      predicted.position = this.simulateMovement(
        predicted,
        cmd.input,
        deltaTime
      );
    }

    return predicted;
  }

  // Simuluj pohyb hráča lokálne
  private simulateMovement(
    player: PlayerBubble,
    input: { position: Vector2; turbo: boolean },
    deltaTime: number
  ): Vector2 {
    const dx = input.position.x - player.position.x;
    const dy = input.position.y - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 5) {
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      const speed = calculatePlayerSpeed(player.level, player.score) * (input.turbo ? 2.0 : 1.0);
      const moveDistance = speed * deltaTime;
      
      return {
        x: player.position.x + dirX * moveDistance,
        y: player.position.y + dirY * moveDistance
      };
    }
    
    return player.position;
  }

  // Interpoluj pozície ostatných hráčov
  interpolateOtherPlayers(currentTime: number): { [key: string]: PlayerBubble } {
    const renderTime = currentTime - this.interpolationDelay;
    
    // Nájdi dva snapshots okolo render time
    let before: ServerSnapshot | null = null;
    let after: ServerSnapshot | null = null;
    
    for (let i = 0; i < this.snapshotBuffer.length - 1; i++) {
      if (this.snapshotBuffer[i].timestamp <= renderTime &&
          this.snapshotBuffer[i + 1].timestamp >= renderTime) {
        before = this.snapshotBuffer[i];
        after = this.snapshotBuffer[i + 1];
        break;
      }
    }
    
    if (!before || !after) {
      // Použi posledný známy snapshot
      const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1];
      return latest ? latest.players : {};
    }
    
    // Interpoluj medzi dvoma snapshots
    const interpolatedPlayers: { [key: string]: PlayerBubble } = {};
    const t = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
    
    // Interpoluj každého hráča
    for (const playerId in after.players) {
      if (before.players[playerId]) {
        const beforePlayer = before.players[playerId];
        const afterPlayer = after.players[playerId];
        
        interpolatedPlayers[playerId] = {
          ...afterPlayer,
          position: {
            x: beforePlayer.position.x + (afterPlayer.position.x - beforePlayer.position.x) * t,
            y: beforePlayer.position.y + (afterPlayer.position.y - beforePlayer.position.y) * t
          }
        };
      } else {
        // Nový hráč, použi jeho aktuálnu pozíciu
        interpolatedPlayers[playerId] = after.players[playerId];
      }
    }
    
    return interpolatedPlayers;
  }

  // Vyčisti staré dáta
  cleanup(currentTime: number) {
    // Odstráň staré snapshots (staršie ako 2 sekundy)
    this.snapshotBuffer = this.snapshotBuffer.filter(
      snapshot => currentTime - snapshot.timestamp < 2000
    );
    
    // Odstráň staré inputy (staršie ako 1 sekunda)
    this.inputHistory = this.inputHistory.filter(
      cmd => currentTime - cmd.timestamp < 1000
    );
  }
} 