# IRC

Render deployment layout:
- `client/` - Vite React web app
- `server/` - Node Socket.IO server
- `shared/` - shared TypeScript event contracts

Render uses:
- `IRC/server` build: `npm ci && npm run build`
- `IRC/server` start: `npm run start`
- `IRC/client` build: `npm ci && npm run build`
- `IRC/client` publish path: `dist`
