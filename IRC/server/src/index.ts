import { createChatServer } from "./app.js";

const host = process.env.IRC_SERVER_HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? "7001");
const statePath = process.env.IRC_STATE_PATH ?? "data/irc-ultra-state.json";
const retentionDays = Number(process.env.RETENTION_DAYS ?? "30");

const configuredOrigins = process.env.IRC_ALLOWED_ORIGINS
  ? process.env.IRC_ALLOWED_ORIGINS.split(",").map((entry) => entry.trim()).filter(Boolean)
  : ["https://abyss-irc-client.onrender.com"];

const server = createChatServer({
  host,
  port,
  statePath,
  retentionDays,
  ...(configuredOrigins ? { allowedOrigins: configuredOrigins } : {})
});

async function bootstrap() {
  await server.start();
  console.log(`Abyss IRC gateway listening on ws://${host}:${server.getPort()} (WebIRC /webirc)`);
}

bootstrap().catch((error) => {
  console.error("Failed to start IRC server", error);
  process.exit(1);
});

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
