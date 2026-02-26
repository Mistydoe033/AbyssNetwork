# IRC

Abyss IRC Ultra layout:
- `client/` - React renderer with multi-pane channels/DM UI and command composer.
- `server/` - Node gateway (Socket.IO + WebIRC endpoint `/webirc`) with channel/domain logic.
- `bot-runner/` - worker process for bot execution lifecycle.
- `shared/` - shared TypeScript event contracts and payload types.

## Core capabilities
- Device handshake and alias claim flow (`hello_device`, `claim_alias`).
- Channels + DMs + history fetch by scope.
- Command execution (`command_exec`) with moderation and utility commands.
- Message lifecycle events: create/edit/delete/reaction.
- Presence, moderation, bot events, and network snapshots.
- Retention cleanup (30 days default).

## Build and run
- Server: `cd IRC/server && npm ci && npm run build && npm run start`
- Client: `cd IRC/client && npm ci && npm run build && npm run preview`
- Bot runner: `cd IRC/bot-runner && npm ci && npm run build && npm run start`

## Render
Blueprint from root `render.yaml` provisions:
- `abyss-irc-gateway` (web)
- `abyss-irc-bot-runner` (worker)
- `abyss-irc-client` (static site)
