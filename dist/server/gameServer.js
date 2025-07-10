"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameServer = void 0;
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const game_1 = require("../types/game");
// Herný server
class GameServer {
    constructor(port = 3001) {
        this.lastUpdateTime = Date.now();
        this.updateInterval = null;
        this.monthlyLeaderboard = [];
        this.isGameActive = false; // Nový flag pre aktívnosť hry
        this.realPlayers = new Set(); // Track skutočných hráčov
        this.httpServer = (0, http_1.createServer)((req, res) => {
            // Jednoduchý health check endpoint
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'OK', timestamp: new Date().toISOString() }));
                return;
            }
            res.writeHead(404);
            res.end('Not Found');
        });
        this.io = new socket_io_1.Server(this.httpServer, {
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
                    }
                    // Povol všetky Vercel preview URLs (obsahujú vercel.app)
                    else if (origin && origin.includes('vercel.app')) {
                        console.log(`✅ CORS povolený pre Vercel preview: ${origin}`);
                        callback(null, true);
                    }
                    else {
                        console.log(`❌ CORS zamietnutý pre: ${origin}`);
                        callback(new Error('Not allowed by CORS'));
                    }
                },
                methods: ['GET', 'POST'],
                credentials: true,
                allowedHeaders: ['Content-Type']
            },
            // Optimalizácia pre latency
            pingTimeout: 3000,
            pingInterval: 1000,
            upgradeTimeout: 3000,
            transports: ['websocket', 'polling'],
            // Menšie buffery pre nižšiu latency
            maxHttpBufferSize: 1e6
        });
        // Inicializuj mesačný leaderboard
        this.leaderboardPath = path.join(__dirname, 'monthlyLeaderboard.json');
        this.loadMonthlyLeaderboard();
        this.gameState = {
            players: {},
            npcBubbles: {},
            worldSize: { width: game_1.GAME_SETTINGS.WORLD_SIZE.WIDTH, height: game_1.GAME_SETTINGS.WORLD_SIZE.HEIGHT }
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
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Hráč sa pripojil:', socket.id);
            socket.on('join', (nickname) => {
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
            socket.on('updateInput', (input) => {
                const player = this.gameState.players[socket.id];
                if (player) {
                    this.updatePlayerInput(player, input);
                }
            });
            socket.on('getMonthlyLeaderboard', (limit) => {
                socket.emit('monthlyLeaderboard', this.getMonthlyLeaderboard(limit || 10));
            });
            socket.on('getLeaderboardStats', () => {
                socket.emit('leaderboardStats', this.getMonthlyLeaderboardStats());
            });
            // Ping/pong pre latency monitoring
            socket.on('ping', (timestamp) => {
                socket.emit('pong', timestamp);
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
    createPlayer(id, nickname, isBot = false) {
        const position = this.getRandomPosition();
        const currentTime = Date.now();
        const startingLevel = game_1.GAME_CONSTANTS.STARTING_LEVEL;
        const startingScore = game_1.GAME_CONSTANTS.STARTING_SCORE;
        // Vypočítaj počiatočnú rýchlosť pomocou novej funkcie
        const baseSpeed = (0, game_1.calculatePlayerSpeed)(startingLevel, startingScore);
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
            color: (0, game_1.getLevelColor)(startingLevel),
            radius: (0, game_1.calculateRadius)(startingScore),
            isBot,
            spawnTime: currentTime,
            isInvulnerable: true
        };
    }
    createBot() {
        const botId = `bot_${Date.now()}_${Math.random()}`;
        return this.createPlayer(botId, '', true);
    }
    activateGame() {
        if (this.isGameActive)
            return;
        this.isGameActive = true;
        console.log('🎮 Aktivujem hru - prvý skutočný hráč sa pripojil!');
        // Generuj NPC bubliny
        this.generateNPCBubbles();
        // Spusti herný loop
        this.startGameLoop();
        // Zabezpeč minimálny počet hráčov
        this.ensureMinimumPlayers();
    }
    deactivateGame() {
        if (!this.isGameActive)
            return;
        this.isGameActive = false;
        console.log('🛑 Posledný skutočný hráč sa odpojil - deaktivujem hru');
        // Zastav herný loop
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        // Vyčisti všetkých botov
        const botIds = Object.keys(this.gameState.players).filter(id => this.gameState.players[id].isBot);
        botIds.forEach(botId => {
            delete this.gameState.players[botId];
        });
        // Vyčisti NPC bubliny
        this.gameState.npcBubbles = {};
        console.log(`🤖 Vyčistených ${botIds.length} neaktívnych botov - žiadni skutoční hráči`);
    }
    ensureMinimumPlayers() {
        // Zabezpeč minimálny počet hráčov len ak hra beží
        if (!this.isGameActive)
            return;
        const currentPlayers = Object.keys(this.gameState.players).length;
        const botsNeeded = Math.max(0, game_1.GAME_CONSTANTS.MIN_PLAYERS - currentPlayers);
        if (botsNeeded > 0) {
            console.log(`Pridávam ${botsNeeded} botov (aktuálne: ${currentPlayers}, potrebných: ${game_1.GAME_CONSTANTS.MIN_PLAYERS})`);
        }
        for (let i = 0; i < botsNeeded; i++) {
            const bot = this.createBot();
            this.gameState.players[bot.id] = bot;
            console.log(`Pridaný bot: ${bot.nickname} (${bot.id})`);
        }
    }
    generateNPCBubbles() {
        // Generuj NPC bubliny ak je ich málo
        const targetNPCs = Math.floor(this.gameState.worldSize.width * this.gameState.worldSize.height / game_1.GAME_SETTINGS.NPC_DENSITY);
        const currentNPCs = Object.keys(this.gameState.npcBubbles).length;
        // Odstránený debug výpis
        for (let i = currentNPCs; i < targetNPCs; i++) {
            const npc = {
                id: `npc_${Date.now()}_${Math.random()}`,
                score: game_1.GAME_CONSTANTS.NPC_BUBBLE_SCORE,
                position: this.getRandomPositionForNPC()
            };
            this.gameState.npcBubbles[npc.id] = npc;
        }
    }
    getRandomPositionForNPC() {
        // Pre NPC bubliny použij jednoduchú náhodnú pozíciu (bez kontroly kolízií pre lepšiu výkonnosť)
        return {
            x: Math.random() * this.gameState.worldSize.width,
            y: Math.random() * this.gameState.worldSize.height
        };
    }
    getRandomPosition() {
        const maxAttempts = 50; // Maximálne 50 pokusov na nájdenie voľného miesta
        const minDistanceFromPlayers = 150; // Minimálna vzdialenosť od iných hráčov
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Generuj náhodnú pozíciu s ohradom na okraje mapy
            const margin = 100; // 100px od okraja
            const position = {
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
    updatePlayerInput(player, input) {
        // Vypočítaj smer k cieľu
        const dx = input.position.x - player.position.x;
        const dy = input.position.y - player.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // Uložíme turbo stav do player objektu
        player.turboActive = input.turbo;
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
        }
        else {
            player.velocity = { x: 0, y: 0 };
        }
    }
    updateBotAI(bot, deltaTime) {
        const currentTime = Date.now();
        // Inicializuj AI personality len raz
        if (!bot.aiPersonality) {
            bot.aiPersonality = {
                aggressiveness: 0.3 + Math.random() * 0.4, // 0.3-0.7
                cautiousness: 0.2 + Math.random() * 0.6, // 0.2-0.8
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
        const personality = bot.aiPersonality;
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
                    const speed = bot.baseSpeed * (decision.turbo ? game_1.GAME_CONSTANTS.TURBO_SPEED_MULTIPLIER : 1.0);
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
        }
        else {
            // Postupné spomalenie ak nemá cieľ
            const dampingFactor = Math.pow(0.1, deltaTime); // Exponenciálne spomalenie
            bot.velocity.x *= dampingFactor;
            bot.velocity.y *= dampingFactor;
        }
    }
    // Pomocná funkcia pre lineárnu interpoláciu
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
    analyzeEnvironment(bot) {
        const analysis = {
            nearbyFood: [],
            weakEnemies: [],
            dangerousEnemies: [],
            safeZones: [],
            crowdedAreas: []
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
            if (player.id === bot.id)
                return;
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
                }
                else if (scoreDiff < -20) {
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
    makeBotDecision(bot, analysis, personality) {
        const currentTime = Date.now();
        // PRIORITA 1: Panic mode - utekaj od nebezpečenstva!
        if (analysis.dangerousEnemies.length > 0) {
            const closestDanger = analysis.dangerousEnemies[0];
            if (closestDanger.distance < bot.radius * 4) {
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
                    bot.score > game_1.GAME_CONSTANTS.MIN_TURBO_SCORE * 2 &&
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
    createSmoothEscapeDecision(bot, danger) {
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
        }
        else {
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
            turbo: bot.score > game_1.GAME_CONSTANTS.MIN_TURBO_SCORE * 1.5
        };
    }
    createSmoothExploreDecision(bot, personality) {
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
        }
        else {
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
    predictSmoothMovement(target) {
        // Predikcia kde bude cieľ - konzervativnejšie
        const prediction = 0.3; // Kratšia predikcia pre presnosť
        return {
            x: target.position.x + target.velocity.x * prediction,
            y: target.position.y + target.velocity.y * prediction
        };
    }
    findSafestFood(bot, analysis) {
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
    getDistance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    checkCollisions() {
        // Kontrola kolízií medzi hráčmi
        const players = Object.values(this.gameState.players);
        const playersToRemove = [];
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
                const minDistance = playerA.radius + playerB.radius - game_1.GAME_CONSTANTS.COLLISION_OVERLAP;
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
                const npcRadius = (0, game_1.calculateRadius)(npc.score);
                const minDistance = player.radius + npcRadius;
                if (distance < minDistance) {
                    // Hráč zje NPC bublinu
                    player.score += npc.score;
                    player.radius = (0, game_1.calculateRadius)(player.score);
                    // Aktualizuj rýchlosť na základe novej veľkosti
                    player.baseSpeed = (0, game_1.calculatePlayerSpeed)(player.level, player.score);
                    delete this.gameState.npcBubbles[npcId];
                    // Skontroluj level up
                    this.checkLevelUp(player);
                }
            });
        });
    }
    handlePlayerCollision(playerA, playerB) {
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
        if (currentTotalPlayers < game_1.GAME_CONSTANTS.MIN_PLAYERS) {
            this.ensureMinimumPlayers();
        }
    }
    createNpcBubblesFromPlayer(position, score) {
        const bubblesToCreate = Math.floor(score);
        const baseRadius = (0, game_1.calculateRadius)(score);
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
            const npcRadius = (0, game_1.calculateRadius)(game_1.GAME_CONSTANTS.NPC_BUBBLE_SCORE);
            newX = Math.max(npcRadius, Math.min(this.gameState.worldSize.width - npcRadius, newX));
            newY = Math.max(npcRadius, Math.min(this.gameState.worldSize.height - npcRadius, newY));
            const npc = {
                id: `npc_from_player_${Date.now()}_${i}_${Math.random()}`,
                score: game_1.GAME_CONSTANTS.NPC_BUBBLE_SCORE,
                position: { x: newX, y: newY },
            };
            this.gameState.npcBubbles[npc.id] = npc;
        }
    }
    checkLevelUp(player) {
        const requiredScore = (0, game_1.calculateLevelUpScore)(player.level);
        if (player.score >= requiredScore) {
            // Level up!
            player.level++;
            player.score = game_1.GAME_CONSTANTS.STARTING_SCORE;
            // Aktualizuj rýchlosť na základe nového levelu a skóre
            player.baseSpeed = (0, game_1.calculatePlayerSpeed)(player.level, player.score);
            player.color = (0, game_1.getLevelColor)(player.level);
            player.radius = (0, game_1.calculateRadius)(player.score);
            // Pridaj level up protection na 3 sekundy
            player.isInvulnerable = true;
            player.spawnTime = Date.now(); // Použij rovnaký mechanizmus ako pri spawn protection
            this.io.emit('levelUp', player.id, player.level);
        }
    }
    updateTurbo(player, deltaTime, isTurboActive) {
        if (isTurboActive && player.score > game_1.GAME_CONSTANTS.MIN_TURBO_SCORE) {
            // Vypočítaj smer pohybu hráča
            const velocityMagnitude = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y);
            // Turbo funguje len ak sa hráč pohybuje
            if (velocityMagnitude > 0) {
                // Normalizuj smer pohybu - vypúšťaj bubliny ZA hráčom (opačný smer pohybu)
                const directionX = -player.velocity.x / velocityMagnitude;
                const directionY = -player.velocity.y / velocityMagnitude;
                // Vypočítaj počet bublín na vypustenie (závisí od delta time)
                const bubblesPerSecond = game_1.GAME_CONSTANTS.TURBO_DRAIN_RATE;
                const bubblesToEject = Math.max(1, Math.floor(bubblesPerSecond * deltaTime)); // Minimálne 1 bublina za frame
                for (let i = 0; i < bubblesToEject && player.score > game_1.GAME_CONSTANTS.MIN_TURBO_SCORE; i++) {
                    // Vypusti NPC bublinu za hráčom
                    this.ejectNpcBubble(player, directionX, directionY);
                    // Zníž skóre hráča
                    player.score = Math.max(game_1.GAME_CONSTANTS.MIN_TURBO_SCORE, player.score - 1);
                }
                // Aktualizuj polomer a rýchlosť hráča
                player.radius = (0, game_1.calculateRadius)(player.score);
                player.baseSpeed = (0, game_1.calculatePlayerSpeed)(player.level, player.score);
            }
        }
    }
    ejectNpcBubble(player, directionX, directionY) {
        // Vypočítaj pozíciu na okraji hráčovej bubliny s väčšou vzdialenosťou
        const ejectionDistance = player.radius + (0, game_1.calculateRadius)(game_1.GAME_CONSTANTS.NPC_BUBBLE_SCORE) + 20; // +20 pre väčšiu medzeru
        const startX = player.position.x + directionX * ejectionDistance;
        const startY = player.position.y + directionY * ejectionDistance;
        // Uisti sa, že bublina je v hraniciach mapy
        const npcRadius = (0, game_1.calculateRadius)(game_1.GAME_CONSTANTS.NPC_BUBBLE_SCORE);
        const clampedX = Math.max(npcRadius, Math.min(this.gameState.worldSize.width - npcRadius, startX));
        const clampedY = Math.max(npcRadius, Math.min(this.gameState.worldSize.height - npcRadius, startY));
        const npc = {
            id: `npc_turbo_${Date.now()}_${Math.random()}`,
            score: game_1.GAME_CONSTANTS.NPC_BUBBLE_SCORE,
            position: { x: clampedX, y: clampedY }
        };
        this.gameState.npcBubbles[npc.id] = npc;
    }
    updatePhysics(deltaTime) {
        // Aktualizuj pozície hráčov
        Object.values(this.gameState.players).forEach(player => {
            player.position.x += player.velocity.x * deltaTime;
            player.position.y += player.velocity.y * deltaTime;
            // Udržuj hráčov v hraniciach mapy
            player.position.x = Math.max(player.radius, Math.min(this.gameState.worldSize.width - player.radius, player.position.x));
            player.position.y = Math.max(player.radius, Math.min(this.gameState.worldSize.height - player.radius, player.position.y));
        });
    }
    serializeGameState() {
        // Už máme objekty, nie Map, takže len vrátime gameState
        return {
            players: this.gameState.players,
            npcBubbles: this.gameState.npcBubbles,
            worldSize: this.gameState.worldSize
        };
    }
    startGameLoop() {
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
                    if (timeSinceSpawn >= game_1.GAME_CONSTANTS.SPAWN_PROTECTION_DURATION) {
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
                const turboActive = player.turboActive || false;
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
        }, 1000 / game_1.GAME_SETTINGS.GAME_LOOP_FPS); // Používa konfiguračné nastavenie
    }
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.httpServer.close();
    }
    // Mesačný leaderboard metódy
    loadMonthlyLeaderboard() {
        try {
            if (fs.existsSync(this.leaderboardPath)) {
                const data = fs.readFileSync(this.leaderboardPath, 'utf8');
                this.monthlyLeaderboard = JSON.parse(data);
                console.log(`Načítaný mesačný leaderboard: ${this.monthlyLeaderboard.length} záznamov`);
            }
            else {
                this.monthlyLeaderboard = [];
                this.saveMonthlyLeaderboard();
            }
        }
        catch (error) {
            console.error('Chyba pri načítavaní mesačného leaderboardu:', error);
            this.monthlyLeaderboard = [];
        }
    }
    saveMonthlyLeaderboard() {
        try {
            fs.writeFileSync(this.leaderboardPath, JSON.stringify(this.monthlyLeaderboard, null, 2));
        }
        catch (error) {
            console.error('Chyba pri ukladaní mesačného leaderboardu:', error);
        }
    }
    addToMonthlyLeaderboard(player) {
        // Zaznamenávaj všetkých hráčov vrátane botov
        const entry = {
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
    getMonthlyLeaderboard(limit = 10) {
        return this.monthlyLeaderboard.slice(0, limit); // Vráť top X podľa parametra
    }
    getAllMonthlyLeaderboard() {
        return this.monthlyLeaderboard; // Vráť všetkých
    }
    getMonthlyLeaderboardStats() {
        return {
            totalPlayers: this.monthlyLeaderboard.length,
            topLevel: this.monthlyLeaderboard.length > 0 ? this.monthlyLeaderboard[0].level : 0,
            topScore: this.monthlyLeaderboard.length > 0 ? this.monthlyLeaderboard[0].score : 0
        };
    }
}
exports.GameServer = GameServer;
// Spusti server ak je tento súbor spustený priamo
if (require.main === module) {
    new GameServer();
}
