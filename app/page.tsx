import dynamic from 'next/dynamic';
import { Metadata } from 'next';

// Lazy load the Game component to improve initial page load
const Game = dynamic(() => import('../components/Game'), { 
  ssr: false,
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

export const metadata: Metadata = {
  title: 'Paddock Bubbles - Multiplayer Bubble Game',
  description: 'Eat, grow and survive in this multiplayer bubble game',
  keywords: 'bubble game, multiplayer, online game, paddock bubbles',
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
};

export default function Home() {
  return <Game />;
} 