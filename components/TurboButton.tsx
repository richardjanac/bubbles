'use client';

import React, { useRef, useEffect } from 'react';

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
      if (touchIdRef.current !== null) return;
      const touch = e.changedTouches[0];
      touchIdRef.current = touch.identifier;
      onPress();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
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
      className="absolute w-24 h-24 bg-red-500 bg-opacity-50 text-white font-bold text-xl rounded-full border-4 border-white shadow-lg active:scale-95 transition-transform touch-none"
      style={{ userSelect: 'none', bottom: '2rem', left: '2rem' }}
    >
      TURBO
    </button>
  );
} 