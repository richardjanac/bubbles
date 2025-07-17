/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vypnúť React Strict Mode pre development (komponenty sa nebudú mountovať 2x)
  reactStrictMode: false,
  
  // Optimalizácie pre Socket.IO
  experimental: {
    esmExternals: 'loose'
  },
  // Environment variables
  env: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || (
      process.env.NODE_ENV === 'production' 
        ? 'https://web-production-6a000.up.railway.app'
        : 'http://localhost:3001'
    )
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
