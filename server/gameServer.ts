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
  calculateRadius,
  calculateLevelUpScore,
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

  constructor(port: number = 3001) {
    this.httpServer = createServer();
    this.io = new Server(this.httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production' ? 
          process.env.FRONTEND_URL || 'https://bubbles-nrl5.vercel.app' : 
          ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Inicializuj mesačný leaderboard
    this.leaderboardPath = path.join(__dirname, 'monthlyLeaderboard.json');
    this.loadMonthlyLeaderboard();

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

      socket.on('getMonthlyLeaderboard', (limit?: number) => {
        socket.emit('monthlyLeaderboard', this.getMonthlyLeaderboard(limit || 10));
      });

      socket.on('getLeaderboardStats', () => {
        socket.emit('leaderboardStats', this.getMonthlyLeaderboardStats());
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
    const currentTime = Date.now();
    const startingLevel = GAME_CONSTANTS.STARTING_LEVEL;
    // Vypočítaj počiatočnú rýchlosť na základe aditivneho systému
    const baseSpeed = GAME_CONSTANTS.BASE_SPEED + (startingLevel - 1) * GAME_CONSTANTS.SPEED_LEVEL_INCREASE;
    
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
      score: GAME_CONSTANTS.STARTING_SCORE,
      level: startingLevel,
      baseSpeed: baseSpeed,
      position,
      velocity: { x: 0, y: 0 },
      color: getLevelColor(startingLevel),
      radius: calculateRadius(GAME_CONSTANTS.STARTING_SCORE),
      isBot,
      spawnTime: currentTime,
      isInvulnerable: true
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
    // Pokročilá AI s realistickým ľudským správaním
    
    // Pridaj náhodnosť a personálne preferencie bota
    if (!(bot as any).aiPersonality) {
      (bot as any).aiPersonality = {
        aggressiveness: 0.3 + Math.random() * 0.4, // 0.3-0.7
        cautiousness: 0.2 + Math.random() * 0.6,   // 0.2-0.8
        patrolRadius: 200 + Math.random() * 300,   // 200-500px
        lastDirectionChange: Date.now(),
        currentTarget: null,
        isPatrolling: false,
        patrolCenter: { ...bot.position },
        panicMode: false,
        lastTurboUse: 0
      };
    }
    
    const personality = (bot as any).aiPersonality;
    const currentTime = Date.now();
    
    // Analyzuj okolie
    const analysis = this.analyzeEnvironment(bot);
    
    // Rozhodovací systém založený na situácii
    let decision = this.makeBotDecision(bot, analysis, personality);
    
    // Panic mode: ak sú blízko veľkí hráči
    if (analysis.dangerousEnemies.length > 0) {
      const closestDanger = analysis.dangerousEnemies[0];
      if (closestDanger.distance < bot.radius! * 3) {
        personality.panicMode = true;
        decision = this.createEscapeDecision(bot, closestDanger.target);
      }
    } else {
      personality.panicMode = false;
    }
    
    // Ľudské správanie: občasné zmeny smeru
    if (currentTime - personality.lastDirectionChange > 2000 + Math.random() * 3000) {
      personality.lastDirectionChange = currentTime;
      // Občas zmeň stratégiu
      if (Math.random() < 0.3) {
        personality.isPatrolling = !personality.isPatrolling;
        if (personality.isPatrolling) {
          personality.patrolCenter = { ...bot.position };
        }
      }
    }
    
    // Aplikuj rozhodnutie
    if (decision) {
      this.updatePlayerInput(bot, decision);
    }
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
    
    // Panic mode - utekaj!
    if (personality.panicMode) {
      return this.createEscapeDecision(bot, analysis.dangerousEnemies[0]?.target);
    }
    
    // Agresívni boti: útočia na slabších hráčov
    if (analysis.weakEnemies.length > 0 && Math.random() < personality.aggressiveness) {
      const target = analysis.weakEnemies[0];
      const shouldUseTurbo = target.distance > 200 && 
                           bot.score > GAME_CONSTANTS.MIN_TURBO_SCORE * 3 &&
                           currentTime - personality.lastTurboUse > 5000;
      
      if (shouldUseTurbo) {
        personality.lastTurboUse = currentTime;
      }
      
      return {
        position: this.predictMovement(target.target),
        turbo: shouldUseTurbo
      };
    }
    
    // Opatrní boti: zbierajú jedlo v bezpečí
    if (analysis.nearbyFood.length > 0 && Math.random() < personality.cautiousness) {
      const safestFood = this.findSafestFood(bot, analysis);
      if (safestFood) {
        return {
          position: safestFood.position,
          turbo: false
        };
      }
    }
    
    // Patrol mode: pohybuj sa v okolí
    if (personality.isPatrolling) {
      return this.createPatrolDecision(bot, personality);
    }
    
    // Základné jedlo zbieranie
    if (analysis.nearbyFood.length > 0) {
      return {
        position: analysis.nearbyFood[0].target.position,
        turbo: false
      };
    }
    
    // Náhodné preskúmanie
    return this.createExploreDecision(bot);
  }

  private createEscapeDecision(bot: PlayerBubble, danger: PlayerBubble): PlayerInput {
    if (!danger) {
      return this.createExploreDecision(bot);
    }
    
    // Utekaj v opačnom smere
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
    
    // Utekaj ďaleko
    const escapeDistance = 300;
    return {
      position: {
        x: bot.position.x + escapeVector.x * escapeDistance,
        y: bot.position.y + escapeVector.y * escapeDistance
      },
      turbo: bot.score > GAME_CONSTANTS.MIN_TURBO_SCORE * 2 // Použij turbo pri úteku
    };
  }

  private createPatrolDecision(bot: PlayerBubble, personality: any): PlayerInput {
    const distanceFromCenter = this.getDistance(bot.position, personality.patrolCenter);
    
    if (distanceFromCenter > personality.patrolRadius) {
      // Vráť sa do patrol oblasti
      return {
        position: personality.patrolCenter,
        turbo: false
      };
    }
    
    // Pohybuj sa náhodne v patrol oblasti
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * personality.patrolRadius * 0.5;
    
    return {
      position: {
        x: personality.patrolCenter.x + Math.cos(angle) * distance,
        y: personality.patrolCenter.y + Math.sin(angle) * distance
      },
      turbo: false
    };
  }

  private createExploreDecision(bot: PlayerBubble): PlayerInput {
    // Náhodné preskúmanie s tendenciou smerom k stredu mapy
    const centerBias = 0.3; // 30% bias smerom k stredu
    const mapCenter = {
      x: this.gameState.worldSize.width / 2,
      y: this.gameState.worldSize.height / 2
    };
    
    let targetX, targetY;
    
    if (Math.random() < centerBias) {
      // Smer k stredu mapy
      const dirToCenter = {
        x: mapCenter.x - bot.position.x,
        y: mapCenter.y - bot.position.y
      };
      const length = Math.sqrt(dirToCenter.x * dirToCenter.x + dirToCenter.y * dirToCenter.y);
      if (length > 0) {
        dirToCenter.x /= length;
        dirToCenter.y /= length;
      }
      
      const exploreDistance = 200 + Math.random() * 200;
      targetX = bot.position.x + dirToCenter.x * exploreDistance;
      targetY = bot.position.y + dirToCenter.y * exploreDistance;
    } else {
      // Úplne náhodný smer
      const angle = Math.random() * Math.PI * 2;
      const distance = 150 + Math.random() * 250;
      targetX = bot.position.x + Math.cos(angle) * distance;
      targetY = bot.position.y + Math.sin(angle) * distance;
    }
    
    return {
      position: { x: targetX, y: targetY },
      turbo: false
    };
  }

  private predictMovement(target: PlayerBubble): Vector2 {
    // Predikcia kde bude cieľ - ako ľudia anticipujú pohyb
    const prediction = 0.5; // 0.5 sekundy do budúcnosti
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
      // Aditivne zvýšenie rýchlosti - každý level pridá 50 bodov
      player.baseSpeed = GAME_CONSTANTS.BASE_SPEED + (player.level - 1) * GAME_CONSTANTS.SPEED_LEVEL_INCREASE;
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
        
        // Aktualizuj polomer hráča
        player.radius = calculateRadius(player.score);
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
    this.updateInterval = setInterval(() => {
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