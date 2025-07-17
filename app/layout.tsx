import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// Optimize font loading
const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  preload: true
})

export const metadata: Metadata = {
  title: 'Paddock Bubbles',
  description: 'Multiplayer bubble survival game',
  metadataBase: new URL('https://bubbles-nrl5.vercel.app'),
  openGraph: {
    title: 'Paddock Bubbles - Multiplayer Bubble Game',
    description: 'Eat, grow and survive in this multiplayer bubble game',
    type: 'website',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Paddock Bubbles',
    description: 'Multiplayer bubble survival game',
  },
  other: {
    'theme-color': '#07355a',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sk">
      <head>
        {/* Preload critical resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://bubbles-nrl5.vercel.app" />
        
        {/* Critical CSS inline */}
        <style dangerouslySetInnerHTML={{
          __html: `
            body { margin: 0; background: #07355a; }
            .game-mode { overflow: hidden; height: 100vh; }
          `
        }} />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
} 