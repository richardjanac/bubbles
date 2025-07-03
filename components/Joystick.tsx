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

    const rect = container.getBoundingClientRect();
    centerRef.current = {
      x: rect.width / 2,
      y: rect.height / 2
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
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
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (!touch) return;

      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left - centerRef.current.x;
      const y = touch.clientY - rect.top - centerRef.current.y;
      
      updateKnobPosition(x, y);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (!touch) return;

      setIsActive(false);
      setKnobPosition({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
      touchIdRef.current = null;
    };

    const updateKnobPosition = (x: number, y: number) => {
      const maxDistance = 50; // Maximálna vzdialenosť knoba od stredu
      const distance = Math.sqrt(x * x + y * y);
      
      if (distance > maxDistance) {
        x = (x / distance) * maxDistance;
        y = (y / distance) * maxDistance;
      }

      setKnobPosition({ x, y });
      
      // Normalizuj hodnoty pre output (-1 až 1)
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
    };
  }, [onMove]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-8 right-8 w-32 h-32 touch-none"
      style={{ userSelect: 'none' }}
    >
      {/* Pozadie joysticku */}
      <div className="absolute inset-0 bg-black bg-opacity-20 rounded-full border-2 border-white" />
      
      {/* Knob */}
      <div
        className={`absolute w-16 h-16 bg-white bg-opacity-50 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 transition-all ${
          isActive ? 'scale-110' : ''
        }`}
        style={{
          left: `${centerRef.current.x + knobPosition.x}px`,
          top: `${centerRef.current.y + knobPosition.y}px`,
          transition: isActive ? 'none' : 'all 0.2s ease-out'
        }}
      />
    </div>
  );
} 