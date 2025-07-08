'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Vector2 } from '../types/game';

interface JoystickProps {
  onMove: (direction: Vector2) => void;
}

export default function Joystick({ onMove }: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [knobPosition, setKnobPosition] = useState<Vector2>({ x: 0, y: 0 });
  const centerRef = useRef<Vector2>({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Aktualizuj centrum pri zmene veľkosti
    const updateCenter = () => {
      const rect = container.getBoundingClientRect();
      centerRef.current = {
        x: rect.width / 2,
        y: rect.height / 2
      };
    };

    updateCenter();
    
    // Pridaj resize listener
    const resizeObserver = new ResizeObserver(updateCenter);
    resizeObserver.observe(container);

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.changedTouches[0];
      touchIdRef.current = touch.identifier;
      setIsActive(true);
      
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left - centerRef.current.x;
      const y = touch.clientY - rect.top - centerRef.current.y;
      
      updateKnobPosition(x, y);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (!touch) return;

      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left - centerRef.current.x;
      const y = touch.clientY - rect.top - centerRef.current.y;
      
      updateKnobPosition(x, y);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (!touch) return;

      setIsActive(false);
      setKnobPosition({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
      touchIdRef.current = null;
    };

    const updateKnobPosition = (x: number, y: number) => {
      const maxDistance = 45; // Mierne menšia maximálna vzdialenosť pre lepšiu kontrolu
      const distance = Math.sqrt(x * x + y * y);
      
      if (distance > maxDistance) {
        x = (x / distance) * maxDistance;
        y = (y / distance) * maxDistance;
      }

      setKnobPosition({ x, y });
      
      // Normalizuj hodnoty pre output (-1 až 1)
      // Opravené na správnu detekciu smeru
      onMove({
        x: x / maxDistance,
        y: y / maxDistance
      });
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      resizeObserver.disconnect();
    };
  }, [onMove]);

  return (
    <div
      ref={containerRef}
      className="absolute w-[9rem] h-[9rem] touch-none"
      style={{ 
        userSelect: 'none', 
        bottom: '6rem', // Posunul vyššie
        right: '2rem',
        zIndex: 1000
      }}
    >
      {/* Pozadie joysticku */}
      <div className="absolute inset-0 bg-black bg-opacity-30 rounded-full border-4 border-white/90 shadow-lg" />
      
      {/* Stredový bod pre vizuálnu pomoc - väčší a tmavší */}
      <div className="absolute w-3 h-3 bg-black rounded-full shadow-sm" 
           style={{ 
             left: '50%', 
             top: '50%', 
             transform: 'translate(-50%, -50%)',
             zIndex: 1002
           }} />
      
      {/* Knob */}
      <div
        className={`absolute w-[4rem] h-[4rem] bg-white rounded-full border-4 border-gray-300 shadow-lg transition-all ${
          isActive ? 'scale-110 bg-gray-100 border-gray-400' : ''
        }`}
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${knobPosition.x}px), calc(-50% + ${knobPosition.y}px))`,
          transition: isActive ? 'none' : 'transform 0.2s ease-out, scale 0.2s ease-out',
          zIndex: 1001
        }}
      />
    </div>
  );
} 