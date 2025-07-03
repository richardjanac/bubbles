'use client';

import React, { useRef } from 'react';

interface TurboButtonProps {
  onPress: () => void;
  onRelease: () => void;
}

export default function TurboButton({ onPress, onRelease }: TurboButtonProps) {
  const touchIdRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    onPress();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
    if (touch) {
      onRelease();
      touchIdRef.current = null;
    }
  };

  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="absolute bottom-8 left-8 w-24 h-24 bg-red-500 bg-opacity-50 text-white font-bold text-xl rounded-full border-4 border-white shadow-lg active:scale-95 transition-transform touch-none"
      style={{ userSelect: 'none' }}
    >
      TURBO
    </button>
  );
} 