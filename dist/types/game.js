"use strict";
// Typy pre hru Paddock Bubbles
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAME_CONSTANTS = void 0;
exports.calculateRadius = calculateRadius;
exports.calculateLevelUpScore = calculateLevelUpScore;
exports.getLevelColor = getLevelColor;
// Konštanty hry
exports.GAME_CONSTANTS = {
    MIN_PLAYERS: 10,
    STARTING_SCORE: 100,
    STARTING_LEVEL: 1,
    BASE_SPEED: 100, // pixely za sekundu
    TURBO_DRAIN_RATE: 33, // bublín za sekundu (znížené na tretinu pre menej intenzívny efekt)
    MIN_TURBO_SCORE: 5,
    COLLISION_OVERLAP: 2, // pixely
    PARTICLE_LIFETIME: 30, // sekúnd
    NPC_BUBBLE_SCORE: 1,
    LEVEL_UP_BASE: 400, // vrátené na pôvodnú hodnotu
    LEVEL_UP_INCREMENT: 100, // vrátené na pôvodnú hodnotu
    SPEED_LEVEL_INCREASE: 50, // nová konštanta - každý level pridá 50 bodov rýchlosti
    SPAWN_PROTECTION_DURATION: 3000, // 3 sekundy v milisekundách
};
// Helper funkcie
function calculateRadius(score) {
    const baseRadius = 10; // polomer pre score = 1
    return baseRadius * Math.sqrt(score);
}
function calculateLevelUpScore(currentLevel) {
    return exports.GAME_CONSTANTS.LEVEL_UP_BASE + (currentLevel * exports.GAME_CONSTANTS.LEVEL_UP_INCREMENT);
}
function getLevelColor(level) {
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
