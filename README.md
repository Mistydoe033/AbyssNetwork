# AbyssNetwork

Render-only deployment for The Abyss chat.

## Services
- `abyss-irc-server` (`IRC/server`)
- `abyss-irc-client` (`IRC/client`)

Both are defined in [`render.yaml`](./render.yaml).

## Deploy on Render
1. Push this repo to GitHub.
2. In Render, create a **Blueprint** from this repository.
3. Wait for both services to deploy.
4. Open the client URL and chat.

## Runtime notes
- Server health check: `/healthz`
- WebSocket URL for client is wired from the server `RENDER_EXTERNAL_URL`.
- Build commands are deterministic: `npm ci && npm run build`.
