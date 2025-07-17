// Detekcia výkonu zariadenia
export interface DevicePerformance {
  tier: 'low' | 'medium' | 'high';
  recommendedSettings: {
    renderScale: number;
    particlesEnabled: boolean;
    shadowsEnabled: boolean;
    maxVisibleBubbles: number;
    fpsTarget: number;
  };
}

export class PerformanceDetector {
  private static instance: PerformanceDetector;
  private performanceTier: 'low' | 'medium' | 'high' = 'medium';
  private lastFrameTimes: number[] = [];
  private maxFrameSamples = 60;
  
  static getInstance(): PerformanceDetector {
    if (!this.instance) {
      this.instance = new PerformanceDetector();
    }
    return this.instance;
  }
  
  // Detekuj výkon zariadenia
  detectPerformance(): DevicePerformance {
    // Pre SSR vráť default hodnoty
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        tier: 'medium',
        recommendedSettings: this.getRecommendedSettings('medium')
      };
    }
    
    // Základná detekcia podľa user agent a hardvéru
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua);
    const isOldDevice = this.isOldDevice();
    
    // Detekcia podľa pamäte (ak je dostupná)
    const memoryInfo = (performance as any).memory;
    const hasLowMemory = memoryInfo && memoryInfo.totalJSHeapSize > memoryInfo.jsHeapSizeLimit * 0.8;
    
    // Detekcia podľa CPU jadier
    const cores = navigator.hardwareConcurrency || 4;
    const hasLowCores = cores <= 2;
    
    // Určenie výkonnostnej triedy
    if (isOldDevice || hasLowMemory || hasLowCores) {
      this.performanceTier = 'low';
    } else if (isMobile) {
      this.performanceTier = 'medium';
    } else {
      this.performanceTier = 'high';
    }
    
    return {
      tier: this.performanceTier,
      recommendedSettings: this.getRecommendedSettings(this.performanceTier)
    };
  }
  
  // Dynamická detekcia výkonu podľa FPS
  recordFrameTime(deltaTime: number) {
    this.lastFrameTimes.push(deltaTime);
    
    if (this.lastFrameTimes.length > this.maxFrameSamples) {
      this.lastFrameTimes.shift();
    }
    
    // Ak máme dostatok vzoriek, prehodnoť výkon
    if (this.lastFrameTimes.length === this.maxFrameSamples) {
      const avgFrameTime = this.lastFrameTimes.reduce((a, b) => a + b) / this.lastFrameTimes.length;
      const avgFPS = 1000 / avgFrameTime;
      
      // Automaticky zníž kvalitu ak FPS klesne
      if (avgFPS < 20 && this.performanceTier !== 'low') {
        this.performanceTier = 'low';
        console.log('Performance downgrade to LOW due to poor FPS:', avgFPS);
      } else if (avgFPS < 40 && this.performanceTier === 'high') {
        this.performanceTier = 'medium';
        console.log('Performance downgrade to MEDIUM due to FPS:', avgFPS);
      }
    }
  }
  
  private static _isOldDeviceCache: boolean | null = null;
  
  private isOldDevice(): boolean {
    // Cache výsledok, aby sme nevytvárali WebGL kontext opakovane - FIX pre WebGL leak
    if (PerformanceDetector._isOldDeviceCache !== null) {
      return PerformanceDetector._isOldDeviceCache;
    }
    
    // Kontrola či sme v browseri
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      PerformanceDetector._isOldDeviceCache = false;
      return false;
    }
    
    const ua = navigator.userAgent;
    
    // Staré iPhone modely
    if (/iPhone OS [4-9]_/.test(ua)) {
      PerformanceDetector._isOldDeviceCache = true;
      return true;
    }
    if (/iPhone OS 1[0-2]_/.test(ua) && /iPhone [4-7],/.test(ua)) {
      PerformanceDetector._isOldDeviceCache = true;
      return true;
    }
    
    // Staré Android zariadenia
    if (/Android [4-6]\./.test(ua)) {
      PerformanceDetector._isOldDeviceCache = true;
      return true;
    }
    
    // Detekcia podľa roku (zariadenia staršie ako 2018) - len raz
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl && gl instanceof WebGLRenderingContext) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            // Staré GPU
            if (renderer && typeof renderer === 'string' && /Mali-4|Adreno 3|PowerVR SGX/.test(renderer)) {
              PerformanceDetector._isOldDeviceCache = true;
              return true;
            }
          }
        }
      } catch (error) {
        console.warn('WebGL detection failed:', error);
      }
    }
    
    PerformanceDetector._isOldDeviceCache = false;
    return false;
  }
  
  private getRecommendedSettings(tier: 'low' | 'medium' | 'high') {
    switch (tier) {
      case 'low':
        return {
          renderScale: 0.5,        // 50% rozlíšenie
          particlesEnabled: false,
          shadowsEnabled: false,
          maxVisibleBubbles: 200,   // Zvýšené z 50
          fpsTarget: 30
        };
      
      case 'medium':
        return {
          renderScale: 0.75,       // 75% rozlíšenie
          particlesEnabled: false,
          shadowsEnabled: false,
          maxVisibleBubbles: 500,   // Zvýšené z 100
          fpsTarget: 30
        };
      
      case 'high':
        return {
          renderScale: 1.0,        // Plné rozlíšenie
          particlesEnabled: true,
          shadowsEnabled: true,
          maxVisibleBubbles: 1000,  // Zvýšené z 200
          fpsTarget: 60
        };
    }
  }
  
  getCurrentTier(): 'low' | 'medium' | 'high' {
    return this.performanceTier;
  }
}

// Canvas optimalizácie
export class CanvasOptimizer {
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  
  // Vytvor offscreen canvas pre batch rendering
  createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
    }
    
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
      alpha: true,
      desynchronized: true, // Lepší výkon pre animácie
      willReadFrequently: false
    });
    
    return this.offscreenCanvas;
  }
  
  // Optimalizované nastavenia pre kontext
  static optimizeContext(ctx: CanvasRenderingContext2D, quality: 'low' | 'medium' | 'high') {
    // Globálne nastavenia pre lepší výkon
    ctx.imageSmoothingEnabled = quality !== 'low';
    ctx.imageSmoothingQuality = quality === 'high' ? 'high' : 'low';
    
    // Nastavenia pre text - textRendering nie je štandardná vlastnosť
    // ale niektoré browsery ju podporujú pre optimalizáciu
    if ('textRendering' in ctx) {
      (ctx as any).textRendering = quality === 'low' ? 'optimizeSpeed' : 'optimizeLegibility';
    }
    
    // Vypni tieňe pre low-end zariadenia
    if (quality === 'low') {
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  }
  
  // Batch render podobných objektov
  batchRender(
    ctx: CanvasRenderingContext2D,
    objects: Array<{x: number, y: number, radius: number}>,
    renderFunction: (ctx: CanvasRenderingContext2D, obj: any) => void
  ) {
    // Použi save/restore len raz pre celý batch
    ctx.save();
    
    for (const obj of objects) {
      renderFunction(ctx, obj);
    }
    
    ctx.restore();
  }
} 