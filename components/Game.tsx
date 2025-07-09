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

    const interval = setInterval(updateInput, 1000 / 60); // 60 updates za sekundu pre plynulejšie ovládanie
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
    
    // Nastav správne rozlíšenie canvasu hneď na začiatku
    const setupCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
    };
    
    setupCanvas();
    const dpr = window.devicePixelRatio || 1;

    // Pridaj resize handler
    const handleResize = () => {
      setupCanvas();
    };
    
    window.addEventListener('resize', handleResize);

    const render = (timestamp: number = 0) => {
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
      ctx.scale(dpr * zoom, dpr * zoom);

      // Gradient pozadie
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

      // Render NPC bubliny
      Object.values(gameState.npcBubbles).forEach(npc => {
        drawBubble(ctx, npc.position, calculateRadius(npc.score), undefined, camera, zoom);
      });

      // Render hráčov
      Object.values(gameState.players).forEach(player => {
        drawPlayerBubble(ctx, player, camera, zoom);
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

    // Skip ak je mimo obrazovky
    if (screenX + radius < 0 || screenX - radius > window.innerWidth / zoom ||
        screenY + radius < 0 || screenY - radius > window.innerHeight / zoom) {
      return;
    }

    ctx.save();
    
    // Priehľadná biela výplň pre NPC bubliny
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Biely okraj
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Biely odlesk
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(screenX - radius * 0.3, screenY - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

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

    // Skip ak je mimo obrazovky
    if (screenX + player.radius! < 0 || screenX - player.radius! > window.innerWidth / zoom ||
        screenY + player.radius! < 0 || screenY - player.radius! > window.innerHeight / zoom) {
      return;
    }

    // Blikajúci efekt pre chránených hráčov
    if (player.isInvulnerable) {
      // Vytvor blikajúci efekt - 3 bliknutia za sekundu
      const blinkSpeed = 6; // 6 cyklov za sekundu = 3 bliknutia
      const time = Date.now() / 1000;
      const blinkCycle = (Math.sin(time * blinkSpeed * Math.PI) + 1) / 2; // 0-1
      const opacity = 0.5 + blinkCycle * 0.5; // 0.5-1.0
      ctx.globalAlpha = opacity;
    }

    ctx.save();

    // Dúhové kruhy - každý level pridá novú farebnú líniu
    const ringThickness = GAME_SETTINGS.RING_THICKNESS; // hrúbka každého kruhu
    const ringSpacing = GAME_SETTINGS.RING_SPACING; // medzera medzi kruhmi
    
    // Vykresli kruhy od vonkajšieho k vnútornému
    for (let level = player.level; level >= 1; level--) {
      const ringRadius = player.radius! - (player.level - level) * (ringThickness + ringSpacing);
      
      if (ringRadius > 0) {
        const levelColor = getLevelColor(level);
        
        ctx.strokeStyle = levelColor;
        ctx.lineWidth = ringThickness;
        ctx.beginPath();
        ctx.arc(screenX, screenY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Tmavšia modrá vnútorná výplň pre hráčov
    ctx.fillStyle = 'rgba(37, 99, 235, 0.15)'; // Tmavšia modrá s priehľadnosťou
    ctx.beginPath();
    const innerRadius = Math.max(5, player.radius! - player.level * (ringThickness + ringSpacing));
    ctx.arc(screenX, screenY, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Svetlejší modrý odlesk pre hráčov
    ctx.fillStyle = 'rgba(59, 130, 246, 0.4)'; // Svetlejšia modrá pre odlesk
    ctx.beginPath();
    ctx.arc(screenX - player.radius! * 0.3, screenY - player.radius! * 0.3, player.radius! * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Text v bubline
    ctx.save();
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Škáluj font podľa veľkosti bubliny
    const fontSize = Math.max(10, Math.min(18, player.radius! * 0.18));
    ctx.font = `${fontSize}px Arial`;

    // Nickname
    ctx.fillText(player.nickname, screenX, screenY - fontSize * 1.2);
    
    // Level
    ctx.font = `${fontSize * 0.9}px Arial`;
    ctx.fillText(`Lvl: ${player.level}`, screenX, screenY);
    // Score
    ctx.font = `${fontSize * 0.9}px Arial`;
    ctx.fillText(`Score: ${player.score}`, screenX, screenY + fontSize * 1.2);

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
    
    // Získaj top 5 hráčov
    const topPlayers = Object.values(gameState.players)
      .sort((a, b) => b.level - a.level || b.score - a.score)
      .slice(0, 5);
    
    // Výška panelu závisí od počtu hráčov
    const baseHeight = 130; // pre player stats + turbo
    const leaderboardHeight = topPlayers.length * 20 + 25; // 20px na hráča + header
    const totalHeight = baseHeight + leaderboardHeight;
    
    // Score board v ľavom hornom rohu
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, 10, 220, totalHeight);
    
    // Player stats
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Level: ${player.level}`, 20, 32);
    ctx.fillText(`Score: ${player.score}`, 20, 50);
    ctx.fillText(`Speed: ${Math.round(player.baseSpeed)}`, 20, 68);
    ctx.fillText(`FPS: ${currentFpsRef.current}`, 20, 86);
    
    // Turbo indikátor
    if (turboActive) {
      ctx.fillStyle = '#FF6B6B';
      ctx.font = '14px Arial';
      ctx.fillText(`🚀 TURBO ACTIVE`, 20, 105);
    }
    
    // Separator line
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 115);
    ctx.lineTo(210, 115);
    ctx.stroke();
    
    // Live Leaderboard header
    ctx.fillStyle = '#FFD700'; // zlatá farba pre header
    ctx.font = 'bold 14px Arial';
    ctx.fillText('🏆 LIVE TOP 5', 20, 135);
    
    // Live Leaderboard entries
    ctx.font = '12px Arial';
    topPlayers.forEach((p, index) => {
      const y = 155 + index * 20;
      
      // Pozícia
      ctx.fillStyle = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#FFFFFF';
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      ctx.fillText(medal, 20, y);
      
      // Nickname (skráť ak je dlhý)
      let nickname = p.nickname;
      if (nickname.length > 8) {
        nickname = nickname.substring(0, 7) + '...';
      }
      
      // Zvýrazni seba
      if (p.id === player.id) {
        ctx.fillStyle = '#00FF00'; // zelená pre seba
        ctx.font = 'bold 12px Arial';
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
      }
      
      ctx.fillText(nickname, 45, y);
      
      // Level a Score
      ctx.fillStyle = index < 3 ? (index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32') : '#CCCCCC';
      ctx.font = '11px Arial';
      ctx.fillText(`L${p.level}`, 120, y);
      ctx.fillText(`${p.score}`, 150, y);
    });
    
    ctx.restore();
  };

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