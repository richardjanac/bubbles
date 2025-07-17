// Debug script pre kontrolu NPC v konzole
// Spustite v DevTools konzole

// 1. Skontroluj koľko NPC je v game state
if (window.gameState) {
  const npcCount = Object.keys(window.gameState.npcBubbles).length;
  console.log(`NPC v game state: ${npcCount}`);
}

// 2. Skontroluj viewport bounds
console.log('Viewport bounds:', window.viewportBounds);

// 3. Skontroluj koľko NPC je viditeľných
console.log('Visible NPCs:', window.visibleNPCs?.length);

// 4. Skontroluj performance settings
console.log('Performance tier:', window.devicePerformance);

// 5. Debug NPC pozície
if (window.gameState && window.camera) {
  const npcs = Object.values(window.gameState.npcBubbles).slice(0, 5);
  npcs.forEach(npc => {
    const screenX = npc.position.x - window.camera.x;
    const screenY = npc.position.y - window.camera.y;
    console.log(`NPC ${npc.id}: world(${npc.position.x}, ${npc.position.y}) screen(${screenX}, ${screenY})`);
  });
} 