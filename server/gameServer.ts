import { Server } from 'socket.io';
import { createServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { 
  PlayerBubble, 
  NPCBubble, 
  GameState,
  PlayerInput,
  ServerToClientEvents,
  ClientToServerEvents,
  Vector2,
  GAME_CONSTANTS,
  GAME_SETTINGS,
  calculateRadius,
  calculateLevelUpScore,
  calculatePlayerSpeed,
  getLevelColor
} from '../types/game';

// Interface pre mesačný leaderboard
interface MonthlyLeaderboardEntry {
  id: string;
  nickname: string;
  level: number;
  score: number;
  timestamp: number;
}

// Herný server
export class GameServer {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private httpServer;
  private gameState: GameState;
  private lastUpdateTime: number = Date.now();
  private updateInterval: NodeJS.Timeout | null = null;
  private monthlyLeaderboard: MonthlyLeaderboardEntry[] = [];
  private leaderboardPath: string;
  private isGameActive: boolean = false; // Nový flag pre aktívnosť hry
  private realPlayers: Set<string> = new Set(); // Track skutočných hráčov

  constructor(port: number = 3001) {
    this.httpServer = createServer((req, res) => {
      // Jednoduchý health check endpoint
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'OK', timestamp: new Date().toISOString() }));
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });
    
    this.io = new Server(this.httpServer, {
      cors: {
        origin: (origin, callback) => {
          const allowedOrigins = [
            'https://bubbles-nrl5.vercel.app',
            'http://localhost:3000', 
            'http://localhost:3001', 
            'http://localhost:3002'
          ];
          
          console.log(`🌐 CORS request from origin: ${origin}`);
          
          // Povol undefined origin (same-origin requests)
          if (!origin || allowedOrigins.includes(origin)) {
            console.log(`✅ CORS povolený pre: ${origin || 'same-origin'}`);
            callback(null, true);
          } else {
            console.log(`❌ CORS zamietnutý pre: ${origin}`);
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type']
      }
    });

    // Inicializuj mesačný leaderboard
    this.leaderboardPath = path.join(__dirname, 'monthlyLeaderboard.json');
    this.loadMonthlyLeaderboard();

    this.gameState = {
      players: {},
      npcBubbles: {},
      worldSize: { width: GAME_SETTINGS.WORLD_SIZE.WIDTH, height: GAME_SETTINGS.WORLD_SIZE.HEIGHT }
    };

    this.setupSocketHandlers();
    // NEŠTARTUJ herný loop automaticky - spustí sa len keď sa pripojí skutočný hráč
    
    this.httpServer.listen(port, '0.0.0.0', () => {
      console.log(`Game server beží na porte ${port}`);
      console.log(`CORS povolený pre domains`);
      console.log(`Environment: NODE_ENV=${process.env.NODE_ENV}`);
      console.log(`Health check dostupný na: http://localhost:${port}/health`);
      console.log(`Server v režime čakania - hra sa spustí pri prvom pripojení skutočného hráča`);
    });
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Hráč sa pripojil:', socket.id);

      socket.on('join', (nickname: string) => {
        const player = this.createPlayer(socket.id, nickname);
        this.gameState.players[socket.id] = player;
        
        // Pridaj do zoznamu skutočných hráčov
        this.realPlayers.add(socket.id);
        console.log(`👤 Pripojil sa skutočný hráč: ${nickname} (${socket.id})`);
        console.log(`📊 Aktuálne: ${this.realPlayers.size} skutočných hráčov, ${Object.keys(this.gameState.players).length} celkom`);
        
        // Ak je to prvý skutočný hráč, aktivuj hru
        if (this.realPlayers.size === 1 && !this.isGameActive) {
          this.activateGame();
        }
        
        // Zabezpeč minimálne hráčov
        this.ensureMinimumPlayers();

        socket.emit('gameState', this.serializeGameState());
        this.io.emit('playerJoined', player);
      });

      socket.on('updateInput', (input: PlayerInput) => {
        const player = this.gameState.players[socket.id];
        if (player) {
          this.updatePlayerInput(player, input);
        }
      });

      socket.on('getMonthlyLeaderboard', (limit?: number) => {
        socket.emit('monthlyLeaderboard', this.getMonthlyLeaderboard(limit || 10));
      });

      socket.on('getLeaderboardStats', () => {
        socket.emit('leaderboardStats', this.getMonthlyLeaderboardStats());
      });

      socket.on('disconnect', () => {
        const wasRealPlayer = this.realPlayers.has(socket.id);
        const player = this.gameState.players[socket.id];
        
        if (wasRealPlayer) {
          this.realPlayers.delete(socket.id);
          console.log(`👋 Odpojil sa skutočný hráč: ${player?.nickname || 'Neznámy'} (${socket.id})`);
          console.log(`📊 Zostáva: ${this.realPlayers.size} skutočných hráčov`);
          
          // Ak sa odpojil posledný skutočný hráč, deaktivuj hru
          if (this.realPlayers.size === 0 && this.isGameActive) {
            this.deactivateGame();
          }
        }
        
        delete this.gameState.players[socket.id];
        this.io.emit('playerLeft', socket.id);
        
        // Zabezpeč minimálny počet hráčov len ak hra beží
        if (this.isGameActive) {
          this.ensureMinimumPlayers();
        }
      });
    });
  }

  private createPlayer(id: string, nickname: string, isBot: boolean = false): PlayerBubble {
    const position = this.getRandomPosition();
    const currentTime = Date.now();
    const startingLevel = GAME_CONSTANTS.STARTING_LEVEL;
    const startingScore = GAME_CONSTANTS.STARTING_SCORE;
    // Vypočítaj počiatočnú rýchlosť pomocou novej funkcie
    const baseSpeed = calculatePlayerSpeed(startingLevel, startingScore);
    
    // Slovenské mená pre botov
    const slovakNames = [
      'Marek', 'Peter', 'Jozef', 'Ján', 'Michal', 'František', 'Martin', 'Tomáš',
      'Pavol', 'Ľuboš', 'Miroslav', 'Dušan', 'Vladimír', 'Róbert', 'Stanislav', 'Igor',
      'Mária', 'Anna', 'Elena', 'Katarína', 'Marta', 'Eva', 'Zuzana', 'Viera',
      'Jana', 'Alžbeta', 'Monika', 'Gabriela', 'Andrea', 'Lucia', 'Daniela', 'Iveta'
    ];
    
    const botName = isBot ? slovakNames[Math.floor(Math.random() * slovakNames.length)] : nickname;
    
    return {
      id,
      nickname: botName,
      score: startingScore,
      level: startingLevel,
      baseSpeed: baseSpeed,
      position,
      velocity: { x: 0, y: 0 },
      color: getLevelColor(startingLevel),
      radius: calculateRadius(startingScore),
      isBot,
      spawnTime: currentTime,
      isInvulnerable: true
    };
  }

  private createBot(): PlayerBubble {
    const botId = `bot_${Date.now()}_${Math.random()}`;
    return this.createPlayer(botId, '', true);
  }

  private activateGame() {
    if (this.isGameActive) return;
    
    this.isGameActive = true;
    console.log('🎮 Aktivujem hru - prvý skutočný hráč sa pripojil!');
    
    // Generuj NPC bubliny
    this.generateNPCBubbles();
    
    // Spusti herný loop
    this.startGameLoop();
    
    // Zabezpeč minimálny počet hráčov
    this.ensureMinimumPlayers();
  }

  private deactivateGame() {
    if (!this.isGameActive) return;
    
    this.isGameActive = false;
    console.log('🛑 Posledný skutočný hráč sa odpojil - deaktivujem hru');
    
    // Zastav herný loop
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Vyčisti všetkých botov
    const botIds = Object.keys(this.gameState.players).filter(id => 
      this.gameState.players[id].isBot
    );
    
    botIds.forEach(botId => {
      delete this.gameState.players[botId];
    });
    
    // Vyčisti NPC bubliny
    this.gameState.npcBubbles = {};
    
    console.log(`🤖 Vyčistených ${botIds.length} neaktívnych botov - žiadni skutoční hráči`);
  }

  private ensureMinimumPlayers() {
    // Zabezpeč minimálny počet hráčov len ak hra beží
    if (!this.isGameActive) return;
    
    const currentPlayers = Object.keys(this.gameState.players).length;
    const botsNeeded = Math.max(0, GAME_CONSTANTS.MIN_PLAYERS - currentPlayers);
    
    if (botsNeeded > 0) {
      console.log(`Pridávam ${botsNeeded} botov (aktuálne: ${currentPlayers}, potrebných: ${GAME_CONSTANTS.MIN_PLAYERS})`);
    }
    
    for (let i = 0; i < botsNeeded; i++) {
      const bot = this.createBot();
      this.gameState.players[bot.id] = bot;
      console.log(`Pridaný bot: ${bot.nickname} (${bot.id})`);
    }
  }

  private generateNPCBubbles() {
    // Generuj NPC bubliny ak je ich málo
    const targetNPCs = Math.floor(this.gameState.worldSize.width * this.gameState.worldSize.height / GAME_SETTINGS.NPC_DENSITY);
    const currentNPCs = Object.keys(this.gameState.npcBubbles).length;
    
    // Odstránený debug výpis
    
    for (let i = currentNPCs; i < targetNPCs; i++) {
      const npc: NPCBubble = {
        id: `npc_${Date.now()}_${Math.random()}`,
        score: GAME_CONSTANTS.NPC_BUBBLE_SCORE,
        position: this.getRandomPositionForNPC()
      };
      this.gameState.npcBubbles[npc.id] = npc;
    }
  }

  private getRandomPositionForNPC(): Vector2 {
    // Pre NPC bubliny použij jednoduchú náhodnú pozíciu (bez kontroly kolízií pre lepšiu výkonnosť)
    return {
      x: Math.random() * this.gameState.worldSize.width,
      y: Math.random() * this.gameState.worldSize.height
    };
  }

  private getRandomPosition(): Vector2 {
    const maxAttempts = 50; // Maximálne 50 pokusov na nájdenie voľného miesta
    const minDistanceFromPlayers = 150; // Minimálna vzdialenosť od iných hráčov
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generuj náhodnú pozíciu s ohradom na okraje mapy
      const margin = 100; // 100px od okraja
      const position: Vector2 = {
        x: margin + Math.random() * (this.gameState.worldSize.width - 2 * margin),
        y: margin + Math.random() * (this.gameState.worldSize.height - 2 * margin)
      };
      
      // Skontroluj kolízie s existujúcimi hráčmi
      let isSafe = true;
      for (const player of Object.values(this.gameState.players)) {
        const distance = this.getDistance(position, player.position);
        if (distance < minDistanceFromPlayers) {
          isSafe = false;
          break;
        }
      }
      
      // Ak je pozícia bezpečná, vráť ju
      if (isSafe) {
        return position;
      }
    }
    
    // Ak sa nenašla bezpečná pozícia po 50 pokusoch, vráť aspoň náhodnú pozíciu
    // (lepšie ako nekonečná slučka)
    console.warn('Nepodarilo sa nájsť bezpečnú spawn pozíciu, používam náhodnú');
    return {
      x: 100 + Math.random() * (this.gameState.worldSize.width - 200),
      y: 100 + Math.random() * (this.gameState.worldSize.height - 200)
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
      
      // Nastav rýchlosť - turbo zrýchľuje o 2x
      const speedMultiplier = input.turbo ? 2.0 : 1.0;
      const speed = player.baseSpeed * speedMultiplier;
      
      player.velocity = {
        x: dirX * speed,
        y: dirY * speed
      };
    } else {
      player.velocity = { x: 0, y: 0 };
    }
  }

  private updateBotAI(bot: PlayerBubble, deltaTime: number) {
    const currentTime = Date.now();
    
    // Inicializuj AI personality len raz
    if (!(bot as any).aiPersonality) {
      (bot as any).aiPersonality = {
        aggressiveness: 0.3 + Math.random() * 0.4, // 0.3-0.7
        cautiousness: 0.2 + Math.random() * 0.6,   // 0.2-0.8
        lastDecisionTime: currentTime,
        decisionInterval: 800 + Math.random() * 600, // 800-1400ms medzi rozhodnutiami
        currentTarget: null,
        targetPosition: { ...bot.position },
        isMovingToTarget: false,
        panicMode: false,
        lastTurboUse: 0,
        momentum: { x: 0, y: 0 }, // Pre plynulejšie pohyby
        targetVelocity: { x: 0, y: 0 } // Cieľová rýchlosť
      };
    }
    
    const personality = (bot as any).aiPersonality;
    
    // Aktualizuj AI rozhodnutie iba periodicky (nie každý frame!)
    if (currentTime - personality.lastDecisionTime > personality.decisionInterval) {
      personality.lastDecisionTime = currentTime;
      personality.decisionInterval = 600 + Math.random() * 800; // Variabilný interval
      
      // Analyzuj okolie iba pri novom rozhodnutí
      const analysis = this.analyzeEnvironment(bot);
      const decision = this.makeBotDecision(bot, analysis, personality);
      
      if (decision) {
        personality.targetPosition = decision.position;
        personality.isMovingToTarget = true;
        
        // Vypočítaj cieľovú rýchlosť
        const dx = decision.position.x - bot.position.x;
        const dy = decision.position.y - bot.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const dirX = dx / distance;
          const dirY = dy / distance;
          const speed = bot.baseSpeed * (decision.turbo ? GAME_CONSTANTS.TURBO_SPEED_MULTIPLIER : 1.0);
          
          personality.targetVelocity = {
            x: dirX * speed,
            y: dirY * speed
          };
        }
      }
    }
    
    // Smooth movement - interpolácia k cieľovej rýchlosti
    if (personality.isMovingToTarget) {
      const lerpFactor = Math.min(1.0, deltaTime * 3.0); // Plynulé prechody
      
      bot.velocity.x = this.lerp(bot.velocity.x, personality.targetVelocity.x, lerpFactor);
      bot.velocity.y = this.lerp(bot.velocity.y, personality.targetVelocity.y, lerpFactor);
      
      // Skontroluj či už dosiahol cieľ
      const distanceToTarget = this.getDistance(bot.position, personality.targetPosition);
      if (distanceToTarget < 50) {
        personality.isMovingToTarget = false;
        // Spomalenie pri dosiahnutí cieľa
        personality.targetVelocity = { x: 0, y: 0 };
      }
    } else {
      // Postupné spomalenie ak nemá cieľ
      const dampingFactor = Math.pow(0.1, deltaTime); // Exponenciálne spomalenie
      bot.velocity.x *= dampingFactor;
      bot.velocity.y *= dampingFactor;
    }
  }
  
  // Pomocná funkcia pre lineárnu interpoláciu
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private analyzeEnvironment(bot: PlayerBubble) {
    const analysis = {
      nearbyFood: [] as Array<{target: NPCBubble, distance: number, value: number}>,
      weakEnemies: [] as Array<{target: PlayerBubble, distance: number, scoreDiff: number}>,
      dangerousEnemies: [] as Array<{target: PlayerBubble, distance: number, threat: number}>,
      safeZones: [] as Vector2[],
      crowdedAreas: [] as Vector2[]
    };
    
    const scanRadius = 400; // Radius skenování
    
    // Analyzuj NPC bubliny (jedlo)
    Object.values(this.gameState.npcBubbles).forEach(npc => {
      const distance = this.getDistance(bot.position, npc.position);
      if (distance < scanRadius) {
        analysis.nearbyFood.push({
          target: npc,
          distance,
          value: npc.score / distance // hodnota vs vzdialenosť
        });
      }
    });
    
    // Analyzuj ostatných hráčov
    Object.values(this.gameState.players).forEach(player => {
      if (player.id === bot.id) return;
      
      const distance = this.getDistance(bot.position, player.position);
      if (distance < scanRadius) {
        const scoreDiff = bot.score - player.score;
        
        if (scoreDiff > 20) {
          // Menší hráč = korisť
          analysis.weakEnemies.push({
            target: player,
            distance,
            scoreDiff
          });
        } else if (scoreDiff < -20) {
          // Väčší hráč = nebezpečenstvo
          const threat = Math.abs(scoreDiff) / distance;
          analysis.dangerousEnemies.push({
            target: player,
            distance,
            threat
          });
        }
      }
    });
    
    // Zoradi podľa priority
    analysis.nearbyFood.sort((a, b) => b.value - a.value);
    analysis.weakEnemies.sort((a, b) => b.scoreDiff / a.distance - a.scoreDiff / b.distance);
    analysis.dangerousEnemies.sort((a, b) => b.threat - a.threat);
    
    return analysis;
  }

  private makeBotDecision(bot: PlayerBubble, analysis: any, personality: any): PlayerInput | null {
    const currentTime = Date.now();
    
    // PRIORITA 1: Panic mode - utekaj od nebezpečenstva!
    if (analysis.dangerousEnemies.length > 0) {
      const closestDanger = analysis.dangerousEnemies[0];
      if (closestDanger.distance < bot.radius! * 4) {
        personality.panicMode = true;
        return this.createSmoothEscapeDecision(bot, closestDanger.target);
      }
    }
    personality.panicMode = false;
    
    // PRIORITA 2: Agresívni boti útočia na slabších hráčov (ale opatrne)
    if (analysis.weakEnemies.length > 0 && Math.random() < personality.aggressiveness * 0.7) {
      const target = analysis.weakEnemies[0];
      // Iba ak je cieľ dostatočne blízko a bezpečný
      if (target.distance < 300 && target.scoreDiff > 30) {
        const shouldUseTurbo = target.distance > 150 && 
                             bot.score > GAME_CONSTANTS.MIN_TURBO_SCORE * 2 &&
                             currentTime - personality.lastTurboUse > 8000;
        
        if (shouldUseTurbo) {
          personality.lastTurboUse = currentTime;
        }
        
        return {
          position: this.predictSmoothMovement(target.target),
          turbo: shouldUseTurbo
        };
      }
    }
    
    // PRIORITA 3: Zbieraj jedlo (hlavná aktivita)
    if (analysis.nearbyFood.length > 0) {
      let bestFood = null;
      let bestScore = -1;
      
      // Nájdi najlepšie jedlo (blízko + bezpečné)
      for (const food of analysis.nearbyFood.slice(0, 3)) {
        let safetyScore = food.value; // základné skóre vzdialenosť/hodnota
        
        // Bonus za bezpečnosť
        let minDangerDistance = Infinity;
        for (const danger of analysis.dangerousEnemies) {
          const dangerToFood = this.getDistance(food.target.position, danger.target.position);
          minDangerDistance = Math.min(minDangerDistance, dangerToFood);
        }
        
        if (minDangerDistance > 100) { // Bezpečný bonus
          safetyScore *= 1.5;
        }
        
        if (safetyScore > bestScore) {
          bestScore = safetyScore;
          bestFood = food.target;
        }
      }
      
      if (bestFood) {
        return {
          position: bestFood.position,
          turbo: false
        };
      }
    }
    
    // PRIORITA 4: Náhodné preskúmanie (plynulé)
    return this.createSmoothExploreDecision(bot, personality);
  }

  private createSmoothEscapeDecision(bot: PlayerBubble, danger: PlayerBubble): PlayerInput {
    if (!danger) {
      return this.createSmoothExploreDecision(bot, null);
    }
    
    // Utekaj v opačnom smere, ale inteligentne
    const escapeVector = {
      x: bot.position.x - danger.position.x,
      y: bot.position.y - danger.position.y
    };
    
    const length = Math.sqrt(escapeVector.x * escapeVector.x + escapeVector.y * escapeVector.y);
    if (length === 0) {
      // Náhodný smer ak sú na rovnakom mieste
      const angle = Math.random() * Math.PI * 2;
      escapeVector.x = Math.cos(angle);
      escapeVector.y = Math.sin(angle);
    } else {
      escapeVector.x /= length;
      escapeVector.y /= length;
    }
    
    // Mierne randomizuj smer úteku (nie priamo opačne)
    const randomAngle = (Math.random() - 0.5) * Math.PI * 0.5; // ±45°
    const cos = Math.cos(randomAngle);
    const sin = Math.sin(randomAngle);
    const newX = escapeVector.x * cos - escapeVector.y * sin;
    const newY = escapeVector.x * sin + escapeVector.y * cos;
    
    // Utekaj rozumne ďaleko
    const escapeDistance = 180 + Math.random() * 120; // 180-300px
    let targetX = bot.position.x + newX * escapeDistance;
    let targetY = bot.position.y + newY * escapeDistance;
    
    // Udržuj v hraniciach mapy
    const margin = 100;
    targetX = Math.max(margin, Math.min(this.gameState.worldSize.width - margin, targetX));
    targetY = Math.max(margin, Math.min(this.gameState.worldSize.height - margin, targetY));
    
    return {
      position: { x: targetX, y: targetY },
      turbo: bot.score > GAME_CONSTANTS.MIN_TURBO_SCORE * 1.5
    };
  }

  private createSmoothExploreDecision(bot: PlayerBubble, personality: any): PlayerInput {
    // Inteligentné preskúmanie - preferuj oblasti s jedlom
    const mapCenter = {
      x: this.gameState.worldSize.width / 2,
      y: this.gameState.worldSize.height / 2
    };
    
    // Zisti ako ďaleko je od stredu
    const distanceFromCenter = this.getDistance(bot.position, mapCenter);
    const maxDistance = Math.sqrt(this.gameState.worldSize.width ** 2 + this.gameState.worldSize.height ** 2) / 2;
    const centerBias = distanceFromCenter / maxDistance; // Ďalej od stredu = väčší bias k stredu
    
    let targetX, targetY;
    
    if (Math.random() < centerBias * 0.7) {
      // Smer smerom k stredu (ale nie priamo)
      const dirToCenter = {
        x: mapCenter.x - bot.position.x,
        y: mapCenter.y - bot.position.y
      };
      const length = Math.sqrt(dirToCenter.x * dirToCenter.x + dirToCenter.y * dirToCenter.y);
      if (length > 0) {
        dirToCenter.x /= length;
        dirToCenter.y /= length;
      }
      
      // Pridaj náhodnosť k smeru
      const randomAngle = (Math.random() - 0.5) * Math.PI; // ±90°
      const cos = Math.cos(randomAngle);
      const sin = Math.sin(randomAngle);
      const randomDirX = dirToCenter.x * cos - dirToCenter.y * sin;
      const randomDirY = dirToCenter.x * sin + dirToCenter.y * cos;
      
      const exploreDistance = 120 + Math.random() * 180;
      targetX = bot.position.x + randomDirX * exploreDistance;
      targetY = bot.position.y + randomDirY * exploreDistance;
    } else {
      // Náhodný smer pre pestrosť
      const angle = Math.random() * Math.PI * 2;
      const distance = 100 + Math.random() * 200;
      targetX = bot.position.x + Math.cos(angle) * distance;
      targetY = bot.position.y + Math.sin(angle) * distance;
    }
    
    // Udržuj v hraniciach mapy
    const margin = 80;
    targetX = Math.max(margin, Math.min(this.gameState.worldSize.width - margin, targetX));
    targetY = Math.max(margin, Math.min(this.gameState.worldSize.height - margin, targetY));
    
    return {
      position: { x: targetX, y: targetY },
      turbo: false
    };
  }

  private predictSmoothMovement(target: PlayerBubble): Vector2 {
    // Predikcia kde bude cieľ - konzervativnejšie
    const prediction = 0.3; // Kratšia predikcia pre presnosť
    return {
      x: target.position.x + target.velocity.x * prediction,
      y: target.position.y + target.velocity.y * prediction
    };
  }

  private findSafestFood(bot: PlayerBubble, analysis: any): NPCBubble | null {
    // Nájdi jedlo najďalej od nebezpečných hráčov
    let safestFood = null;
    let maxSafety = -1;
    
    for (const food of analysis.nearbyFood.slice(0, 5)) { // Kontroluj len top 5
      let minDistanceToDanger = Infinity;
      
      for (const danger of analysis.dangerousEnemies) {
        const distanceToDanger = this.getDistance(food.target.position, danger.target.position);
        minDistanceToDanger = Math.min(minDistanceToDanger, distanceToDanger);
      }
      
      const safety = minDistanceToDanger / food.distance; // Bezpečnosť vs vzdialenosť
      if (safety > maxSafety) {
        maxSafety = safety;
        safestFood = food.target;
      }
    }
    
    return safestFood;
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
        
        // Preskočiť kolíziu ak je jeden z hráčov chránený
        if (playerA.isInvulnerable || playerB.isInvulnerable) {
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
          // Aktualizuj rýchlosť na základe novej veľkosti
          player.baseSpeed = calculatePlayerSpeed(player.level, player.score);
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

    // Pridaj porazeného hráča do mesačného leaderboardu
    this.addToMonthlyLeaderboard(loser);

    // Vytvor NPC bubliny z porazeného hráča
    this.createNpcBubblesFromPlayer(loser.position, loser.score);

    // Odstráň porazeného hráča
    delete this.gameState.players[loser.id];
    this.io.emit('bubblePopped', loser.id);

    // Zabezpeč minimálny počet hráčov po kolízii
    const currentTotalPlayers = Object.keys(this.gameState.players).length;
    if (currentTotalPlayers < GAME_CONSTANTS.MIN_PLAYERS) {
      this.ensureMinimumPlayers();
    }
  }

  private createNpcBubblesFromPlayer(position: Vector2, score: number): void {
    const bubblesToCreate = Math.floor(score);
    const baseRadius = calculateRadius(score);
    const maxSpreadRadius = baseRadius * 3; // Bubliny sa rozptýlia až 3x ďalej ako bola veľká originálna bublina
    
    for (let i = 0; i < bubblesToCreate; i++) {
      // Náhodný uhol v plnom kruhu (0 až 2π)
      const angle = Math.random() * Math.PI * 2;
      
      // Náhodná vzdialenosť od stredu (0 až maxSpreadRadius)
      // Používame sqrt pre rovnomernejšie rozloženie v kruhu
      const distance = Math.sqrt(Math.random()) * maxSpreadRadius;
      
      // Vypočítaj novú pozíciu
      let newX = position.x + Math.cos(angle) * distance;
      let newY = position.y + Math.sin(angle) * distance;
      
      // Uistíme sa, že bublina sa dostane do hraníc mapy
      const npcRadius = calculateRadius(GAME_CONSTANTS.NPC_BUBBLE_SCORE);
      newX = Math.max(npcRadius, Math.min(this.gameState.worldSize.width - npcRadius, newX));
      newY = Math.max(npcRadius, Math.min(this.gameState.worldSize.height - npcRadius, newY));

      const npc: NPCBubble = {
        id: `npc_from_player_${Date.now()}_${i}_${Math.random()}`,
        score: GAME_CONSTANTS.NPC_BUBBLE_SCORE,
        position: { x: newX, y: newY },
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
      // Aktualizuj rýchlosť na základe nového levelu a skóre
      player.baseSpeed = calculatePlayerSpeed(player.level, player.score);
      player.color = getLevelColor(player.level);
      player.radius = calculateRadius(player.score);
      
      // Pridaj level up protection na 3 sekundy
      player.isInvulnerable = true;
      player.spawnTime = Date.now(); // Použij rovnaký mechanizmus ako pri spawn protection
      
      this.io.emit('levelUp', player.id, player.level);
    }
  }

  private updateTurbo(player: PlayerBubble, deltaTime: number, isTurboActive: boolean) {
    if (isTurboActive && player.score > GAME_CONSTANTS.MIN_TURBO_SCORE) {
      // Vypočítaj smer pohybu hráča
      const velocityMagnitude = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y);
      
      // Turbo funguje len ak sa hráč pohybuje
      if (velocityMagnitude > 0) {
        // Normalizuj smer pohybu - vypúšťaj bubliny ZA hráčom (opačný smer pohybu)
        const directionX = -player.velocity.x / velocityMagnitude;
        const directionY = -player.velocity.y / velocityMagnitude;
        
        // Vypočítaj počet bublín na vypustenie (závisí od delta time)
        const bubblesPerSecond = GAME_CONSTANTS.TURBO_DRAIN_RATE;
        const bubblesToEject = Math.max(1, Math.floor(bubblesPerSecond * deltaTime)); // Minimálne 1 bublina za frame
        
        for (let i = 0; i < bubblesToEject && player.score > GAME_CONSTANTS.MIN_TURBO_SCORE; i++) {
          // Vypusti NPC bublinu za hráčom
          this.ejectNpcBubble(player, directionX, directionY);
          
          // Zníž skóre hráča
          player.score = Math.max(GAME_CONSTANTS.MIN_TURBO_SCORE, player.score - 1);
        }
        
        // Aktualizuj polomer a rýchlosť hráča
        player.radius = calculateRadius(player.score);
        player.baseSpeed = calculatePlayerSpeed(player.level, player.score);
      }
    }
  }

  private ejectNpcBubble(player: PlayerBubble, directionX: number, directionY: number): void {
    // Vypočítaj pozíciu na okraji hráčovej bubliny s väčšou vzdialenosťou
    const ejectionDistance = player.radius! + calculateRadius(GAME_CONSTANTS.NPC_BUBBLE_SCORE) + 20; // +20 pre väčšiu medzeru
    
    const startX = player.position.x + directionX * ejectionDistance;
    const startY = player.position.y + directionY * ejectionDistance;
    
    // Uisti sa, že bublina je v hraniciach mapy
    const npcRadius = calculateRadius(GAME_CONSTANTS.NPC_BUBBLE_SCORE);
    const clampedX = Math.max(npcRadius, Math.min(this.gameState.worldSize.width - npcRadius, startX));
    const clampedY = Math.max(npcRadius, Math.min(this.gameState.worldSize.height - npcRadius, startY));

    const npc: NPCBubble = {
      id: `npc_turbo_${Date.now()}_${Math.random()}`,
      score: GAME_CONSTANTS.NPC_BUBBLE_SCORE,
      position: { x: clampedX, y: clampedY }
    };
    
    this.gameState.npcBubbles[npc.id] = npc;
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
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    console.log('🎮 Spúšťam game loop...');
    
    this.updateInterval = setInterval(() => {
      // Kontroluj či hra stále beží
      if (!this.isGameActive) {
        console.log('💤 Hra neaktívna: žiadni skutoční hráči pripojení');
        return;
      }
      
      const currentTime = Date.now();
      const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // v sekundách
      this.lastUpdateTime = currentTime;

      // Aktualizuj spawn protection pre všetkých hráčov
      Object.values(this.gameState.players).forEach(player => {
        if (player.isInvulnerable && player.spawnTime) {
          const timeSinceSpawn = currentTime - player.spawnTime;
          if (timeSinceSpawn >= GAME_CONSTANTS.SPAWN_PROTECTION_DURATION) {
            player.isInvulnerable = false;
          }
        }
      });

      // Aktualizuj AI botov len ak hra beží
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

      // Zabezpeč minimálny počet hráčov (každých 5 sekúnd)
      if (Math.floor(currentTime / 5000) !== Math.floor((currentTime - deltaTime * 1000) / 5000)) {
        this.ensureMinimumPlayers();
        
        if (this.realPlayers.size > 0) {
          const currentPlayers = Object.keys(this.gameState.players).length;
          const realPlayerCount = this.realPlayers.size;
          const botCount = currentPlayers - realPlayerCount;
          console.log(`🎮 Hra aktívna: ${realPlayerCount} skutočných hráčov, ${botCount} botov`);
        }
      }

      // Pošli aktualizovaný stav všetkým klientom
      this.io.emit('gameState', this.serializeGameState());
    }, 1000 / 20); // 20 FPS pre úsporu zdrojov
  }

  public stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.httpServer.close();
  }

  // Mesačný leaderboard metódy
  private loadMonthlyLeaderboard() {
    try {
      if (fs.existsSync(this.leaderboardPath)) {
        const data = fs.readFileSync(this.leaderboardPath, 'utf8');
        this.monthlyLeaderboard = JSON.parse(data);
        console.log(`Načítaný mesačný leaderboard: ${this.monthlyLeaderboard.length} záznamov`);
      } else {
        this.monthlyLeaderboard = [];
        this.saveMonthlyLeaderboard();
      }
    } catch (error) {
      console.error('Chyba pri načítavaní mesačného leaderboardu:', error);
      this.monthlyLeaderboard = [];
    }
  }

  private saveMonthlyLeaderboard() {
    try {
      fs.writeFileSync(this.leaderboardPath, JSON.stringify(this.monthlyLeaderboard, null, 2));
    } catch (error) {
      console.error('Chyba pri ukladaní mesačného leaderboardu:', error);
    }
  }

  private addToMonthlyLeaderboard(player: PlayerBubble) {
    // Zaznamenávaj všetkých hráčov vrátane botov
    const entry: MonthlyLeaderboardEntry = {
      id: `${Date.now()}_${Math.random()}`,
      nickname: player.nickname,
      level: player.level,
      score: player.score,
      timestamp: Date.now()
    };

    // Pridaj do leaderboardu
    this.monthlyLeaderboard.push(entry);

    // Zoradi podľa levelu a skóre (zostupne)
    this.monthlyLeaderboard.sort((a, b) => {
      if (a.level !== b.level) {
        return b.level - a.level; // Vyšší level má prednosť
      }
      return b.score - a.score; // Pri rovnakom leveli vyššie skóre
    });

    // Udržiavaj všetkých hráčov - neobmedzuj počet
    // this.monthlyLeaderboard = this.monthlyLeaderboard.slice(0, 50); // Odstránené obmedzenie

    // Ulož do súboru
    this.saveMonthlyLeaderboard();
    
    console.log(`Pridaný do mesačného leaderboardu: ${player.nickname} (Lvl ${player.level}, ${player.score} pts) - Celkom záznamov: ${this.monthlyLeaderboard.length}`);
  }

  private getMonthlyLeaderboard(limit: number = 10) {
    return this.monthlyLeaderboard.slice(0, limit); // Vráť top X podľa parametra
  }

  private getAllMonthlyLeaderboard() {
    return this.monthlyLeaderboard; // Vráť všetkých
  }

  private getMonthlyLeaderboardStats() {
    return {
      totalPlayers: this.monthlyLeaderboard.length,
      topLevel: this.monthlyLeaderboard.length > 0 ? this.monthlyLeaderboard[0].level : 0,
      topScore: this.monthlyLeaderboard.length > 0 ? this.monthlyLeaderboard[0].score : 0
    };
  }
}

// Spusti server ak je tento súbor spustený priamo
if (require.main === module) {
  new GameServer();
} 