import { createChatServer } from "./app.js";

const host = process.env.IRC_SERVER_HOST ?? "0.0.0.0";
const port = Number(process.env.IRC_SERVER_PORT ?? process.env.PORT ?? "7001");

const configuredOrigins = process.env.IRC_ALLOWED_ORIGINS
  ? process.env.IRC_ALLOWED_ORIGINS.split(",").map((entry) => entry.trim()).filter(Boolean)
  : undefined;

const server = createChatServer({
  host,
  port,
  ...(configuredOrigins ? { allowedOrigins: configuredOrigins } : {})
});

async function bootstrap() {
  await server.start();
  console.log(`IRC server listening on ws://${host}:${server.getPort()}`);
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
