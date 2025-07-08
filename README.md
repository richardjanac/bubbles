# Paddock Bubbles

2D online multiplayer bubble hra v štýle .io

## 🎮 O hre

Paddock Bubbles je multiplayer hra, kde hráči ovládajú bubliny s cieľom rásť konzumáciou menších bublín. Hra obsahuje:

- **Levelovací systém** - Po dosiahnutí určitého skóre sa level zvýši a základná rýchlosť sa násobí
- **Turbo mechanika** - Dvojnásobná rýchlosť za cenu strácania bodov
- **Bot AI** - Automaticky sa pridávajú boti pre minimálny počet 10 hráčov
- **Responzívne ovládanie** - Myš na desktope, virtuálny joystick na mobile

## 🚀 Inštalácia a spustenie

1. **Nainštaluj závislosti:**
```bash
npm install
```

2. **Spusti vývojový server:**
```bash
npm run dev
```

Hra pobeží na:
- Frontend: http://localhost:3000
- Game Server: http://localhost:3001

## 🎯 Ako hrať

### Desktop ovládanie:
- **Pohyb**: Bublina nasleduje kurzor myši
- **Turbo**: Drž medzerník

### Mobilné ovládanie:
- **Pohyb**: Virtuálny joystick v pravom dolnom rohu
- **Turbo**: Červené tlačidlo v ľavom dolnom rohu

## 📋 Herné mechaniky

- **Skóre a veľkosť**: Veľkosť bubliny rastie s počtom bodov
- **Kolízie**: Väčšia bublina zje menšiu, pri rovnakom skóre sa nič nedeje
- **Level Up**: 
  - Level 1 → 2: 500 bodov
  - Level 2 → 3: 600 bodov
  - Každý ďalší level: +100 bodov navyše
- **Turbo**: 2x rýchlosť, stráca 50 bodov/sekundu

## 🛠 Technológie

- **Frontend**: Next.js 15, React 19, TypeScript, Canvas API
- **Backend**: Node.js, Socket.IO
- **Styling**: Tailwind CSS

## 📦 Deployment

Projekt je pripravený na nasadenie na Vercel. Pre produkčné nasadenie:

1. Nastav environment premennú `NEXT_PUBLIC_SERVER_URL` na URL tvojho WebSocket servera
2. Deploy frontend na Vercel
3. Deploy game server na podporovanú platformu (napr. Railway, Render)

## 🔧 Konfigurácia

Herné konštanty môžeš upraviť v súbore `types/game.ts`:

```typescript
export const GAME_CONSTANTS = {
  MIN_PLAYERS: 10,
  STARTING_SCORE: 100,
  BASE_SPEED: 100,
  TURBO_MULTIPLIER: 2,
  // ...
};
```
# Prázdna zmena pre nový deployment
