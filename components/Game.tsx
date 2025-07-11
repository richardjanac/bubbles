'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import dynamic from 'next/dynamic';
import { 
  GameState, 
  PlayerBubble, 
  NPCBubble,
  PlayerInput, 
  ServerToClientEvents,
  ClientToServerEvents,
  Vector2,
  GAME_SETTINGS,
  calculateRadius
} from '../types/game';

// Lazy load heavy components
const Joystick = dynamic(() => import('./Joystick'));
const TurboButton = dynamic(() => import('./TurboButton'));

export default function Game() {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketInitialized = useRef(false); // Ochrana proti dvojitému mountovaniu
  const mousePositionRef = useRef<Vector2>({ x: 0, y: 0 });
  const joystickInputRef = useRef<Vector2>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const fpsRef = useRef({ frames: 0, lastTime: Date.now() });
  const currentFpsRef = useRef(0);
  const lastServerResponse = useRef(Date.now());
  const lastInputTime = useRef(0);
  
  // State
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [nickname, setNickname] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [turboActive, setTurboActive] = useState(false);
  const [isDead, setIsDead] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  // Particle system pre bubble pop efekt
  // Particles state odstránený - efekt vypnutý pre výkonnosť
  // const [particles, setParticles] = useState<Array<...>>([]);
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
      // Komplexná detekcia mobilných zariadení
      const hasTouchstart = 'ontouchstart' in window;
      const hasMaxTouchPoints = navigator.maxTouchPoints > 0;
      
      // User agent detekcia pre istotu
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
      const isMobileUserAgent = mobileRegex.test(navigator.userAgent);
      
      // Detekcia malej obrazovky (typicky mobily)
      const isSmallScreen = window.innerWidth <= 768;
      
      // Detekcia orientácie (mobily majú orientation API)
      const hasOrientation = 'orientation' in window || 'orientation' in screen;
      
      // Finálne rozhodnutie - ak má touch ALEBO je to mobilný user agent
      const isMobileResult = (hasTouchstart || hasMaxTouchPoints) && isMobileUserAgent;
      
      // Vylúč Windows zariadenia s touch (Surface, dotykové notebooky)
      const isWindowsWithTouch = hasMaxTouchPoints && navigator.userAgent.includes('Windows');
      
      setIsMobile(isMobileResult && !isWindowsWithTouch);
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

  // Performance monitoring
  const [connectionLatency, setConnectionLatency] = useState<number>(0);
  const [inputLatency, setInputLatency] = useState<number>(0);
  const [renderLatency, setRenderLatency] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  // Connection latency test
  const testLatency = useCallback(() => {
    if (!socketRef.current) return;
    
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      setConnectionLatency(9999); // Timeout indicator
    }, 5000);
    
    socketRef.current.emit('ping', startTime);
    
    socketRef.current.once('pong', (sentTime: number) => {
      clearTimeout(timeoutId);
      const latency = Date.now() - sentTime;
      setConnectionLatency(latency);
    });
  }, []);

  // Socket.IO pripojenie
  useEffect(() => {
    if (!isPlaying || !nickname) return;
    
    // Ochrana proti dvojitému mountovaniu v React Strict Mode
    if (socketInitialized.current) return;
    socketInitialized.current = true;

    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001', {
      transports: isMobile ? ['polling', 'websocket'] : ['websocket', 'polling'], // Mobile začne s polling pre stabilitu
      upgrade: true, // Povoľ upgrade z polling na websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 3,
      timeout: isMobile ? 10000 : 5000, // Dlhší timeout pre mobilné siete
      // Dodatočné optimalizácie pre mobilné siete
      closeOnBeforeunload: false, // Stabilnejšie pre mobile browsery
      withCredentials: false, // Zníženie overhead
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      socket.emit('join', nickname);
      // Požiadaj o mesačný leaderboard hneď pri pripojení
      socket.emit('getMonthlyLeaderboard');
      socket.emit('getLeaderboardStats');
    });

    socket.on('connect_error', (error) => {
      console.error('🔴 Socket.IO connection error:', error);
      setConnectionStatus('error');
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    });

    socket.on('gameState', (data: any) => {
      const now = Date.now();
      lastServerResponse.current = now;
      
      let state: GameState;
      
      // Spracuj delta alebo full update
      if (data.full) {
        // Full update
        state = data.state;
        setGameState(state);
      } else {
        // Delta update - aplikuj zmeny na existujúci stav
        if (!gameState) return; // Nemôžeme aplikovať delta bez základného stavu
        
        const newState = JSON.parse(JSON.stringify(gameState)); // Deep copy
        
        // Aplikuj zmeny hráčov
        Object.entries(data.players).forEach(([id, changes]: [string, any]) => {
          if (changes.removed) {
            delete newState.players[id];
          } else if (changes.new) {
            newState.players[id] = changes;
          } else {
            // Aplikuj čiastočné zmeny
            if (!newState.players[id]) return;
            Object.assign(newState.players[id], changes);
          }
        });
        
        // Aplikuj zmeny NPC
        if (data.npcBubbles) {
          // Pridaj nové NPC
          Object.entries(data.npcBubbles.added).forEach(([id, npc]) => {
            newState.npcBubbles[id] = npc as NPCBubble;
          });
          
          // Odstráň NPC
          data.npcBubbles.removed.forEach((id: string) => {
            delete newState.npcBubbles[id];
          });
        }
        
        state = newState;
        setGameState(state);
      }
      
      // Diagnostika veľkosti payloadu
      const stateSize = new Blob([JSON.stringify(data)]).size;
      const playerCount = Object.keys(state.players).length;
      const npcCount = Object.keys(state.npcBubbles).length;
      const updateType = data.full ? 'FULL' : 'DELTA';
      console.log(`📊 ${updateType}: ${(stateSize / 1024).toFixed(1)}KB | ${playerCount} players | ${npcCount} NPCs`);
      
      // Calculate input latency - iba ak je to recent
      if (lastInputTime.current > 0) {
        const inputLag = now - lastInputTime.current;
        // Zobraz input latency iba ak je rozumná (< 10 sekúnd)
        if (inputLag < 10000) {
          setInputLatency(inputLag);
        }
        // Reset input time pre nové meranie
        lastInputTime.current = 0;
      }
      
      // Nastav playerId ak ešte nie je nastavené
      if (!playerId && socket.id && state.players[socket.id]) {
        setPlayerId(socket.id);
      }
      // Skontroluj či hráč stále žije
      if (playerId && !state.players[playerId]) {
        setIsDead(true);
      }
    });

    // Latency monitoring
    const latencyInterval = setInterval(testLatency, 2000);

    socket.on('monthlyLeaderboard', (leaderboard: Array<{id: string, nickname: string, level: number, score: number}>) => {
      setMonthlyLeaderboard(leaderboard);
    });

    socket.on('leaderboardStats', (stats: {totalPlayers: number, topLevel: number, topScore: number}) => {
      setLeaderboardStats(stats);
    });

    socket.on('bubblePopped', (poppedId: string) => {
      if (poppedId === socket.id) {
        setIsDead(true);
      } else {
        // Vytvor particle efekt pre prasklú bublinu
        const poppedPlayer = gameState?.players[poppedId];
        if (poppedPlayer) {
          createBubblePopEffect(poppedPlayer.position, poppedPlayer.radius!, poppedPlayer.color || '#FFFFFF');
        }
      }
    });

    return () => {
      socket.disconnect();
      clearInterval(latencyInterval);
      socketRef.current = null;
      socketInitialized.current = false; // Reset flag pri unmount
    };
  }, [isPlaying, nickname, reconnectTrigger, isMobile]); // Pridaný reconnectTrigger

  // Načítaj leaderboard len raz pri mount
  useEffect(() => {
    if (!isPlaying && socketRef.current) {
      socketRef.current.emit('getMonthlyLeaderboard');
      socketRef.current.emit('getLeaderboardStats');
    }
  }, [isPlaying]);

  // Mouse input handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMobile) {
      return;
    }
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
    joystickInputRef.current = direction;
  }, []);

  // Ref pre aktuálny game state - aby sme nemuseli restartovať input loop
  const gameStateRef = useRef<GameState | null>(null);
  
  // Aktualizuj gameStateRef pri každej zmene
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Input update loop
  useEffect(() => {
    
    if (!socketRef.current) {
      return;
    }
    if (!isConnected) {
      return;
    }
    if (!gameStateRef.current) {
      return;
    }
    if (!playerId) {
      return;
    }
    

    const updateInput = () => {
      // Použij aktuálny gameState z ref
      const currentGameState = gameStateRef.current;
      if (!currentGameState) {
        return;
      }
      
      const player = currentGameState.players[playerId];
      if (!player) {
        return;
      }

      let targetPosition: Vector2;
      const zoom = isMobile ? 0.5 : 1.0; // 67% väčší zoom pre mobily

      if (isMobile) {
        // Pre joystick používame smer na výpočet cieľovej pozície
        const joystickDirection = joystickInputRef.current;
        
        // Ak je joystick v pokoji (0,0), okamžite zastav bublinu
        if (Math.abs(joystickDirection.x) < 0.01 && Math.abs(joystickDirection.y) < 0.01) {
          targetPosition = {
            x: player.position.x,
            y: player.position.y
          };
        } else {
          // Normalizuj smer joysticku - vzdialenosť od stredu je irelevantná
          const magnitude = Math.sqrt(joystickDirection.x * joystickDirection.x + joystickDirection.y * joystickDirection.y);
          const normalizedX = magnitude > 0 ? joystickDirection.x / magnitude : 0;
          const normalizedY = magnitude > 0 ? joystickDirection.y / magnitude : 0;
          
          // Konštantná vzdialenosť pre target pozíciu
          const moveDistance = 300; // Zvýšené pre lepšiu odozvu
          targetPosition = {
            x: player.position.x + normalizedX * moveDistance,
            y: player.position.y + normalizedY * moveDistance
          };
        }
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
        turbo: turboActive,
        isMobile: isMobile
      };

      

      // Vždy pošli input - neblokuj na základe server response
      lastInputTime.current = Date.now();
      socketRef.current?.emit('updateInput', input);
    };

    // Adaptívne input frequency
    const inputFrequency = isMobile ? (1000 / 30) : (1000 / 20); // Mobile: 30fps (z 15), Desktop: 20fps
    
    const interval = setInterval(updateInput, inputFrequency);
    
    // Cleanup pre input latency timeout - ak server neodpovedá viac ako 5s
    const inputTimeoutCleanup = setInterval(() => {
      if (lastInputTime.current > 0 && Date.now() - lastInputTime.current > 5000) {
        
        lastInputTime.current = 0;
        setInputLatency(0);
      }
    }, 1000);
    
    return () => {
      
      clearInterval(interval);
      clearInterval(inputTimeoutCleanup);
    };
  }, [isConnected, playerId, isMobile, turboActive]); 

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
      const dpr = window.devicePixelRatio || 1; // Device pixel ratio pre ostré zobrazenie
      
      // Nastav skutočnú veľkosť canvasu s DPR
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      
      // Nastav CSS veľkosť
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      
      // Škáluj kontext pre DPR
      const context = canvas.getContext('2d');
      if (context) {
        context.scale(dpr, dpr);
        // Nastav image smoothing pre lepšiu kvalitu
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
      }
    };
    
    setupCanvas();

    // Pridaj resize handler
    const handleResize = () => {
      setupCanvas();
    };
    
    window.addEventListener('resize', handleResize);

    // Mobile FPS optimalizácia - target 30fps pre iPhone X
    const targetFPS = isMobile ? 30 : 60;
    const frameInterval = 1000 / targetFPS;
    let lastFrameTime = 0;

    const render = (timestamp: number = 0) => {
      const renderStart = performance.now();
      
      // FPS throttling pre mobile zariadenia
      if (isMobile && timestamp - lastFrameTime < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = timestamp;

      const zoom = isMobile ? 0.5 : 1.0; // 67% väčší zoom pre mobily

      // FPS counter
      fpsRef.current.frames++;
      const now = Date.now();
      if (now - fpsRef.current.lastTime >= 1000) {
        currentFpsRef.current = fpsRef.current.frames;
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      }

      // Clear canvas s celou veľkosťou
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      ctx.scale(dpr * zoom, dpr * zoom); // Aplikuj DPR aj zoom

      // Tmavo modré pozadie ako na obrázku
      ctx.fillStyle = '#07355a';
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

      // Particle efekt vypnutý pre lepšiu výkonnosť
      // drawParticles(ctx, camera, zoom);

      // UI overlay
      drawUI(ctx, player);

      // Calculate render latency
      const renderEnd = performance.now();
      const renderTime = renderEnd - renderStart;
      if (renderTime > 0) {
        setRenderLatency(Math.round(renderTime * 100) / 100); // Round to 2 decimal places
      }

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

    ctx.save();
    
    // Jednoduchá biela bublina s 3% opacity
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();

    // 2px biely okraj s 100% opacity
    ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Podlhovastý biely odlesk ako na obrázku
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.save();
    ctx.translate(screenX - radius * 0.3, screenY - radius * 0.3);
    ctx.rotate(-Math.PI / 6); // Mierne natočený
    ctx.scale(2, 0.8); // Podlhovastý tvar - 2x širší, 0.8x užší
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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
      const blinkSpeed = 4; 
      const time = Date.now() / 1000;
      const blinkCycle = (Math.sin(time * blinkSpeed * Math.PI) + 1) / 2;
      const opacity = 0.6 + blinkCycle * 0.4;
      ctx.globalAlpha = opacity;
    }

    ctx.save();

    // Jednoduchá biela bublina s 3% opacity
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.arc(screenX, screenY, player.radius!, 0, Math.PI * 2);
    ctx.fill();

    // Solid color kruhy pre levely - iba ak je level > 1 (OPTIMALIZOVANÉ PRE MOBILE)
    if (player.level > 1) {
      const ringThickness = GAME_SETTINGS.RING_THICKNESS + 1; // Trochu hrubšie
      const ringSpacing = GAME_SETTINGS.RING_SPACING;
      
      // Dúhové farby pre každý level (solid colors, no gradients)
      const levelColors = [
        'rgba(255, 255, 255, 0.9)', // Level 1 - Biela
        'rgba(255, 0, 0, 0.9)',     // Level 2 - Červená
        'rgba(255, 165, 0, 0.9)',   // Level 3 - Oranžová
        'rgba(255, 255, 0, 0.9)',   // Level 4 - Žltá
        'rgba(0, 255, 0, 0.9)',     // Level 5 - Zelená
        'rgba(0, 255, 255, 0.9)',   // Level 6 - Cyan
        'rgba(0, 0, 255, 0.9)',     // Level 7 - Modrá
        'rgba(128, 0, 128, 0.9)',   // Level 8 - Fialová
        'rgba(255, 0, 255, 0.9)',   // Level 9 - Magenta
        'rgba(255, 192, 203, 0.9)'  // Level 10+ - Ružová
      ];
      
      const maxRings = player.level; // Zobraz všetky level kruhy
      const startLevel = 1; // Začni od level 1
      
      for (let level = player.level; level >= startLevel; level--) {
        const ringRadius = player.radius! - (player.level - level) * (ringThickness + ringSpacing);
        
        if (ringRadius > 8) {
          // Použij solid farbu namiesto gradientu pre výkonnosť
          const colorIndex = Math.min(level - 1, levelColors.length - 1);
          const selectedColor = levelColors[colorIndex];
          
          ctx.strokeStyle = selectedColor;
          ctx.lineWidth = ringThickness;
          ctx.beginPath();
          ctx.arc(screenX, screenY, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Biely okraj 2px s 100% opacity
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, player.radius!, 0, Math.PI * 2);
    ctx.stroke();

    // Podlhovastý biely odlesk s 50% opacity ako na obrázku
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.save();
    ctx.translate(screenX - player.radius! * 0.3, screenY - player.radius! * 0.3);
    ctx.rotate(-Math.PI / 6); // Mierne natočený
    ctx.scale(2, 0.8); // Podlhovastý tvar - 2x širší, 0.8x užší
    ctx.beginPath();
    ctx.arc(0, 0, player.radius! * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Text v bubline - veľké skóre v strede, meno a level pod ním
    ctx.save();
    ctx.fillStyle = '#FFFFFF'; // Biely text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // EXTRA VEĽKÉ skóre v strede bubliny
    const scoreFontSize = Math.max(16, Math.min(32, player.radius! * 0.4));
    ctx.font = `bold ${scoreFontSize}px Arial`;
    ctx.fillText(player.score.toString(), screenX, screenY - scoreFontSize * 0.15);
    
    // Väčší text - nickname pod skóre
    const nameFontSize = Math.max(12, Math.min(18, player.radius! * 0.2));
    ctx.font = `bold ${nameFontSize}px Arial`;
    const shortName = player.nickname.length > 8 ? player.nickname.substring(0, 7) + '.' : player.nickname;
    ctx.fillText(shortName, screenX, screenY + scoreFontSize * 0.5);
    
    // Väčší level pod nickname
    const levelFontSize = Math.max(10, Math.min(16, player.radius! * 0.16));
    ctx.font = `${levelFontSize}px Arial`;
    ctx.fillStyle = '#FFFFFF'; // Biely text pre level
    ctx.fillText(`Level ${player.level}`, screenX, screenY + scoreFontSize * 0.5 + nameFontSize * 1.1);

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
    const zoom = isMobile ? 0.5 : 1.0;
    const screenWidth = window.innerWidth / zoom;
    
    ctx.save();
    
    if (isMobile) {
      // MOBILE: Horizontal scoreboard hore
      const barHeight = 50;
      const padding = 8;
      
      // Pozadie pre celý scoreboard
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, screenWidth, barHeight);
      
      // Player stats - ľavý roh
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`L${player.level} | ${player.score}pts`, padding, 20);
      
      // FPS a turbo - pod stats
      ctx.font = '12px Arial';
      let statusText = `Speed: ${Math.round(player.baseSpeed)}`;
      if (turboActive) {
        statusText += ' | 🚀 TURBO';
        ctx.fillStyle = '#FF6B6B';
      } else {
        ctx.fillStyle = '#CCCCCC';
      }
      ctx.fillText(statusText, padding, 38);
      
      // TOP 3 hráči - horizontálne v strede/vpravo
      if (topPlayers.length > 0) {
        const leaderStartX = screenWidth * 0.35; // Začni od 35% obrazovky
        const playerWidth = (screenWidth * 0.6) / Math.min(3, topPlayers.length); // Rozdeľ zvyšok medzi top 3
        
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏆 TOP 3', leaderStartX + (playerWidth * 1.5), 15);
        
        topPlayers.slice(0, 3).forEach((p, index) => {
          const x = leaderStartX + (index * playerWidth) + (playerWidth / 2);
          
          // Medal a nickname
          const medal = ['🥇', '🥈', '🥉'][index];
          ctx.fillStyle = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32';
          ctx.font = 'bold 14px Arial';
          ctx.fillText(medal, x - 25, 30);
          
          // Nickname
          ctx.fillStyle = p.id === player.id ? '#00FF00' : '#FFFFFF';
          ctx.font = p.id === player.id ? 'bold 12px Arial' : '12px Arial';
          const shortName = p.nickname.length > 6 ? p.nickname.substring(0, 5) + '.' : p.nickname;
          ctx.fillText(shortName, x, 30);
          
          // Skóre
          ctx.fillStyle = '#CCCCCC';
          ctx.font = '10px Arial';
          ctx.fillText(`${p.score}`, x, 43);
        });
      }
      
    } else {
      // DESKTOP: Pôvodný vertikálny scoreboard
      const baseHeight = 110;
      const leaderboardHeight = topPlayers.length * 18 + 22;
      const totalHeight = baseHeight + leaderboardHeight;
      
      // Score board v ľavom hornom rohu
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
    }
    
    ctx.restore();
  };
  
  // Add static properties for caching
  drawUI.lastUpdate = 0;
  drawUI.topPlayers = [] as PlayerBubble[];

  // Bubble pop efekt vypnutý pre lepšiu výkonnosť
  const createBubblePopEffect = useCallback((position: Vector2, radius: number, color: string) => {
    // Efekt vypnutý - žiadne particles sa nevytvárajú
    return;
  }, []);

  // Particle update vypnutý - žiadne particles sa nepoužívajú
  // useEffect(() => {
  //   if (particles.length === 0) return;
  //   const updateParticles = () => { ... };
  //   const interval = setInterval(updateParticles, 16);
  //   return () => clearInterval(interval);
  // }, [particles.length]);

  // Particle rendering vypnutý pre lepšiu výkonnosť
  const drawParticles = useCallback((ctx: CanvasRenderingContext2D, camera: Vector2, zoom: number) => {
    // Žiadne particles sa nevykresľujú
    return;
  }, []);

  if (!isPlaying) {
    return (
      <div className="min-h-screen py-6 px-6 overflow-y-auto" style={{backgroundColor: '#07355a'}}>
        <div className="max-w-5xl w-full mx-auto">
          {/* Hlavný panel */}
                      <div className="bg-white/15 backdrop-blur-sm rounded-3xl shadow-2xl p-10 mb-8 text-center border border-white/20">
            <h1 className="text-6xl font-bold mb-4 text-white">
              🫧 Paddock Bubbles 🫧
            </h1>
            <p className="text-xl text-white/80 mb-8">Multiplayer bubble game</p>
            
            {/* Vstupné pole pre nickname */}
            <div className="max-w-sm mx-auto">
              <input
                type="text"
                placeholder="Zadaj svoje meno"
                className="w-full px-8 py-4 text-lg border-2 border-white/30 bg-white/10 text-white rounded-full focus:border-white/50 focus:outline-none transition-colors mb-4 placeholder-white/60"
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
                className="w-full px-8 py-4 text-xl font-bold text-white bg-white/20 rounded-full hover:bg-white/30 transform hover:scale-105 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:transform-none border border-white/30"
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
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
              <h2 className="text-3xl font-bold mb-6 text-white text-center">📖 Ako hrať</h2>
              <div className="space-y-5 text-white/90">
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
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
              <h2 className="text-3xl font-bold mb-6 text-white text-center">🏆 Najlepší hráči</h2>
              <div className="flex justify-center mb-6 bg-white/10 rounded-full p-1 max-w-xs mx-auto border border-white/20">
                <button
                  onClick={() => setLeaderboardTab('live')}
                  className={`flex-1 py-3 rounded-full font-semibold transition-colors ${
                    leaderboardTab === 'live' ? 'bg-white/20 shadow text-white border border-white/30' : 'text-white/70 hover:text-white'
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
                      const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'https://web-production-6a000.up.railway.app');
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
                    leaderboardTab === 'monthly' ? 'bg-white/20 shadow text-white border border-white/30' : 'text-white/70 hover:text-white'
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
          <h2 className="text-3xl mb-4">Ó, bol si prasknutý!</h2>
          <p className="mb-6">Skús to znova</p>
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
              {/* Performance monitor */}
        <div className="absolute top-4 left-4 text-white bg-black bg-opacity-75 px-3 py-2 rounded text-xs font-mono">
          <div className="flex flex-col space-y-1">
            <div>
              FPS: <span className={currentFpsRef.current >= 55 ? 'text-green-400' : currentFpsRef.current >= 30 ? 'text-yellow-400' : 'text-red-400'}>
                {currentFpsRef.current}
              </span>
            </div>
            <div>
              Ping: <span className={connectionLatency <= 50 ? 'text-green-400' : connectionLatency <= 100 ? 'text-yellow-400' : 'text-red-400'}>
                {connectionLatency}ms
              </span>
            </div>
            <div>
              Input: <span className={inputLatency <= 50 ? 'text-green-400' : inputLatency <= 100 ? 'text-yellow-400' : 'text-red-400'}>
                {inputLatency}ms
              </span>
            </div>
            <div>
              Render: <span className={renderLatency <= 8 ? 'text-green-400' : renderLatency <= 16 ? 'text-yellow-400' : 'text-red-400'}>
                {renderLatency}ms
              </span>
            </div>
            <div>
              Connection: <span className={
                connectionStatus === 'connected' ? 'text-green-400' : 
                connectionStatus === 'connecting' ? 'text-yellow-400' : 
                'text-red-400'
              }>
                {connectionStatus}
              </span>
            </div>
          </div>
        </div>
    </div>
  );
} 