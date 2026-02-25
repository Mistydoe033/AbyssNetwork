# AbyssNetwork

Abyss IRC Ultra: a multi-channel IRC-style network with commands, moderation, DM encryption envelope, history replay, WebIRC endpoint, and Render blueprint deployment.

## Services
- `abyss-irc-gateway` (`IRC/server`)
- `abyss-irc-bot-runner` (`IRC/bot-runner`)
- `abyss-irc-client` (`IRC/client`)

All services are defined in [`render.yaml`](./render.yaml).

## Deploy on Render
1. Push this repo to GitHub.
2. In Render, create a **Blueprint** from this repository.
3. Wait for all three services to deploy.
4. Open the client URL.
5. Optional WebIRC endpoint: `wss://<gateway-domain>/webirc`.

## Runtime notes
- Gateway health check: `/healthz`
- Client WebSocket URL is wired from gateway `RENDER_EXTERNAL_URL`.
- Retention cleanup uses `RETENTION_DAYS` (default `30`).
- Gateway state file path is configurable via `IRC_STATE_PATH`.
