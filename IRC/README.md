# IRC (Electron + Socket.IO)

A full rebuild of Abyss chat in `IRC/` with:
- Electron desktop client
- React + TypeScript renderer (Vite)
- Dedicated Node Socket.IO realtime server
- Shared event contracts (`IRC/shared`)

## Ports and endpoints
- Server bind: `0.0.0.0:7001` (default)
- Client endpoint: `ws://127.0.0.1:7001` (default)

Override server bind:
- `IRC_SERVER_HOST`
- `IRC_SERVER_PORT`

Override client target:
- `IRC_SERVER_URL` (used by root/client run scripts)

## Commands
From repo root:

```bash
./setup.sh
./run.sh
```

Direct IRC commands:

```bash
./IRC/scripts/setup.sh
./IRC/scripts/run.sh
./IRC/scripts/run-server.sh
./IRC/scripts/run-client.sh
```

## Render deployment
Use the repo root Blueprint file: [`render.yaml`](../render.yaml)

Quick deploy:
1. Push repo to GitHub
2. Render -> New -> Blueprint
3. Select repository and deploy

The Blueprint provisions both server and client on free plans and wires:
- `IRC_ALLOWED_ORIGINS` from client service URL
- `VITE_IRC_SERVER_URL` from server service URL

## What this includes
- Alias registration (`register_alias`)
- Live chat (`chat_send` / `chat_receive`)
- Connected clients with IP (`presence_update`)
- System notices (`system_notice`)
- Reconnect handling with queued outgoing emits
- Message rate limit: 10 messages / 5 seconds per socket

## Notes
- Electron clients provide a local LAN-IP hint, so same-machine localhost connections can still display LAN IP instead of only loopback.
- Legacy `react/` + `AbyssNet/` remain in repo and are not required for this stack.
