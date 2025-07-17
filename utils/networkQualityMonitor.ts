export interface NetworkQuality {
  latency: number;
  jitter: number;
  packetLoss: number;
  bandwidth: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
}

export class NetworkQualityMonitor {
  private latencyHistory: number[] = [];
  private maxHistorySize = 30;
  private lastPingTime = 0;
  private pingInterval = 2000; // 2 sekundy
  
  // Callbacks pre zmenu kvality
  private qualityChangeCallbacks: ((quality: NetworkQuality) => void)[] = [];
  
  // Aktuálna kvalita siete
  private currentQuality: NetworkQuality = {
    latency: 0,
    jitter: 0,
    packetLoss: 0,
    bandwidth: 0,
    quality: 'good'
  };
  
  // Pridaj latency meranie
  addLatencyMeasurement(latency: number) {
    this.latencyHistory.push(latency);
    
    if (this.latencyHistory.length > this.maxHistorySize) {
      this.latencyHistory.shift();
    }
    
    this.updateNetworkQuality();
  }
  
  // Vypočítaj kvalitu siete
  private updateNetworkQuality() {
    if (this.latencyHistory.length < 3) return;
    
    // Vypočítaj priemernú latenciu
    const avgLatency = this.latencyHistory.reduce((a, b) => a + b) / this.latencyHistory.length;
    
    // Vypočítaj jitter (variabilita latencie)
    let jitterSum = 0;
    for (let i = 1; i < this.latencyHistory.length; i++) {
      jitterSum += Math.abs(this.latencyHistory[i] - this.latencyHistory[i - 1]);
    }
    const avgJitter = jitterSum / (this.latencyHistory.length - 1);
    
    // Odhadni packet loss (ak latencia náhle skočí)
    let spikes = 0;
    for (const latency of this.latencyHistory) {
      if (latency > avgLatency * 2.5) spikes++;
    }
    const packetLoss = (spikes / this.latencyHistory.length) * 100;
    
    // Určenie kvality
    let quality: 'poor' | 'fair' | 'good' | 'excellent';
    
    if (avgLatency < 50 && avgJitter < 10 && packetLoss < 1) {
      quality = 'excellent';
    } else if (avgLatency < 100 && avgJitter < 30 && packetLoss < 5) {
      quality = 'good';
    } else if (avgLatency < 200 && avgJitter < 50 && packetLoss < 10) {
      quality = 'fair';
    } else {
      quality = 'poor';
    }
    
    // Ak sa kvalita zmenila, upozorni
    if (quality !== this.currentQuality.quality) {
      console.log(`Network quality changed: ${this.currentQuality.quality} → ${quality}`);
    }
    
    this.currentQuality = {
      latency: Math.round(avgLatency),
      jitter: Math.round(avgJitter),
      packetLoss: Math.round(packetLoss * 10) / 10,
      bandwidth: this.estimateBandwidth(avgLatency),
      quality
    };
    
    // Upozorni listeners
    this.notifyQualityChange();
  }
  
  // Odhadni bandwidth podľa latencie (približný odhad)
  private estimateBandwidth(latency: number): number {
    // Mobilné siete majú typicky vyššiu latenciu
    if (latency < 20) return 100; // Pravdepodobne LAN/WiFi
    if (latency < 50) return 50;  // Dobrá 4G/5G
    if (latency < 100) return 20; // Priemerná 4G
    if (latency < 200) return 10; // 3G/slabá 4G
    return 5; // Veľmi pomalé pripojenie
  }
  
  // Registruj callback pre zmenu kvality
  onQualityChange(callback: (quality: NetworkQuality) => void) {
    this.qualityChangeCallbacks.push(callback);
  }
  
  // Upozorni všetky callbacks
  private notifyQualityChange() {
    this.qualityChangeCallbacks.forEach(cb => cb(this.currentQuality));
  }
  
  // Získaj aktuálnu kvalitu
  getCurrentQuality(): NetworkQuality {
    return { ...this.currentQuality };
  }
  
  // Získaj odporúčania pre hru
  getGameRecommendations() {
    switch (this.currentQuality.quality) {
      case 'excellent':
        return {
          updateRate: 1,      // Každý frame
          inputRate: 60,      // 60 FPS input
          deltaUpdates: true,
          compression: false,
          interpolationDelay: 50
        };
        
      case 'good':
        return {
          updateRate: 1,      // Každý frame
          inputRate: 30,      // 30 FPS input
          deltaUpdates: true,
          compression: true,
          interpolationDelay: 100
        };
        
      case 'fair':
        return {
          updateRate: 2,      // Každý druhý frame
          inputRate: 20,      // 20 FPS input
          deltaUpdates: true,
          compression: true,
          interpolationDelay: 150
        };
        
      case 'poor':
        return {
          updateRate: 3,      // Každý tretí frame
          inputRate: 15,      // 15 FPS input
          deltaUpdates: true,
          compression: true,
          interpolationDelay: 200
        };
    }
  }
  
  // Reset histórie
  reset() {
    this.latencyHistory = [];
    this.currentQuality = {
      latency: 0,
      jitter: 0,
      packetLoss: 0,
      bandwidth: 0,
      quality: 'good'
    };
  }
} 