# AbyssNetwork
An improved IRC *STILL IN DEVELOPMENT*

Primary stack is now in [`IRC/`](./IRC/README.md):
- Electron client (`IRC/client`)
- Node + Socket.IO server (`IRC/server`)
- Shared event contracts (`IRC/shared`)

Setup from repo root:

```bash
./setup.sh
```

Run server + Electron with one command:

```bash
./run.sh
```

Optional overrides:
```bash
IRC_SERVER_HOST=0.0.0.0 IRC_SERVER_PORT=7001 ./run.sh
IRC_SERVER_URL=ws://127.0.0.1:7001 ./run.sh
```

Legacy alias:
```bash
./run-all.sh
```

Legacy folders are still present and untouched:
- `react/`
- `AbyssNet/`

## Deploy (One Place on Render)

This repo includes a Render Blueprint at [`render.yaml`](./render.yaml) that deploys both:
- `abyss-irc-server` (Node + Socket.IO web service, free plan)
- `abyss-irc-client` (Vite static site, free plan)

Steps:
1. Push this repo to GitHub.
2. In Render: **New** -> **Blueprint**.
3. Select your repo/branch and create.
4. Wait for both services to finish deploying.
5. Open `abyss-irc-client` URL and chat.

Notes:
- Free web service may spin down when idle.
- Use this for hobby/testing. For always-on behavior, upgrade plan.
