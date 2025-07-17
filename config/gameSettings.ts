// 🎮 HERNÉ NASTAVENIA - PADDOCK BUBBLES
// Všetky herné konštanty na jednom mieste pre jednoduché ladenie

export const GAME_SETTINGS = {

  // 🏁 ZÁKLADNÉ NASTAVENIA
  MIN_PLAYERS: 8,                     // Minimálny počet hráčov v hre (8 = 7 botov + 1 hráč)
  WORLD_SIZE: {                       // Veľkosť herného sveta
    WIDTH: 3000,                      // pixely (zväčšené o 50%)
    HEIGHT: 3000                      // pixely (zväčšené o 50%)
  },

  // 👤 HRÁČ - ZÁKLADNÉ VLASTNOSTI
  STARTING_SCORE: 20,                // Počiatočné skóre nového hráča
  STARTING_LEVEL: 1,                  // Počiatočný level
  BASE_SPEED: 200,                    // Základná rýchlosť v pixeloch/sekundu
  SPEED_SIZE_PENALTY: 0.3,              // O koľko sa spomalí za každý bod skóre (NEW!)
  SPEED_LEVEL_INCREASE: 20,           // O koľko sa zrýchli za každý level
  
  // 💨 TURBO MECHANIZMUS
  TURBO_SPEED_MULTIPLIER: 2,        // Násobič rýchlosti pri turbo (2x = dvojnásobná rýchlosť)
  TURBO_DRAIN_RATE: 15,               // Koľko bodov/sekunda míňa turbo (33 = cca 3x za sekundu)
  MIN_TURBO_SCORE: 5,                 // Minimálne skóre potrebné pre turbo

  // 📏 VEĽKOSŤ A KOLÍZIE  
  BASE_RADIUS: 10,                    // Základný polomer bubliny pre score = 1
  COLLISION_OVERLAP: 2,               // Pixely prekrytia potrebné pre kolíziu
  
  // 🆙 LEVEL SYSTÉM
  LEVEL_UP_BASE: 500,                 // Skóre potrebné pre level 1→2
  LEVEL_UP_INCREMENT: 1,            // O koľko viac skóre treba za každý ďalší level

  // 🍽️ NPC BUBLINY (JEDLO)
  NPC_BUBBLE_SCORE: 1,                // Koľko bodov dáva jedna NPC bublina
  NPC_DENSITY: 50000,                 // Jeden NPC na koľko pixelov² (zvýšené 5x = 5x menej NPC)
  
  // 🛡️ OCHRANA A SPAWN
  SPAWN_PROTECTION_DURATION: 3000,    // Ochrana po spawn/levelup v milisekundách
  
  // 🤖 BOT AI NASTAVENIA
  BOT_AI_UPDATE_INTERVAL: 500,        // Znížené z 300 na 500ms - menej agresívne AI updates
  BOT_CLEANUP_INTERVAL: 30000,        // Ako často sa čistia neaktívni boti (ms)
  
  // ⚡ VÝKONNOSŤ
  GAME_LOOP_FPS: 20,                  // Zvýšené na 20 FPS pre plynulejší pohyb
  INPUT_UPDATE_FPS: 30,               // Zvýšené na 30 FPS pre lepšiu odozvu
  
  // 🎨 VIZUÁLNE
  RING_THICKNESS: 2,                  // Hrúbka levlových kruhov
  RING_SPACING: 2,                    // Medzera medzi kruhmi
  PARTICLE_LIFETIME: 30,              // Životnosť partiklov v sekundách

  // 📱 MOBILE UI
  JOYSTICK_SIZE: 140,                 // Veľkosť joysticku v pixeloch
  TURBO_BUTTON_SIZE: 70,              // Veľkosť turbo tlačidla v pixeloch
  
} as const;

// 🧮 POMOCNÉ FUNKCIE PRE VÝPOČTY

/**
 * Vypočíta polomer bubliny na základe skóre
 */
