'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  PlayerBubble, 
  NPCBubble, 
  GameState,
  PlayerInput,
  ServerToClientEvents,
  ClientToServerEvents,
  Vector2,
  GAME_SETTINGS,
  calculateRadius,
  getLevelColor
} from '../types/game';
import Joystick from './Joystick';
import TurboButton from './TurboButton';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [nickname, setNickname] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [turboActive, setTurboActive] = useState(false);
  const [isDead, setIsDead] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0); // Nový trigger pre reconnect
  const animationFrameRef = useRef<number | undefined>(undefined);
  const mousePositionRef = useRef<Vector2>({ x: 0, y: 0 });
  const joystickInputRef = useRef<Vector2>({ x: 0, y: 0 }); // Smer joysticku (-1 až 1)
  const fpsRef = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: Date.now() });
  const currentFpsRef = useRef<number>(0);
  // Pridané pre frame limiting
  const lastFrameTimeRef = useRef<number>(0);
  const targetFPS = 60; // Maximálne FPS pre plynulosť
  const frameInterval = 1000 / targetFPS;
  const [leaderboard, setLeaderboard] = useState<Array<{nickname: string, level: number, score: number}>>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'live' | 'monthly'>('live');
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<Array<{id: string, nickname: string, level: number, score: number}>>([]);
  const [leaderboardStats, setLeaderboardStats] = useState<{totalPlayers: number, topLevel: number, topScore: number}>({
    totalPlayers: 0,
    topLevel: 0,
    topScore: 0
  });

  // Odstránené mock dáta - teraz používame skutočné dáta zo servera

  // Detekcia mobilného zariadenia
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Správa overflow na body podľa stavu hry
  useEffect(() => {
    if (isPlaying) {
      // V hre - pridaj game-mode triedu
      document.body.classList.add('game-mode');
    } else {
      // Na domovskej stránke - odstráň game-mode triedu
      document.body.classList.remove('game-mode');
    }
    
    // Cleanup pri unmount
    return () => {
      document.body.classList.remove('game-mode');
    };
  }, [isPlaying]);

  // Socket.IO pripojenie
  useEffect(() => {
    if (!isPlaying || !nickname) return;

    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join', nickname);
      // Požiadaj o mesačný leaderboard hneď pri pripojení
      socket.emit('getMonthlyLeaderboard');
      socket.emit('getLeaderboardStats');
    });

    socket.on('gameState', (state: GameState) => {
      setGameState(state);
      // Nastav playerId ak ešte nie je nastavené
      if (!playerId && socket.id && state.players[socket.id]) {
        setPlayerId(socket.id);
      }
      // Skontroluj či hráč stále žije
      if (playerId && !state.players[playerId]) {
        setIsDead(true);
      }
    });

    socket.on('monthlyLeaderboard', (leaderboard: Array<{id: string, nickname: string, level: number, score: number}>) => {
      setMonthlyLeaderboard(leaderboard);
    });

    socket.on('leaderboardStats', (stats: {totalPlayers: number, topLevel: number, topScore: number}) => {
      setLeaderboardStats(stats);
    });

    socket.on('bubblePopped', (poppedId: string) => {
      if (poppedId === socket.id) {
        setIsDead(true);
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [isPlaying, nickname, reconnectTrigger]); // Pridaný reconnectTrigger

  // Socket pre leaderboard v hlavnom menu
  useEffect(() => {
    if (isPlaying) return; // Nepripájaj sa ak už hráme
    
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
    
    socket.on('connect', () => {
      // Požiadaj o mesačný leaderboard pre hlavné menu
      socket.emit('getMonthlyLeaderboard');
      socket.emit('getLeaderboardStats');
    });
    
    socket.on('gameState', (state: GameState) => {
      setGameState(state);
    });

    socket.on('monthlyLeaderboard', (leaderboard: Array<{id: string, nickname: string, level: number, score: number}>) => {
      setMonthlyLeaderboard(leaderboard);
    });

    socket.on('leaderboardStats', (stats: {totalPlayers: number, topLevel: number, topScore: number}) => {
      setLeaderboardStats(stats);
    });
    
    return () => {
      socket.disconnect();
    };
  }, [isPlaying]);

  // Mouse input handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMobile) return;
    mousePositionRef.current = {
      x: e.clientX,
      y: e.clientY
    };
  }, [isMobile]);

  // Keyboard input handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !isMobile) {
      e.preventDefault();
      setTurboActive(true);
    }
  }, [isMobile]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !isMobile) {
      e.preventDefault();
      setTurboActive(false);
    }
  }, [isMobile]);

  // Joystick handler pre mobile
  const handleJoystickMove = useCallback((direction: Vector2) => {
    // Uložíme smer joysticku
    joystickInputRef.current = direction;
  }, []);

  // Input update loop
  useEffect(() => {
    if (!socketRef.current || !isConnected || !gameState || !playerId) return;

    const updateInput = () => {
      const player = gameState.players[playerId];
      if (!player) return;

      let targetPosition: Vector2;
      const zoom = isMobile ? 0.3 : 1.0;

      if (isMobile) {
        // Pre joystick používame smer na výpočet cieľovej pozície
        const joystickDirection = joystickInputRef.current;
        const moveDistance = 200; // Vzdialenosť kam sa má bublina snažiť ísť
        
        targetPosition = {
          x: player.position.x + joystickDirection.x * moveDistance,
          y: player.position.y + joystickDirection.y * moveDistance
        };
      } else {
        // Prepočítaj mouse pozíciu na world koordináty
        const camera = calculateCamera(player.position, window.innerWidth, window.innerHeight, zoom);
        targetPosition = {
          x: (mousePositionRef.current.x / zoom) + camera.x,
          y: (mousePositionRef.current.y / zoom) + camera.y
        };
      }

      const input: PlayerInput = {
        position: targetPosition,
        turbo: turboActive
      };

      socketRef.current?.emit('updateInput', input);
    };

    // Znížené pre úsporu CPU - stále dostatočne responsívne
    const interval = setInterval(updateInput, 1000 / 30); // 30 updates za sekundu
    return () => clearInterval(interval);
  }, [isConnected, gameState, playerId, isMobile, turboActive]);

  // Event listeners
  useEffect(() => {
    if (!isMobile && isPlaying) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [isMobile, isPlaying, handleMouseMove, handleKeyDown, handleKeyUp]);

  // Render loop
  useEffect(() => {
    if (!canvasRef.current || !gameState) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Zjednodušené nastavenie canvasu bez DPR scaling
    const setupCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
    };
    
    setupCanvas();

    // Pridaj resize handler
    const handleResize = () => {
      setupCanvas();
    };
    
    window.addEventListener('resize', handleResize);

    const render = (timestamp: number = 0) => {
      // Dočasne odstránené frame limiting pre debugging blikania
      // if (timestamp - lastFrameTimeRef.current < frameInterval) {
      //   animationFrameRef.current = requestAnimationFrame(render);
      //   return;
      // }
      // lastFrameTimeRef.current = timestamp;

      const zoom = isMobile ? 0.3 : 1.0;

      // FPS counter
      fpsRef.current.frames++;
      const now = Date.now();
      if (now - fpsRef.current.lastTime >= 1000) {
        currentFpsRef.current = fpsRef.current.frames;
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      }

      // Clear canvas s celou veľkosťou
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      ctx.scale(zoom, zoom);

      // Gradient pozadie - nový gradient každý frame (stabilné)
      const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight / zoom);
      gradient.addColorStop(0, '#E8F4F8');
      gradient.addColorStop(1, '#D0E8F2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, window.innerWidth / zoom, window.innerHeight / zoom);

      if (!playerId || !gameState.players[playerId]) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const player = gameState.players[playerId]!;
      const camera = calculateCamera(player.position, window.innerWidth, window.innerHeight, zoom);

      // Viewport boundaries pre culling
      const viewportBounds = {
        left: camera.x - 100,
        right: camera.x + (window.innerWidth / zoom) + 100,
        top: camera.y - 100,
        bottom: camera.y + (window.innerHeight / zoom) + 100
      };

      // Render NPC bubliny s viewport culling
      Object.values(gameState.npcBubbles).forEach(npc => {
        // Skip ak je mimo viewport (s 100px bufferom)
        if (npc.position.x < viewportBounds.left || npc.position.x > viewportBounds.right ||
            npc.position.y < viewportBounds.top || npc.position.y > viewportBounds.bottom) {
          return;
        }
        drawBubble(ctx, npc.position, calculateRadius(npc.score), undefined, camera, zoom);
      });

      // Render hráčov s viewport culling
      Object.values(gameState.players).forEach(p => {
        // Skip ak je mimo viewport (s bufferom na veľkosť bubliny)
        const buffer = p.radius! + 50;
        if (p.position.x < viewportBounds.left - buffer || p.position.x > viewportBounds.right + buffer ||
            p.position.y < viewportBounds.top - buffer || p.position.y > viewportBounds.bottom + buffer) {
          return;
        }
        drawPlayerBubble(ctx, p, camera, zoom);
      });

      // UI overlay
      drawUI(ctx, player);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render(0);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [gameState, playerId, isMobile]);

  const calculateCamera = (playerPos: Vector2, screenWidth: number, screenHeight: number, zoom: number) => {
    return {
      x: playerPos.x - (screenWidth / 2) / zoom,
      y: playerPos.y - (screenHeight / 2) / zoom
    };
  };

  const drawBubble = (
    ctx: CanvasRenderingContext2D, 
    position: Vector2, 
    radius: number, 
    color: string = '#FFFFFF', // Biele NPC bubliny
    camera: Vector2,
    zoom: number
  ) => {
    const screenX = position.x - camera.x;
    const screenY = position.y - camera.y;

    // Optimalizované: NPC bubliny sú malé, jednoduché krúžky
    ctx.save();
    
    // Jednoduchá biela výplň pre NPC bubliny
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Odlesk iba pre väčšie bubliny (optimalizácia)
    if (radius > 8) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(screenX - radius * 0.3, screenY - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  const drawPlayerBubble = (
    ctx: CanvasRenderingContext2D,
    player: PlayerBubble,
    camera: Vector2,
    zoom: number
  ) => {
    const screenX = player.position.x - camera.x;
    const screenY = player.position.y - camera.y;

    // Blikajúci efekt pre chránených hráčov
    if (player.isInvulnerable) {
      // Optimalizovaný blink - iba 2 cykly za sekundu
      const blinkSpeed = 4; 
      const time = Date.now() / 1000;
      const blinkCycle = (Math.sin(time * blinkSpeed * Math.PI) + 1) / 2;
      const opacity = 0.6 + blinkCycle * 0.4;
      ctx.globalAlpha = opacity;
    }

    ctx.save();

    // Optimalizované kruhy - iba ak je level > 1
    if (player.level > 1) {
      const ringThickness = GAME_SETTINGS.RING_THICKNESS;
      const ringSpacing = GAME_SETTINGS.RING_SPACING;
      
      // Vykresli iba posledné 3 kruhy pre performancu
      const maxRings = Math.min(3, player.level);
      const startLevel = Math.max(1, player.level - maxRings + 1);
      
      for (let level = player.level; level >= startLevel; level--) {
        const ringRadius = player.radius! - (player.level - level) * (ringThickness + ringSpacing);
        
        if (ringRadius > 5) {
          const levelColor = getLevelColor(level);
          
          ctx.strokeStyle = levelColor;
          ctx.lineWidth = ringThickness;
          ctx.beginPath();
          ctx.arc(screenX, screenY, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Tmavšia modrá vnútorná výplň pre hráčov
    ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
    ctx.beginPath();
    const innerRadius = Math.max(8, player.radius! - Math.min(3, player.level) * (GAME_SETTINGS.RING_THICKNESS + GAME_SETTINGS.RING_SPACING));
    ctx.arc(screenX, screenY, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Odlesk iba pre väčšie bubliny
    if (player.radius! > 15) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.beginPath();
      ctx.arc(screenX - player.radius! * 0.3, screenY - player.radius! * 0.3, player.radius! * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Optimalizovaný text - iba nickname a level pre malé bubliny
    ctx.save();
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fontSize = Math.max(8, Math.min(16, player.radius! * 0.15));
    
    if (player.radius! > 20) {
      // Plný text pre väčšie bubliny
      ctx.font = `${fontSize}px Arial`;
      ctx.fillText(player.nickname, screenX, screenY - fontSize * 1.1);
      
      ctx.font = `${fontSize * 0.8}px Arial`;
      ctx.fillText(`L${player.level}`, screenX, screenY);
      ctx.fillText(`${player.score}`, screenX, screenY + fontSize * 1.1);
    } else {
      // Iba nickname pre malé bubliny
      ctx.font = `${fontSize}px Arial`;
      const shortName = player.nickname.length > 6 ? player.nickname.substring(0, 5) + '.' : player.nickname;
      ctx.fillText(shortName, screenX, screenY);
    }

    ctx.restore();
    
    // Resetuj opacity
    if (player.isInvulnerable) {
      ctx.globalAlpha = 1.0;
    }
  };

  const drawParticle = (
    ctx: CanvasRenderingContext2D,
    position: Vector2,
    camera: Vector2
  ) => {
    const screenX = position.x - camera.x;
    const screenY = position.y - camera.y;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const drawUI = (ctx: CanvasRenderingContext2D, player: PlayerBubble) => {
    if (!gameState) return;
    
    // Cache top players computation - update only every 500ms
    if (!drawUI.lastUpdate || Date.now() - drawUI.lastUpdate > 500) {
      drawUI.topPlayers = Object.values(gameState.players)
        .sort((a, b) => b.level - a.level || b.score - a.score)
        .slice(0, 5);
      drawUI.lastUpdate = Date.now();
    }
    
    const topPlayers = drawUI.topPlayers || [];
    
    // Kompaktnejší UI pre lepší výkon
    const baseHeight = 110; // zmenšené
    const leaderboardHeight = topPlayers.length * 18 + 22; // zmenšené
    const totalHeight = baseHeight + leaderboardHeight;
    
    // Score board v ľavom hornom rohu
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(8, 8, 200, totalHeight);
    
    // Player stats - kompaktnejšie
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`L${player.level} | ${player.score}pts`, 16, 28);
    ctx.fillText(`Speed: ${Math.round(player.baseSpeed)}`, 16, 46);
    
    // Performance info
    ctx.font = '12px Arial';
    ctx.fillStyle = currentFpsRef.current < 40 ? '#FF6B6B' : currentFpsRef.current < 55 ? '#FFA500' : '#00FF00';
    ctx.fillText(`FPS: ${currentFpsRef.current}`, 16, 64);
    
    // Turbo indikátor - kompaktný
    if (turboActive) {
      ctx.fillStyle = '#FF6B6B';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(`🚀 TURBO`, 16, 82);
    }
    
    // Separator line
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 95);
    ctx.lineTo(192, 95);
    ctx.stroke();
    
    // Live Leaderboard header
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('🏆 TOP 5', 16, 112);
    
    // Live Leaderboard entries - optimalizované
    ctx.font = '10px Arial';
    topPlayers.forEach((p, index) => {
      const y = 128 + index * 18;
      
      // Medal
      ctx.fillStyle = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#FFFFFF';
      const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}`;
      ctx.fillText(medal, 16, y);
      
      // Nickname - skrátený
      let nickname = p.nickname.length > 7 ? p.nickname.substring(0, 6) + '.' : p.nickname;
      
      // Zvýrazni seba
      ctx.fillStyle = p.id === player.id ? '#00FF00' : '#FFFFFF';
      ctx.font = p.id === player.id ? 'bold 10px Arial' : '10px Arial';
      ctx.fillText(nickname, 38, y);
      
      // Stats
      ctx.fillStyle = '#CCCCCC';
      ctx.font = '9px Arial';
      ctx.fillText(`L${p.level}`, 120, y);
      ctx.fillText(`${p.score}`, 145, y);
    });
    
    ctx.restore();
  };
  
  // Add static properties for caching
  drawUI.lastUpdate = 0;
  drawUI.topPlayers = [];

  if (!isPlaying) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#E8F4F8] to-[#D0E8F2] py-6 px-6 overflow-y-auto">
        <div className="max-w-5xl w-full mx-auto">
          {/* Hlavný panel */}
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-10 mb-8 text-center">
            <h1 className="text-6xl font-bold mb-4 text-gray-800">
              🫧 Paddock Bubbles 🫧
            </h1>
            <p className="text-xl text-gray-600 mb-8">Multiplayer bubble game</p>
            
            {/* Vstupné pole pre nickname */}
            <div className="max-w-sm mx-auto">
              <input
                type="text"
                placeholder="Zadaj svoje meno"
                className="w-full px-8 py-4 text-lg border-2 border-gray-300 rounded-full focus:border-blue-400 focus:outline-none transition-colors mb-4"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && nicknameInput.trim()) {
                    setNickname(nicknameInput.trim());
                    setIsPlaying(true);
                  }
                }}
                maxLength={20}
              />
              <button
                className="w-full px-8 py-4 text-xl font-bold text-white bg-blue-500 rounded-full hover:bg-blue-600 transform hover:scale-105 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:transform-none"
                onClick={() => {
                  if (nicknameInput.trim()) {
                    setNickname(nicknameInput.trim());
                    setIsPlaying(true);
                  }
                }}
                disabled={!nicknameInput.trim()}
              >
                🎮 Začať hru
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Návod hry */}
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8">
              <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">📖 Ako hrať</h2>
              <div className="space-y-5 text-gray-700">
                <div className="flex items-start space-x-4">
                  <span className="text-2xl flex-shrink-0">🖱️</span>
                  <div>
                    <h3 className="font-semibold text-lg">Ovládanie</h3>
                    <p>Pohybuj myšou (PC) alebo použij joystick (mobil)</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <span className="text-2xl flex-shrink-0">🍽️</span>
                  <div>
                    <h3 className="font-semibold text-lg">Jedz menšie bubliny</h3>
                    <p>Zväčšuj sa jedením NPC a menších hráčov</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <span className="text-2xl flex-shrink-0">⚡</span>
                  <div>
                    <h3 className="font-semibold text-lg">Turbo</h3>
                    <p>Stlač medzerník (PC) alebo turbo tlačidlo (mobil) pre 2x rýchlosť a vypúšťanie NPC bublín za sebou</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <span className="text-2xl flex-shrink-0">📈</span>
                  <div>
                    <h3 className="font-semibold text-lg">Level up</h3>
                    <p>Dosiahni {GAME_SETTINGS.LEVEL_UP_BASE} bodov pre level 2, ďalšie levely +{GAME_SETTINGS.LEVEL_UP_INCREMENT} bodov (každý level +{GAME_SETTINGS.SPEED_LEVEL_INCREASE} rýchlosť)</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <span className="text-2xl flex-shrink-0">⚠️</span>
                  <div>
                    <h3 className="font-semibold text-lg">Pozor</h3>
                    <p>Turbo zrýchľuje {GAME_SETTINGS.TURBO_SPEED_MULTIPLIER}x, ale spotrebúva {GAME_SETTINGS.TURBO_DRAIN_RATE} bodov/s, minimum {GAME_SETTINGS.MIN_TURBO_SCORE} bodov. <strong>Väčší hráč = pomalší!</strong></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8">
              <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">🏆 Najlepší hráči</h2>
              <div className="flex justify-center mb-6 bg-gray-100 rounded-full p-1 max-w-xs mx-auto">
                <button
                  onClick={() => setLeaderboardTab('live')}
                  className={`flex-1 py-3 rounded-full font-semibold transition-colors ${
                    leaderboardTab === 'live' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Live
                </button>
                <button
                  onClick={() => {
                    setLeaderboardTab('monthly');
                    // Požiadaj o aktuálny mesačný leaderboard
                    if (socketRef.current?.connected) {
                      socketRef.current.emit('getMonthlyLeaderboard');
                    } else {
                      // Ak nie sme pripojení v hre, použij nové pripojenie
                      const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
                      socket.on('connect', () => {
                        socket.emit('getMonthlyLeaderboard');
                      });
                      socket.on('monthlyLeaderboard', (leaderboard: Array<{id: string, nickname: string, level: number, score: number}>) => {
                        setMonthlyLeaderboard(leaderboard);
                        socket.disconnect();
                      });
                    }
                  }}
                  className={`flex-1 py-3 rounded-full font-semibold transition-colors ${
                    leaderboardTab === 'monthly' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Mesačný
                </button>
              </div>

              {leaderboardTab === 'live' && (
                <>
                  {gameState && Object.values(gameState.players).length > 0 ? (
                    <div className="space-y-2">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 text-sm font-semibold text-gray-600 border-b border-gray-200">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-6">Hráč</div>
                        <div className="col-span-2 text-center">Level</div>
                        <div className="col-span-3 text-right">Skóre</div>
                      </div>
                      
                      {/* Players */}
                      {Object.values(gameState.players)
                        .sort((a, b) => b.level - a.level || b.score - a.score)
                        .slice(0, 8)
                        .map((player, index) => (
                          <div key={player.id} className="grid grid-cols-12 gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors items-center">
                            <div className="col-span-1 text-center">
                              <span className="text-lg font-bold">
                                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                              </span>
                            </div>
                            <div className="col-span-6">
                              <span className="font-medium text-gray-800">{player.nickname}</span>
                            </div>
                            <div className="col-span-2 text-center">
                              <span className="text-sm font-semibold text-blue-600">Lvl {player.level}</span>
                            </div>
                            <div className="col-span-3 text-right">
                              <span className="text-sm text-gray-600">{player.score} pts</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-4">🔄</div>
                      <p className="text-gray-500">Pripájam sa k serveru...</p>
                    </div>
                  )}
                </>
              )}

              {leaderboardTab === 'monthly' && (
                <div className="space-y-4">
                  {/* Štatistiky */}
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-purple-600">{leaderboardStats.totalPlayers}</div>
                        <div className="text-sm text-gray-600">Celkom hráčov</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-600">Lvl {leaderboardStats.topLevel}</div>
                        <div className="text-sm text-gray-600">Najvyšší level</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">{leaderboardStats.topScore}</div>
                        <div className="text-sm text-gray-600">Najvyššie skóre</div>
                      </div>
                    </div>
                  </div>

                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-sm font-semibold text-gray-600 border-b border-gray-200">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-6">Hráč</div>
                    <div className="col-span-2 text-center">Level</div>
                    <div className="col-span-3 text-right">Skóre</div>
                  </div>
                  
                  {/* Players */}
                  {monthlyLeaderboard.length > 0 ? (
                    monthlyLeaderboard.slice(0, 8).map((player, index) => (
                      <div key={player.id} className="grid grid-cols-12 gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors items-center">
                        <div className="col-span-1 text-center">
                          <span className="text-lg font-bold">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                          </span>
                        </div>
                        <div className="col-span-6">
                          <span className="font-medium text-gray-800">{player.nickname}</span>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="text-sm font-semibold text-purple-600">Lvl {player.level}</span>
                        </div>
                        <div className="col-span-3 text-right">
                          <span className="text-sm text-gray-600">{player.score} pts</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-4">📊</div>
                      <p className="text-gray-500">Zatiaľ žiadni hráči v mesačnom leaderboarde</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ height: '100dvh' }}>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ 
          width: '100vw', 
          height: '100dvh', 
          cursor: isMobile ? 'default' : 'crosshair',
          touchAction: 'none' // Prevent default touch behaviors
        }}
      />
      
      {isMobile && isPlaying && !isDead && (
        <>
          <Joystick onMove={handleJoystickMove} />
          <TurboButton 
            onPress={() => setTurboActive(true)} 
            onRelease={() => setTurboActive(false)}
          />
        </>
      )}
      
      {!isConnected && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-4 rounded">
          Pripájam sa k serveru...
        </div>
      )}
      
      {isDead && playerId && !gameState?.players[playerId] && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-75 text-white p-8 rounded-lg text-center" style={{ zIndex: 3000 }}>
          <h2 className="text-2xl mb-4">Koniec hry!</h2>
          <p className="mb-6">Boli ste zjedený</p>
          <div className="flex gap-4 justify-center">
            <button
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors"
              onClick={() => {
                setIsDead(false);
                setIsConnected(false); // RESETUJ connection status
                // ZOSTAŇ V HRE - necháme isPlaying: true a zachováme nickname
                // setIsPlaying(true); // už je true, netreba meniť
                setGameState(null);
                setPlayerId(null);
                if (socketRef.current) {
                  socketRef.current.disconnect();
                  socketRef.current = null;
                }
                // Trigger pre nové pripojenie
                setReconnectTrigger(prev => prev + 1);
                // Nickname a nicknameInput ostávajú zachované pre okamžité pripojenie
              }}
            >
              🎮 Hrať znova
            </button>
            <button
              className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700 transition-colors"
              onClick={() => {
                setIsDead(false);
                setIsConnected(false);
                setIsPlaying(false); // Vráť sa na domovskú stránku
                setGameState(null);
                setPlayerId(null);
                if (socketRef.current) {
                  socketRef.current.disconnect();
                  socketRef.current = null;
                }
                // Zachovaj nickname pre prípad že ho chce použiť znova
                // setNickname(''); // nemazať nickname
                // setNicknameInput(''); // nemazať nicknameInput
              }}
            >
              🏠 Ukončiť hru
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 