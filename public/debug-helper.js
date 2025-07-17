// Debug helper pre Paddock Bubbles
// Použitie: skopíruj tento kód do konzoly

window.bubbleDebug = {
  // Zobraz network štatistiky
  showNetworkStats() {
    if (window.networkStats) {
      console.table(window.networkStats);
    } else {
      console.log('No network stats available. Press Ctrl+D in game first.');
    }
  },
  
  // Analyzuj veľkosť game state
  analyzeGameState() {
    if (!window.gameState) {
      console.log('No game state available. Press Ctrl+D in game first.');
      return;
    }
    
    const state = window.gameState;
    const playerCount = Object.keys(state.players).length;
    const npcCount = Object.keys(state.npcBubbles).length;
    
    // Vypočítaj približnú veľkosť
    const stateJson = JSON.stringify(state);
    const sizeKB = new Blob([stateJson]).size / 1024;
    
    console.log(`
=== Game State Analysis ===
Players: ${playerCount}
NPCs: ${npcCount}
Total size: ${sizeKB.toFixed(2)} KB

Per-player overhead: ${(sizeKB / playerCount).toFixed(2)} KB
Per-NPC overhead: ${(sizeKB / npcCount).toFixed(2)} KB
    `);
    
    // Analyzuj najväčších hráčov
    const players = Object.values(state.players);
    const sortedBySize = players.sort((a, b) => 
      JSON.stringify(b).length - JSON.stringify(a).length
    );
    
    console.log('\nLargest players by data size:');
    sortedBySize.slice(0, 3).forEach(player => {
      const size = new Blob([JSON.stringify(player)]).size;
      console.log(`- ${player.nickname}: ${size} bytes`);
    });
  },
  
  // Monitor bandwidth v reálnom čase
  startBandwidthMonitor() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    console.log('Starting bandwidth monitor... Press Ctrl+C to stop.');
    
    let lastStats = window.networkStats;
    
    this.monitorInterval = setInterval(() => {
      const currentStats = window.networkStats;
      if (!currentStats || !lastStats) {
        console.log('Waiting for stats...');
        lastStats = currentStats;
        return;
      }
      
      const sent = currentStats.totalBytesSent - lastStats.totalBytesSent;
      const received = currentStats.totalBytesReceived - lastStats.totalBytesReceived;
      
      console.log(`[${new Date().toLocaleTimeString()}] ↑ ${(sent/1024).toFixed(2)} KB/s ↓ ${(received/1024).toFixed(2)} KB/s`);
      
      lastStats = { ...currentStats };
    }, 1000);
  },
  
  // Simuluj slabé pripojenie
  simulatePoorConnection() {
    console.warn('⚠️ Simulating poor connection - this will affect gameplay!');
    
    // Interceptuj WebSocket send
    if (window.socket && window.socket.send) {
      const originalSend = window.socket.send;
      window.socket.send = function(...args) {
        // 30% packet loss
        if (Math.random() > 0.3) {
          // Delay 200-500ms
          const delay = 200 + Math.random() * 300;
          setTimeout(() => originalSend.apply(this, args), delay);
        }
      };
    }
  }
};

console.log(`
🎮 Bubble Debug Helper Loaded!

Commands:
- bubbleDebug.showNetworkStats() - Show network statistics
- bubbleDebug.analyzeGameState() - Analyze game state size
- bubbleDebug.startBandwidthMonitor() - Monitor bandwidth usage
- bubbleDebug.simulatePoorConnection() - Simulate bad network

Press Ctrl+D in game to capture current state first!
`); 