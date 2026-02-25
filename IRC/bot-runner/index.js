const intervalMs = Number(process.env.BOT_HEARTBEAT_MS || "15000");

function nowIso() {
  return new Date().toISOString();
}

function heartbeat() {
  console.log(`[${nowIso()}] abyss-bot-runner heartbeat`);
}

console.log("Abyss bot runner started.");
heartbeat();

const timer = setInterval(heartbeat, intervalMs);

function shutdown() {
  clearInterval(timer);
  console.log("Abyss bot runner stopped.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
