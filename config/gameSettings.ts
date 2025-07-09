// 🎮 HERNÉ NASTAVENIA - PADDOCK BUBBLES
// Všetky herné konštanty na jednom mieste pre jednoduché ladenie

export const GAME_SETTINGS = {

  // 🏁 ZÁKLADNÉ NASTAVENIA
  MIN_PLAYERS: 5,                     // Minimálny počet hráčov v hre (boti sa pridajú ak je menej)
  WORLD_SIZE: {                       // Veľkosť herného sveta
    WIDTH: 3000,                      // pixely (zväčšené o 50%)
    HEIGHT: 3000                      // pixely (zväčšené o 50%)
  },

  // 👤 HRÁČ - ZÁKLADNÉ VLASTNOSTI
  STARTING_SCORE: 20,                // Počiatočné skóre nového hráča
  STARTING_LEVEL: 1,                  // Počiatočný level
  BASE_SPEED: 250,                    // Základná rýchlosť v pixeloch/sekundu
  SPEED_SIZE_PENALTY: 0.2,              // O koľko sa spomalí za každý bod skóre (NEW!)
  SPEED_LEVEL_INCREASE: 30,           // O koľko sa zrýchli za každý level
  
  // 💨 TURBO MECHANIZMUS
  TURBO_SPEED_MULTIPLIER: 3,        // Násobič rýchlosti pri turbo (2x = dvojnásobná rýchlosť)
  TURBO_DRAIN_RATE: 15,               // Koľko bodov/sekunda míňa turbo (33 = cca 3x za sekundu)
  MIN_TURBO_SCORE: 5,                 // Minimálne skóre potrebné pre turbo

  // 📏 VEĽKOSŤ A KOLÍZIE  
  BASE_RADIUS: 10,                    // Základný polomer bubliny pre score = 1
  COLLISION_OVERLAP: 2,               // Pixely prekrytia potrebné pre kolíziu
  
  // 🆙 LEVEL SYSTÉM
  LEVEL_UP_BASE: 400,                 // Skóre potrebné pre level 1→2
  LEVEL_UP_INCREMENT: 100,            // O koľko viac skóre treba za každý ďalší level

  // 🍽️ NPC BUBLINY (JEDLO)
  NPC_BUBBLE_SCORE: 1,                // Koľko bodov dáva jedna NPC bublina
  NPC_DENSITY: 10000,                 // Jeden NPC na koľko pixelov² (vyššie = menej NPC)
  
  // 🛡️ OCHRANA A SPAWN
  SPAWN_PROTECTION_DURATION: 3000,    // Ochrana po spawn/levelup v milisekundách
  
  // 🤖 BOT AI NASTAVENIA
  BOT_AI_UPDATE_INTERVAL: 200,        // Ako často sa aktualizuje AI (ms) - nižšie = inteligentnejšie ale viac CPU
  BOT_CLEANUP_INTERVAL: 30000,        // Ako často sa čistia neaktívni boti (ms)
  
  // ⚡ VÝKONNOSŤ
  GAME_LOOP_FPS: 20,                  // FPS herného loopu (nižšie = menej CPU)
  INPUT_UPDATE_FPS: 60,               // FPS aktualizácie vstupov (vyššie = responsívnejšie)
  
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
 * Farby pre jednotlivé levely
 */
export function getLevelColor(level: number): string {
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
  ];
  return colors[(level - 1) % colors.length];
}

// 📋 EXPORT PRE SPÄTNOSŤ S EXISTUJÚCIM KÓDOM
export const GAME_CONSTANTS = GAME_SETTINGS; 