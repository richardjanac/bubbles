# ⚡ Rýchle spustenie do produkcie

## 🎯 Railway.app (5 minút) - ODPORÚČANÉ

1. **Choď na [railway.app](https://railway.app)**

2. **Prihlás sa cez GitHub**

3. **Klikni "New Project"**

4. **"Deploy from GitHub repo"** → vyber `bubbles`

5. **Počkaj na automatické nasadenie** (2-3 minúty)

6. **Získaj URL** (napr. `https://bubbles-production-xxxx.up.railway.app`)

7. **Nastav environment variable na Vercel:**
   - Choď na [vercel.com](https://vercel.com) → tvoj projekt
   - Settings → Environment Variables
   - Pridaj: `NEXT_PUBLIC_SERVER_URL` = tvoja Railway URL

8. **Redeploy frontend** na Vercel

9. **HOTOVO! 🎉** Hra beží na oboch platformách

---

## 🔗 Súhrn URL-iek

Po nasadení budeš mať:
- **Frontend (Vercel):** `https://tvoj-projekt.vercel.app`
- **Server (Railway):** `https://bubbles-production-xxxx.up.railway.app`

Oba sa automaticky aktualizujú pri každom git push! 🚀 