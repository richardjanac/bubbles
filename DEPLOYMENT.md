# 🚀 Nasadenie Paddock Bubbles do Produkcie

## 📋 Požiadavky

Paddock Bubbles potrebuje:
- **Frontend** (Next.js) - nasadí sa na Vercel ✅ (už máš)
- **Backend** (Node.js server) - potrebuje WebSocket podporu

## 🎯 Možnosti nasadenia servera

### 1. Railway.app (Odporúčané) 🚄

**Prečo Railway:**
- Jednoduché nasadenie z GitHub
- Automatické builds
- WebSocket podpora
- Bezplatný tier

**Kroky:**
1. Choď na [railway.app](https://railway.app)
2. Prihlás sa cez GitHub
3. Klikni "New Project" → "Deploy from GitHub repo"
4. Vyber svoj repozitár `bubbles`
5. Railway automaticky detekuje Node.js projekt
6. Projekt sa nasadí s týmito súbormi:
   - ✅ `Procfile` - špecifikuje start command
   - ✅ `railway.json` - konfigurácia
   - ✅ `package.json` - má `build:server` a `start:server` skripty

**Environment variables na Railway:**
```
PORT=3001
NODE_ENV=production
```

### 2. Render.com 🎨

**Kroky:**
1. Choď na [render.com](https://render.com)
2. Pripoj GitHub účet
3. "New Web Service" → vyber repozitár
4. Nastavenia:
   - **Build Command:** `npm run build:server`
   - **Start Command:** `npm run start:server`
   - **Environment:** Node.js

### 3. Heroku 🟪

**Kroky:**
1. Nainštaluj [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Terminál:
```bash
heroku create tvoj-app-nazov
heroku config:set NODE_ENV=production
git push heroku main
```

## 🔗 Prepojenie s frontendom

Po nasadení servera:

1. **Získaj URL servera** (napr. `https://tvoj-server.railway.app`)

2. **Aktualizuj frontend environment:**
   Na Vercel nastav environment variable:
   ```
   NEXT_PUBLIC_SERVER_URL=https://tvoj-server.railway.app
   ```

3. **Redeploy frontend** na Vercel

## 🧪 Testovanie

Po nasadení otestuj:
- ✅ Načítanie home screen
- ✅ Pripojenie k serveru (zmizne "Pripájam sa...")
- ✅ Hra funguje plynulo
- ✅ Leaderboard sa načítava
- ✅ Mobil ovládanie

## 🐛 Riešenie problémov

### Server sa nespustí
- Skontroluj logy na hosting platforme
- Overeň, že `PORT` environment variable je nastavená
- Skontroluj `package.json` skripty

### Frontend sa nepripojí
- Overeč `NEXT_PUBLIC_SERVER_URL` na Vercel
- Skontroluj CORS nastavenia v serveri
- Otvor browser DevTools → Network tab

### WebSocket chyby
- Niektoré hostingy nepodporujú WebSocket
- Railway.app, Render.com ✅ podporujú
- Heroku ✅ podporuje (s limitmi na free tier)

## 💡 Tipy

- **Railway** je najjednoduchšie pre začiatočníkov
- Môžeš používať **free tier** pre testovanie
- Pre produkciu zvýš **resources/memory** podľa potreby
- **Monitoring** - všetky platformy majú build-in logy

## 🔄 Automatické nasadenie

Po nastavení sa každý `git push` automaticky nasadí:
- **Frontend** → Vercel (už funguje)
- **Server** → Railway/Render/Heroku 