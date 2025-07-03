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
  calculateRadius
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
  const animationFrameRef = useRef<number | undefined>(undefined);
  const mousePositionRef = useRef<Vector2>({ x: 0, y: 0 });
  const joystickInputRef = useRef<Vector2>({ x: 0, y: 0 });
  const fpsRef = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: Date.now() });
  const currentFpsRef = useRef<number>(0);
  const [leaderboard, setLeaderboard] = useState<Array<{nickname: string, level: number, score: number}>>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'live' | 'monthly'>('live');

  const monthlyLeaderboardData = [
    { id: '1', nickname: 'Bublinátor', level: 99, score: 99999 },
    { id: '2', nickname: 'SuperNova', level: 95, score: 95000 },
    { id: '3', nickname: 'Gulička', level: 92, score: 92000 },
    { id: '4', nickname: 'Lord Bublina', level: 89, score: 89000 },
    { id: '5', nickname: 'Neptún', level: 85, score: 85000 },
    { id: '6', nickname: 'Rozpúšťač', level: 82, score: 82000 },
    { id: '7', nickname: 'Guľový Blesk', level: 80, score: 80000 },
    { id: '8', nickname: 'Bublinka', level: 78, score: 78000 },
    { id: '9', nickname: 'Kráľ Gúľ', level: 75, score: 75000 },
    { id: '10', nickname: 'Majster Guličiek', level: 72, score: 72000 },
  ];

  // Detekcia mobilného zariadenia
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Socket.IO pripojenie
  useEffect(() => {
    if (!isPlaying || !nickname) return;

    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join', nickname);
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
  }, [isPlaying, nickname]);

  // Socket pre leaderboard v hlavnom menu
  useEffect(() => {
    if (isPlaying) return; // Nepripájaj sa ak už hráme
    
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
    
    socket.on('connect', () => {
      // Len počúvame gameState pre leaderboard
    });
    
    socket.on('gameState', (state: GameState) => {
      setGameState(state);
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
    if (!gameState || !playerId) return;
    const player = gameState.players[playerId];
    if (!player) return;

    joystickInputRef.current = {
      x: player.position.x + direction.x * 100,
      y: player.position.y + direction.y * 100
    };
  }, [gameState, playerId]);

  // Input update loop
  useEffect(() => {
    if (!socketRef.current || !isConnected || !gameState || !playerId) return;

    const updateInput = () => {
      const player = gameState.players[playerId];
      if (!player) return;

      let targetPosition: Vector2;
      if (isMobile) {
        targetPosition = joystickInputRef.current;
      } else {
        // Prepočítaj mouse pozíciu na world koordináty
        const camera = calculateCamera(player.position, window.innerWidth, window.innerHeight);
        targetPosition = {
          x: mousePositionRef.current.x + camera.x,
          y: mousePositionRef.current.y + camera.y
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
      ctx.scale(dpr, dpr);

      // Gradient pozadie
      const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
      gradient.addColorStop(0, '#E8F4F8');
      gradient.addColorStop(1, '#D0E8F2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      if (!playerId || !gameState.players[playerId]) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const player = gameState.players[playerId]!;
      const camera = calculateCamera(player.position, window.innerWidth, window.innerHeight);

      // Render NPC bubliny
      Object.values(gameState.npcBubbles).forEach(npc => {
        drawBubble(ctx, npc.position, calculateRadius(npc.score), undefined, camera);
      });

      // Render hráčov
      Object.values(gameState.players).forEach(player => {
        drawPlayerBubble(ctx, player, camera);
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
  }, [gameState, playerId]);

  const calculateCamera = (playerPos: Vector2, screenWidth: number, screenHeight: number) => {
    return {
      x: playerPos.x - screenWidth / 2,
      y: playerPos.y - screenHeight / 2
    };
  };

  const drawBubble = (
    ctx: CanvasRenderingContext2D, 
    position: Vector2, 
    radius: number, 
    color: string = '#FFFFFF',
    camera: Vector2
  ) => {
    const screenX = position.x - camera.x;
    const screenY = position.y - camera.y;

    // Skip ak je mimo obrazovky
    if (screenX + radius < 0 || screenX - radius > window.innerWidth ||
        screenY + radius < 0 || screenY - radius > window.innerHeight) {
      return;
    }

    ctx.save();
    
    // Priehľadná výplň
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Biely okraj
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Odlesk
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(screenX - radius * 0.3, screenY - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawPlayerBubble = (
    ctx: CanvasRenderingContext2D,
    player: PlayerBubble,
    camera: Vector2
  ) => {
    drawBubble(ctx, player.position, player.radius!, player.color, camera);

    // Text v bubline
    const screenX = player.position.x - camera.x;
    const screenY = player.position.y - camera.y;

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
    // Score board v ľavom hornom rohu
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, 10, 170, 90);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Level: ${player.level}`, 20, 32);
    ctx.fillText(`Score: ${player.score}`, 20, 52);
    ctx.fillText(`Speed: ${Math.round(player.baseSpeed)}`, 20, 72);
    ctx.fillText(`FPS: ${currentFpsRef.current}`, 20, 92);
    ctx.restore();
  };

  if (!isPlaying) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#E8F4F8] to-[#D0E8F2] flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          {/* Hlavný panel */}
          <div className="bg-white/90 backdrop-blur rounded-3xl shadow-2xl p-8 mb-6">
            <h1 className="text-5xl font-bold text-center mb-8 text-gray-800">
              🫧 Paddock Bubbles 🫧
            </h1>
            
            {/* Vstupné pole pre nickname */}
            <div className="max-w-md mx-auto mb-8">
              <input
                type="text"
                placeholder="Zadaj svoje meno"
                className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-full focus:border-blue-400 focus:outline-none transition-colors"
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
                className="w-full mt-4 px-6 py-4 text-xl font-bold text-white bg-blue-500 rounded-full hover:bg-blue-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
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

          <div className="grid md:grid-cols-2 gap-6">
            {/* Návod hry */}
            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">📖 Ako hrať</h2>
              <div className="space-y-3 text-gray-700">
                <div className="flex items-start">
                  <span className="text-xl mr-3">🖱️</span>
                  <p><strong>Ovládanie:</strong> Pohybuj myšou (PC) alebo použij joystick (mobil)</p>
                </div>
                <div className="flex items-start">
                  <span className="text-xl mr-3">🍽️</span>
                  <p><strong>Jedz menšie bubliny:</strong> Zväčšuj sa jedením NPC a menších hráčov</p>
                </div>
                <div className="flex items-start">
                  <span className="text-xl mr-3">⚡</span>
                  <p><strong>Turbo:</strong> Stlač medzerník (PC) alebo turbo tlačidlo (mobil) pre 2x rýchlosť</p>
                </div>
                <div className="flex items-start">
                  <span className="text-xl mr-3">📈</span>
                  <p><strong>Level up:</strong> Dosiahni 500 bodov pre ďalší level</p>
                </div>
                <div className="flex items-start">
                  <span className="text-xl mr-3">⚠️</span>
                  <p><strong>Pozor:</strong> Turbo spotrebúva body (50/s), minimum 10 bodov</p>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">🏆 Najlepší hráči</h2>
              <div className="flex justify-center mb-4 bg-gray-200/50 rounded-full p-1">
                <button
                  onClick={() => setLeaderboardTab('live')}
                  className={`w-1/2 py-2 rounded-full font-semibold transition-colors ${
                    leaderboardTab === 'live' ? 'bg-white shadow' : 'text-gray-600'
                  }`}
                >
                  Live
                </button>
                <button
                  onClick={() => setLeaderboardTab('monthly')}
                  className={`w-1/2 py-2 rounded-full font-semibold transition-colors ${
                    leaderboardTab === 'monthly' ? 'bg-white shadow' : 'text-gray-600'
                  }`}
                >
                  Mesačný
                </button>
              </div>

              {leaderboardTab === 'live' && (
                <>
                  {gameState && Object.values(gameState.players).length > 0 ? (
                    <div className="space-y-2">
                      {Object.values(gameState.players)
                        .sort((a, b) => b.level - a.level || b.score - a.score)
                        .slice(0, 10)
                        .map((player, index) => (
                          <div key={player.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                            <div className="flex items-center">
                              <span className="text-lg font-bold mr-3 w-6 text-center">
                                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                              </span>
                              <span className="font-medium">{player.nickname}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm text-gray-600">Lvl {player.level}</span>
                              <span className="ml-2 text-sm font-bold">{player.score} pts</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">Pripájam sa k serveru...</p>
                  )}
                </>
              )}

              {leaderboardTab === 'monthly' && (
                <div className="space-y-2">
                  {monthlyLeaderboardData.map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                      <div className="flex items-center">
                        <span className="text-lg font-bold mr-3 w-6 text-center">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                        </span>
                        <span className="font-medium">{player.nickname}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-purple-600">Lvl {player.level}</span>
                        <span className="ml-3 text-sm text-gray-600">{player.score} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ width: '100vw', height: '100vh', cursor: isMobile ? 'default' : 'crosshair' }}
      />
      
      {isMobile && (
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
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-75 text-white p-8 rounded-lg text-center">
          <h2 className="text-2xl mb-4">Koniec hry!</h2>
          <p className="mb-4">Boli ste zjedený</p>
          <button
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            onClick={() => {
              setIsDead(false);
              setNickname('');
              setNicknameInput('');
              setIsPlaying(false);
              setGameState(null);
              setPlayerId(null);
              if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
              }
            }}
          >
            Hrať znova
          </button>
        </div>
      )}
    </div>
  );
} 