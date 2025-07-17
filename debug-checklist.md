# 🐛 Debug Checklist

## 1. Kontrola serverov
- [ ] Frontend beží na http://localhost:3000
- [ ] Game server beží na http://localhost:3001
- [ ] Health check: `curl http://localhost:3001/health`

## 2. Najčastejšie problémy v konzole

### WebSocket connection failed
```
WebSocket connection to 'ws://localhost:3001/socket.io/...' failed
```
**Riešenie**: Server nebeží alebo je na zlom porte. Skontroluj NEXT_PUBLIC_SERVER_URL v .env

### CORS error
```
Access to XMLHttpRequest blocked by CORS policy
```
**Riešenie**: Server má zlé CORS nastavenia. Skontroluj server/gameServer.ts

### Too many WebGL contexts
```
WARNING: Too many active WebGL contexts. Oldest context will be lost.
```
**Riešenie**: Príliš veľa canvas elementov. Browser limit je ~16 WebGL kontextov.

### Performance warnings
```
[Violation] 'requestAnimationFrame' handler took XXms
```
**Riešenie**: Render loop je príliš pomalý. Aktivuje sa adaptívna kvalita.

## 3. Network tab kontrola
- Socket.IO polling/websocket requests
- Delta updates (should be small ~1-5KB)
- Latency pod 200ms

## 4. Mobile debugging
- Pripoj mobil na rovnakú WiFi
- Použi Network adresu: http://192.168.50.155:3000
- Chrome DevTools Remote Debugging

## 5. Performance profiling
1. DevTools → Performance → Record
2. Hraj 10-20 sekúnd
3. Stop recording
4. Hľadaj:
   - Long tasks (>50ms)
   - Dropped frames
   - High CPU usage 