'use client';

import dynamic from 'next/dynamic';

// Lazy load the Game component to improve initial page load
const Game = dynamic(() => import('../components/Game'), { 
  loading: () => (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#07355a'}}>
      <div className="text-center">
        <div className="text-6xl mb-4">🫧</div>
        <div className="text-white text-xl">Loading Paddock Bubbles...</div>
        <div className="mt-4 w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    </div>
  )
});

export default function Home() {
  return <Game />;
} 