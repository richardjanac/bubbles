const path = require('path');

console.log('🚀 Starting Paddock Bubbles Game Server...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT || 3001);

// Spusť prekompajlovaný JavaScript server
const serverPath = path.join(__dirname, 'dist', 'server', 'index.js');
console.log('Server path:', serverPath);

try {
  require(serverPath);
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
} 