'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Vector2, GAME_SETTINGS } from '../types/game';

interface JoystickProps {
  onMove: (direction: Vector2) => void;
}

export default function Joystick({ onMove }: JoystickProps) {
  const [isActive, setIsActive] = useState(false);
  const [joystickPosition, setJoystickPosition] = useState<Vector2>({ x: 0, y: 0 });
  const [knobOffset, setKnobOffset] = useState<Vector2>({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Použijeme celú obrazovku ako game area
    const gameArea = document.body;

    const handleTouchStart = (e: TouchEvent) => {
      // Ignoruj multi-touch
      if (e.touches.length > 1) return;
      if (touchIdRef.current !== null) return; // Už máme aktívny dotyk
      
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.changedTouches[0];
      touchIdRef.current = touch.identifier;
      
      // Vibrácia pre haptickú odozvu (ak je podporovaná)
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
      
      // Nastav pozíciu joysticku na miesto dotyku
      setJoystickPosition({
        x: touch.clientX,
        y: touch.clientY
      });
      
      setIsActive(true);
      setKnobOffset({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (!touch) return;

      // Vypočítaj offset od stredu joysticku
      const offsetX = touch.clientX - joystickPosition.x;
      const offsetY = touch.clientY - joystickPosition.y;
      
      updateKnobPosition(offsetX, offsetY);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (!touch) return;

      // Skryj joystick a reset
      setIsActive(false);
      setKnobOffset({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
      touchIdRef.current = null;
    };

    const updateKnobPosition = (x: number, y: number) => {
      const maxDistance = 50; // Maximálna vzdialenosť knob-u od stredu
      const distance = Math.sqrt(x * x + y * y);
      
      if (distance > maxDistance) {
        x = (x / distance) * maxDistance;
        y = (y / distance) * maxDistance;
      }

      setKnobOffset({ x, y });
      
      // Normalizuj hodnoty pre output (-1 až 1)
      onMove({
        x: x / maxDistance,
        y: y / maxDistance
      });
    };

    // Mouse events pre desktop testing
    const handleMouseDown = (e: MouseEvent) => {
      if (touchIdRef.current !== null) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      touchIdRef.current = -1; // Označenie pre mouse
      
      setJoystickPosition({
        x: e.clientX,
        y: e.clientY
      });
      
      setIsActive(true);
      setKnobOffset({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (touchIdRef.current === null) return;
      
      e.preventDefault();
      e.stopPropagation();

      const offsetX = e.clientX - joystickPosition.x;
      const offsetY = e.clientY - joystickPosition.y;
      
      updateKnobPosition(offsetX, offsetY);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (touchIdRef.current === null) return;
      
      e.preventDefault();
      e.stopPropagation();

      setIsActive(false);
      setKnobOffset({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
      touchIdRef.current = null;
    };

    // Touch events
    gameArea.addEventListener('touchstart', handleTouchStart, { passive: false });
    gameArea.addEventListener('touchmove', handleTouchMove, { passive: false });
    gameArea.addEventListener('touchend', handleTouchEnd, { passive: false });
    gameArea.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Mouse events pre desktop testing
    gameArea.addEventListener('mousedown', handleMouseDown);
    gameArea.addEventListener('mousemove', handleMouseMove);
    gameArea.addEventListener('mouseup', handleMouseUp);

    return () => {
      gameArea.removeEventListener('touchstart', handleTouchStart);
      gameArea.removeEventListener('touchmove', handleTouchMove);
      gameArea.removeEventListener('touchend', handleTouchEnd);
      gameArea.removeEventListener('touchcancel', handleTouchEnd);
      
      gameArea.removeEventListener('mousedown', handleMouseDown);
      gameArea.removeEventListener('mousemove', handleMouseMove);
      gameArea.removeEventListener('mouseup', handleMouseUp);
    };
  }, [joystickPosition, onMove]);

  // Ak nie je aktívny, joystick sa nezobrazuje
  if (!isActive) {
    return null;
  }

  return (
    <div
      className="fixed pointer-events-none"
      style={{
        left: joystickPosition.x - GAME_SETTINGS.JOYSTICK_SIZE / 2, // Centruj joystick na pozíciu dotyku
        top: joystickPosition.y - GAME_SETTINGS.JOYSTICK_SIZE / 2,
        width: GAME_SETTINGS.JOYSTICK_SIZE,
        height: GAME_SETTINGS.JOYSTICK_SIZE,
        zIndex: 2000
      }}
    >
      {/* Statický referencný kruh - 50% opacity */}
      <div 
        className="absolute w-20 h-20 bg-white rounded-full border-2 border-gray-400 shadow-lg" 
        style={{ 
          left: '50%', 
          top: '50%', 
          transform: 'translate(-50%, -50%)',
          opacity: 0.5,
          zIndex: 2001
        }} 
      />
      
      {/* Pohyblivý knob kruh - 100% opacity */}
      <div
        className="absolute w-16 h-16 bg-white rounded-full border-2 border-gray-600 shadow-xl"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${knobOffset.x}px), calc(-50% + ${knobOffset.y}px))`,
          opacity: 1.0,
          zIndex: 2002
        }}
      />
    </div>
  );
} 