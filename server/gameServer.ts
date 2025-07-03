import { Server } from 'socket.io';
import { createServer } from 'http';
import { 
  PlayerBubble, 
  NPCBubble, 
  GameState,
  PlayerInput,
  ServerToClientEvents,
  ClientToServerEvents,
  Vector2,
  GAME_CONSTANTS,
  calculateRadius,
  calculateLevelUpScore,
  getLevelColor
} from '../types/game';

// Herný server
export class GameServer {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private httpServer;
  private gameState: GameState;
  private lastUpdateTime: number = Date.now();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(port: number = 3001) {
    this.httpServer = createServer();
    this.io = new Server(this.httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.gameState = {
      players: {},
      npcBubbles: {},
      worldSize: { width: 2000, height: 2000 }
    };

    this.setupSocketHandlers();
    this.startGameLoop();
    
    this.httpServer.listen(port, () => {
      console.log(`Game server beží na porte ${port}`);
      // Generuj NPC bubliny hneď po štarte
      this.generateNPCBubbles();
    });
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Hráč sa pripojil:', socket.id);

      socket.on('join', (nickname: string) => {
        const player = this.createPlayer(socket.id, nickname);
        this.gameState.players[socket.id] = player;
        
        // Ak je to prvý hráč, pridaj botov
        if (Object.keys(this.gameState.players).length === 1) {
          this.ensureMinimumPlayers();
        }

        socket.emit('gameState', this.serializeGameState());
        this.io.emit('playerJoined', player);
        console.log('Poslal som gameState, počet hráčov:', Object.keys(this.gameState.players).length);
        console.log('Počet NPC bublín:', Object.keys(this.gameState.npcBubbles).length);
      });

      socket.on('updateInput', (input: PlayerInput) => {
        const player = this.gameState.players[socket.id];
        if (player) {
          this.updatePlayerInput(player, input);
        }
      });

      socket.on('disconnect', () => {
        delete this.gameState.players[socket.id];
        this.io.emit('playerLeft', socket.id);
        console.log('Hráč sa odpojil:', socket.id);
        
        // Nepridávame botov pri disconnect - len pri kolízii
      });
    });
  }

  private createPlayer(id: string, nickname: string, isBot: boolean = false): PlayerBubble {
    const position = this.getRandomPosition();
    return {
      id,
      nickname: isBot ? `Bot ${Math.floor(Math.random() * 1000)}` : nickname,
      score: GAME_CONSTANTS.STARTING_SCORE,
      level: GAME_CONSTANTS.STARTING_LEVEL,
      baseSpeed: GAME_CONSTANTS.BASE_SPEED,
      position,
      velocity: { x: 0, y: 0 },
      color: getLevelColor(1),
      radius: calculateRadius(GAME_CONSTANTS.STARTING_SCORE),
      isBot
    };
  }

  private createBot(): PlayerBubble {
    const botId = `bot_${Date.now()}_${Math.random()}`;
    return this.createPlayer(botId, '', true);
  }

  private ensureMinimumPlayers() {
    const currentPlayers = Object.keys(this.gameState.players).length;
    const botsNeeded = Math.max(0, GAME_CONSTANTS.MIN_PLAYERS - currentPlayers);
    
    for (let i = 0; i < botsNeeded; i++) {
      const bot = this.createBot();
      this.gameState.players[bot.id] = bot;
    }
  }

  private generateNPCBubbles() {
    // Generuj NPC bubliny ak je ich málo
    const targetNPCs = Math.floor(this.gameState.worldSize.width * this.gameState.worldSize.height / 10000);
    const currentNPCs = Object.keys(this.gameState.npcBubbles).length;
    
    // Odstránený debug výpis
    
    for (let i = currentNPCs; i < targetNPCs; i++) {
      const npc: NPCBubble = {
        id: `npc_${Date.now()}_${Math.random()}`,
        score: GAME_CONSTANTS.NPC_BUBBLE_SCORE,
        position: this.getRandomPosition()
      };
      this.gameState.npcBubbles[npc.id] = npc;
    }
  }

  private getRandomPosition(): Vector2 {
    return {
      x: Math.random() * this.gameState.worldSize.width,
      y: Math.random() * this.gameState.worldSize.height
    };
  }

  private updatePlayerInput(player: PlayerBubble, input: PlayerInput) {
    // Vypočítaj smer k cieľu
    const dx = input.position.x - player.position.x;
    const dy = input.position.y - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Uložíme turbo stav do player objektu
    (player as any).turboActive = input.turbo;
    
    if (distance > 0) {
      // Normalizuj vektor smeru
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Nastav rýchlosť
      const speed = input.turbo && player.score > GAME_CONSTANTS.MIN_TURBO_SCORE
        ? player.baseSpeed * GAME_CONSTANTS.TURBO_MULTIPLIER
        : player.baseSpeed;
      
      player.velocity = {
        x: dirX * speed,
        y: dirY * speed
      };
    } else {
      player.velocity = { x: 0, y: 0 };
    }
  }

  private updateBotAI(bot: PlayerBubble, deltaTime: number) {
    // Jednoduchá AI pre botov: Nájdi najbližšiu korisť
    let bestTarget: (PlayerBubble | NPCBubble) | null = null;
    let nearestDistance = Infinity;

    // Spoj všetkých hráčov a NPC do jedného zoznamu cieľov
    const allTargets: (PlayerBubble | NPCBubble)[] = [
      ...Object.values(this.gameState.players),
      ...Object.values(this.gameState.npcBubbles)
    ];

    for (const target of allTargets) {
      // Bot nemôže zjesť sám seba (dôležitá kontrola)
      if (target.id === bot.id) {
        continue;
      }

      // Bot útočí len na menšie ciele
      if (target.score < bot.score) {
        const distance = this.getDistance(bot.position, target.position);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          bestTarget = target;
        }
      }
    }

    // Ak máme cieľ, pohybuj sa k nemu
    if (bestTarget !== null) {
      const input: PlayerInput = {
        position: bestTarget.position,
        turbo: nearestDistance < 200 && bot.score > GAME_CONSTANTS.MIN_TURBO_SCORE * 2
      };
      this.updatePlayerInput(bot, input);
    }
  }

  private getDistance(a: Vector2, b: Vector2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private checkCollisions() {
    // Kontrola kolízií medzi hráčmi
    const players = Object.values(this.gameState.players);
    const playersToRemove: string[] = [];
    
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const playerA = players[i];
        const playerB = players[j];
        
        // Preskočiť ak už bol hráč odstránený
        if (playersToRemove.includes(playerA.id) || playersToRemove.includes(playerB.id)) {
          continue;
        }
        
        const distance = this.getDistance(playerA.position, playerB.position);
        const minDistance = playerA.radius! + playerB.radius! - GAME_CONSTANTS.COLLISION_OVERLAP;
        
        if (distance < minDistance) {
          const loser = playerA.score > playerB.score ? playerB : playerA;
          playersToRemove.push(loser.id);
          this.handlePlayerCollision(playerA, playerB);
        }
      }
    }

    // Kontrola kolízií s NPC bublinami
    players.forEach(player => {
      Object.entries(this.gameState.npcBubbles).forEach(([npcId, npc]) => {
        const distance = this.getDistance(player.position, npc.position);
        const npcRadius = calculateRadius(npc.score);
        const minDistance = player.radius! + npcRadius;
        
        if (distance < minDistance) {
          // Hráč zje NPC bublinu
          player.score += npc.score;
          player.radius = calculateRadius(player.score);
          delete this.gameState.npcBubbles[npcId];
          
          // Skontroluj level up
          this.checkLevelUp(player);
        }
      });
    });
  }

  private handlePlayerCollision(playerA: PlayerBubble, playerB: PlayerBubble) {
    if (playerA.score === playerB.score) {
      // Rovnaké skóre, nič sa nedeje
      return;
    }

    const winner = playerA.score > playerB.score ? playerA : playerB;
    const loser = playerA.score > playerB.score ? playerB : playerA;

    // Vytvor NPC bubliny z porazeného hráča
    this.createNpcBubblesFromPlayer(loser.position, loser.score);

    // Odstráň porazeného hráča
    delete this.gameState.players[loser.id];
    this.io.emit('bubblePopped', loser.id);

    // Ak to bol bot, pridaj nového len ak je menej ako minimum hráčov
    if (loser.isBot) {
      const humanPlayers = Object.values(this.gameState.players).filter(p => !p.isBot).length;
      const totalPlayers = Object.keys(this.gameState.players).length;
      
      // Pridaj nového bota len ak je menej ako minimum
      if (totalPlayers < GAME_CONSTANTS.MIN_PLAYERS && humanPlayers > 0) {
        const newBot = this.createBot();
        this.gameState.players[newBot.id] = newBot;
      }
    }
  }

  private createNpcBubblesFromPlayer(position: Vector2, score: number): void {
    const bubblesToCreate = Math.floor(score);
    for (let i = 0; i < bubblesToCreate; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * calculateRadius(score);
      const newPos = {
        x: position.x + Math.cos(angle) * distance,
        y: position.y + Math.sin(angle) * distance,
      };

      const npc: NPCBubble = {
        id: `npc_from_player_${Date.now()}_${Math.random()}`,
        score: GAME_CONSTANTS.NPC_BUBBLE_SCORE,
        position: newPos,
      };
      this.gameState.npcBubbles[npc.id] = npc;
    }
  }

  private checkLevelUp(player: PlayerBubble) {
    const requiredScore = calculateLevelUpScore(player.level);
    
    if (player.score >= requiredScore) {
      // Level up!
      player.level++;
      player.score = GAME_CONSTANTS.STARTING_SCORE;
      player.baseSpeed *= GAME_CONSTANTS.SPEED_LEVEL_MULTIPLIER;
      player.color = getLevelColor(player.level);
      player.radius = calculateRadius(player.score);
      
      this.io.emit('levelUp', player.id, player.level);
    }
  }

  private updateTurbo(player: PlayerBubble, deltaTime: number, isTurboActive: boolean) {
    if (isTurboActive && player.score > GAME_CONSTANTS.MIN_TURBO_SCORE) {
      const scoreToDrain = Math.floor(GAME_CONSTANTS.TURBO_DRAIN_RATE * deltaTime);
      
      for (let i = 0; i < scoreToDrain; i++) {
        player.score = Math.max(GAME_CONSTANTS.MIN_TURBO_SCORE, player.score - 1);
      }
      
      player.radius = calculateRadius(player.score);
    }
  }

  private updatePhysics(deltaTime: number) {
    // Aktualizuj pozície hráčov
    Object.values(this.gameState.players).forEach(player => {
      player.position.x += player.velocity.x * deltaTime;
      player.position.y += player.velocity.y * deltaTime;
      
      // Udržuj hráčov v hraniciach mapy
      player.position.x = Math.max(player.radius!, Math.min(this.gameState.worldSize.width - player.radius!, player.position.x));
      player.position.y = Math.max(player.radius!, Math.min(this.gameState.worldSize.height - player.radius!, player.position.y));
    });
  }

  private serializeGameState(): GameState {
    // Už máme objekty, nie Map, takže len vrátime gameState
    return {
      players: this.gameState.players,
      npcBubbles: this.gameState.npcBubbles,
      worldSize: this.gameState.worldSize
    };
  }

  private startGameLoop() {
    this.updateInterval = setInterval(() => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // v sekundách
      this.lastUpdateTime = currentTime;

      // Aktualizuj AI botov
      Object.values(this.gameState.players).forEach(player => {
        if (player.isBot) {
          this.updateBotAI(player, deltaTime);
        }
        
        // Aplikuj turbo mechaniku pre všetkých hráčov
        const turboActive = (player as any).turboActive || false;
        this.updateTurbo(player, deltaTime, turboActive);
      });

      // Aktualizuj fyziku
      this.updatePhysics(deltaTime);

      // Kontroluj kolízie
      this.checkCollisions();

      // Generuj NPC bubliny
      this.generateNPCBubbles();

      // Pošli aktualizovaný stav všetkým klientom
      this.io.emit('gameState', this.serializeGameState());
    }, 1000 / 60); // 60 FPS
  }

  public stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.httpServer.close();
  }
}

// Spusti server ak je tento súbor spustený priamo
if (require.main === module) {
  new GameServer();
} 