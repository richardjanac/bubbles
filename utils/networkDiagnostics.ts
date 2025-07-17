export interface NetworkStats {
  totalBytesSent: number;
  totalBytesReceived: number;
  messagesPerSecond: number;
  averageMessageSize: number;
  largestMessage: number;
  messageTypes: { [key: string]: { count: number; bytes: number } };
  bandwidthUsage: number; // KB/s
}

export class NetworkDiagnostics {
  private stats: NetworkStats = {
    totalBytesSent: 0,
    totalBytesReceived: 0,
    messagesPerSecond: 0,
    averageMessageSize: 0,
    largestMessage: 0,
    messageTypes: {},
    bandwidthUsage: 0
  };
  
  private messageBuffer: Array<{ timestamp: number; size: number; type: string }> = [];
  private startTime = Date.now();
  
  // Hook do Socket.IO pre monitoring
  attachToSocket(socket: any) {
    if (!socket || !socket.emit || !socket.on) {
      console.error('Invalid socket object provided to NetworkDiagnostics');
      return;
    }
    
    const originalEmit = socket.emit.bind(socket);
    
    // Monitor odchádzajúce správy
    socket.emit = (event: string, ...args: any[]) => {
      try {
        const message = JSON.stringify({ event, data: args });
        const messageSize = new Blob([message]).size;
        
        this.stats.totalBytesSent += messageSize;
        this.recordMessage(event, messageSize, 'sent');
      } catch (e) {
        console.error('Error monitoring outgoing message:', e);
      }
      
      return originalEmit(event, ...args);
    };
    
    // Monitor prichádzajúce správy cez middleware
    const self = this;
    socket.prependAny((event: string, ...args: any[]) => {
      try {
        const message = JSON.stringify({ event, data: args });
        const messageSize = new Blob([message]).size;
        
        self.stats.totalBytesReceived += messageSize;
        self.recordMessage(event, messageSize, 'received');
      } catch (e) {
        console.error('Error monitoring incoming message:', e);
      }
    });
  }
  
  private recordMessage(type: string, size: number, direction: 'sent' | 'received') {
    // Zaznamenaj správu
    this.messageBuffer.push({ timestamp: Date.now(), size, type });
    
    // Aktualizuj štatistiky pre typ správy
    if (!this.stats.messageTypes[type]) {
      this.stats.messageTypes[type] = { count: 0, bytes: 0 };
    }
    this.stats.messageTypes[type].count++;
    this.stats.messageTypes[type].bytes += size;
    
    // Aktualizuj najväčšiu správu
    if (size > this.stats.largestMessage) {
      this.stats.largestMessage = size;
      console.warn(`⚠️ Large message detected: ${type} - ${(size / 1024).toFixed(2)} KB`);
    }
    
    // Vyčisti staré správy (staršie ako 1 sekunda)
    const oneSecondAgo = Date.now() - 1000;
    this.messageBuffer = this.messageBuffer.filter(msg => msg.timestamp > oneSecondAgo);
    
    // Vypočítaj metriky
    this.updateMetrics();
  }
  
  private updateMetrics() {
    // Messages per second
    this.stats.messagesPerSecond = this.messageBuffer.length;
    
    // Average message size
    if (this.messageBuffer.length > 0) {
      const totalSize = this.messageBuffer.reduce((sum, msg) => sum + msg.size, 0);
      this.stats.averageMessageSize = totalSize / this.messageBuffer.length;
    }
    
    // Bandwidth usage (KB/s)
    const totalBytesInBuffer = this.messageBuffer.reduce((sum, msg) => sum + msg.size, 0);
    this.stats.bandwidthUsage = totalBytesInBuffer / 1024;
  }
  
  getStats(): NetworkStats {
    return { ...this.stats };
  }
  
  getReport(): string {
    const runtime = (Date.now() - this.startTime) / 1000;
    const stats = this.getStats();
    
    let report = `
=== Network Diagnostics Report ===
Runtime: ${runtime.toFixed(1)}s

📊 Overall Stats:
- Total Sent: ${(stats.totalBytesSent / 1024).toFixed(2)} KB
- Total Received: ${(stats.totalBytesReceived / 1024).toFixed(2)} KB
- Messages/sec: ${stats.messagesPerSecond}
- Avg Message Size: ${(stats.averageMessageSize / 1024).toFixed(2)} KB
- Largest Message: ${(stats.largestMessage / 1024).toFixed(2)} KB
- Current Bandwidth: ${stats.bandwidthUsage.toFixed(2)} KB/s

📨 Message Types:
`;
    
    // Zoraď podľa veľkosti
    const sortedTypes = Object.entries(stats.messageTypes)
      .sort((a, b) => b[1].bytes - a[1].bytes);
    
    for (const [type, data] of sortedTypes) {
      const avgSize = data.bytes / data.count;
      report += `- ${type}: ${data.count} msgs, ${(data.bytes / 1024).toFixed(2)} KB total, ${(avgSize / 1024).toFixed(2)} KB avg\n`;
    }
    
    // Identifikuj problémy
    report += `\n⚠️ Issues Detected:\n`;
    
    if (stats.bandwidthUsage > 50) {
      report += `- HIGH BANDWIDTH: ${stats.bandwidthUsage.toFixed(2)} KB/s (should be < 50 KB/s)\n`;
    }
    
    if (stats.largestMessage > 10240) {
      report += `- LARGE MESSAGES: Largest ${(stats.largestMessage / 1024).toFixed(2)} KB (should be < 10 KB)\n`;
    }
    
    if (stats.messagesPerSecond > 60) {
      report += `- TOO FREQUENT: ${stats.messagesPerSecond} msg/s (should be < 60)\n`;
    }
    
    return report;
  }
  
  reset() {
    this.stats = {
      totalBytesSent: 0,
      totalBytesReceived: 0,
      messagesPerSecond: 0,
      averageMessageSize: 0,
      largestMessage: 0,
      messageTypes: {},
      bandwidthUsage: 0
    };
    this.messageBuffer = [];
    this.startTime = Date.now();
  }
} 