'use client';

import React, { useRef, useEffect } from 'react';
import { GAME_SETTINGS } from '../types/game';

interface TurboButtonProps {
  onPress: () => void;
  onRelease: () => void;
}

export default function TurboButton({ onPress, onRelease }: TurboButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (touchIdRef.current !== null) return;
      const touch = e.changedTouches[0];
      touchIdRef.current = touch.identifier;
      onPress();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (touch) {
        onRelease();
        touchIdRef.current = null;
      }
    };

    button.addEventListener('touchstart', handleTouchStart, { passive: false });
    button.addEventListener('touchend', handleTouchEnd, { passive: false });
    button.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      button.removeEventListener('touchstart', handleTouchStart);
      button.removeEventListener('touchend', handleTouchEnd);
      button.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [onPress, onRelease]);

  return (
    <button
      ref={buttonRef}
      className="absolute bg-red-500 bg-opacity-70 text-white font-bold text-2xl rounded-full border-4 border-white shadow-xl active:scale-95 transition-all duration-200 touch-none hover:bg-opacity-80 flex items-center justify-center"
      style={{ 
        userSelect: 'none', 
        bottom: '6rem',
        left: '2rem',
        width: `${GAME_SETTINGS.TURBO_BUTTON_SIZE}px`,
        height: `${GAME_SETTINGS.TURBO_BUTTON_SIZE}px`,
        zIndex: 1000
      }}
    >
      🚀
    </button>
  );
} 