export function calculateRadius(score: number): number {
  return GAME_SETTINGS.BASE_RADIUS * Math.sqrt(score);
}

/**
 * Vypočíta koľko skóre je potrebné pre daný level
 */
export function calculateLevelUpScore(currentLevel: number): number {
  return GAME_SETTINGS.LEVEL_UP_BASE + (currentLevel * GAME_SETTINGS.LEVEL_UP_INCREMENT);
}

/**
 * Vypočíta aktuálnu rýchlosť hráča na základe levelu a skóre
 * NOVÉ: Väčší hráč = pomalší hráč
 */
export function calculatePlayerSpeed(level: number, score: number): number {
  const baseSpeed = GAME_SETTINGS.BASE_SPEED;
  const levelBonus = (level - 1) * GAME_SETTINGS.SPEED_LEVEL_INCREASE;
  const sizePenalty = score * GAME_SETTINGS.SPEED_SIZE_PENALTY;
  
  // Minimálna rýchlosť je 20 (aby sa hráč nezastavil úplne)
  return Math.max(20, baseSpeed + levelBonus - sizePenalty);
}

/**
 * Farby pre jednotlivé levely (1-100)
 */
export function getLevelColor(level: number): string {
  // Základné farby pre prvých 20 levelov
  if (level <= 20) {
    const colors = [
      '#FFFFFF', // Level 1 - biela
      '#FFFACD', // Level 2 - svetložltá
      '#FFDAB9', // Level 3 - svetlooranžová  
      '#FFB6C1', // Level 4 - svetloružová
      '#E6E6FA', // Level 5 - lavender
      '#B0E0E6', // Level 6 - powder blue
      '#98FB98', // Level 7 - pale green
      '#DDA0DD', // Level 8 - plum
      '#F0E68C', // Level 9 - khaki
      '#87CEEB', // Level 10 - sky blue
      '#FFE4E1', // Level 11 - misty rose
      '#FFEFD5', // Level 12 - papaya whip
      '#E0FFFF', // Level 13 - light cyan
      '#F5FFFA', // Level 14 - mint cream
      '#FFF8DC', // Level 15 - cornsilk
      '#F0FFF0', // Level 16 - honeydew
      '#F8F8FF', // Level 17 - ghost white
      '#FDF5E6', // Level 18 - old lace
      '#FFFAF0', // Level 19 - floral white
      '#F5F5DC'  // Level 20 - beige
    ];
    return colors[level - 1];
  }
  
  // Levely 21-40: Pastelové farby
  if (level <= 40) {
    const hue = ((level - 21) * 18) % 360; // Rozložené po celom spektre
    return `hsl(${hue}, 60%, 80%)`;
  }
  
  // Levely 41-60: Živé farby
  if (level <= 60) {
    const hue = ((level - 41) * 18) % 360;
    return `hsl(${hue}, 70%, 70%)`;
  }
  
  // Levely 61-80: Sýte farby
  if (level <= 80) {
    const hue = ((level - 61) * 18) % 360;
    return `hsl(${hue}, 80%, 60%)`;
  }
  
  // Levely 81-100: Premium farby s gradient efektom
  if (level <= 100) {
    const premiumColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', // 81-85
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43', // 86-90
      '#EE5A24', '#0084FF', '#341F97', '#6C5CE7', '#A29BFE', // 91-95
      '#FD79A8', '#FDCB6E', '#6C5CE7', '#74B9FF', '#00B894'  // 96-100
    ];
    return premiumColors[(level - 81) % premiumColors.length];
  }
  
  // Pre levely nad 100 - rainbow gradient
  const hue = (level * 7) % 360;
  return `hsl(${hue}, 90%, 50%)`;
}

// 📋 EXPORT PRE SPÄTNOSŤ S EXISTUJÚCIM KÓDOM
export const GAME_CONSTANTS = GAME_SETTINGS; 