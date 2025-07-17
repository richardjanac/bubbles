export class SmoothValue {
  private currentValue: number;
  private targetValue: number;
  private smoothingFactor: number;
  
  constructor(initialValue: number, smoothingFactor: number = 0.15) {
    this.currentValue = initialValue;
    this.targetValue = initialValue;
    this.smoothingFactor = smoothingFactor;
  }
  
  // Nastav novú cieľovú hodnotu
  setTarget(value: number) {
    this.targetValue = value;
  }
  
  // Aktualizuj a vráť vyhladenú hodnotu
  update(): number {
    // Exponenciálne vyhladzovanie
    const diff = this.targetValue - this.currentValue;
    this.currentValue += diff * this.smoothingFactor;
    
    // Ak sme veľmi blízko, preskoč na cieľ
    if (Math.abs(diff) < 0.01) {
      this.currentValue = this.targetValue;
    }
    
    return this.currentValue;
  }
  
  // Získaj aktuálnu hodnotu bez aktualizácie
  getValue(): number {
    return this.currentValue;
  }
  
  // Okamžite nastav hodnotu
  setValue(value: number) {
    this.currentValue = value;
    this.targetValue = value;
  }
}

// Manager pre všetky vyhladzované hodnoty hráčov
export class SmoothTransitionManager {
  private playerRadii: Map<string, SmoothValue> = new Map();
  private playerScores: Map<string, SmoothValue> = new Map();
  
  // Aktualizuj hodnoty pre hráča
  updatePlayer(playerId: string, score: number, radius: number) {
    // Radius
    if (!this.playerRadii.has(playerId)) {
      this.playerRadii.set(playerId, new SmoothValue(radius, 0.12));
    }
    this.playerRadii.get(playerId)!.setTarget(radius);
    
    // Score
    if (!this.playerScores.has(playerId)) {
      this.playerScores.set(playerId, new SmoothValue(score, 0.15));
    }
    this.playerScores.get(playerId)!.setTarget(score);
  }
  
  // Získaj vyhladzený radius
  getSmoothedRadius(playerId: string): number {
    const smooth = this.playerRadii.get(playerId);
    return smooth ? smooth.update() : 20; // Default radius
  }
  
  // Získaj vyhladzené skóre
  getSmoothedScore(playerId: string): number {
    const smooth = this.playerScores.get(playerId);
    return smooth ? smooth.update() : 0;
  }
  
  // Vyčisti hráča
  removePlayer(playerId: string) {
    this.playerRadii.delete(playerId);
    this.playerScores.delete(playerId);
  }
  
  // Pre okamžité nastavenie (napr. pri spawne)
  setImmediate(playerId: string, score: number, radius: number) {
    if (!this.playerRadii.has(playerId)) {
      this.playerRadii.set(playerId, new SmoothValue(radius, 0.12));
    } else {
      this.playerRadii.get(playerId)!.setValue(radius);
    }
    
    if (!this.playerScores.has(playerId)) {
      this.playerScores.set(playerId, new SmoothValue(score, 0.15));
    } else {
      this.playerScores.get(playerId)!.setValue(score);
    }
  }
} 