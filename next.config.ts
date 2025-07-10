/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimalizácie pre Socket.IO
  experimental: {
    esmExternals: 'loose'
  },
  // Environment variables
  env: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || 'https://bubbles-teta.onrender.com'
  },
  // WebSocket support  
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },
}

export default nextConfig
