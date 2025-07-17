"use strict";
// Typy pre hru Paddock Bubbles
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLevelColor = exports.calculatePlayerSpeed = exports.calculateLevelUpScore = exports.calculateRadius = exports.GAME_SETTINGS = exports.GAME_CONSTANTS = void 0;
// Import herných nastavení z centrálneho súboru
var gameSettings_1 = require("../config/gameSettings");
Object.defineProperty(exports, "GAME_CONSTANTS", { enumerable: true, get: function () { return gameSettings_1.GAME_CONSTANTS; } });
Object.defineProperty(exports, "GAME_SETTINGS", { enumerable: true, get: function () { return gameSettings_1.GAME_SETTINGS; } });
Object.defineProperty(exports, "calculateRadius", { enumerable: true, get: function () { return gameSettings_1.calculateRadius; } });
Object.defineProperty(exports, "calculateLevelUpScore", { enumerable: true, get: function () { return gameSettings_1.calculateLevelUpScore; } });
Object.defineProperty(exports, "calculatePlayerSpeed", { enumerable: true, get: function () { return gameSettings_1.calculatePlayerSpeed; } });
Object.defineProperty(exports, "getLevelColor", { enumerable: true, get: function () { return gameSettings_1.getLevelColor; } });
