import { isIP } from "node:net";
import type { Socket } from "socket.io";

import type { ClientToServerEvents, ServerToClientEvents } from "@abyss/irc-shared";

function normalizeIp(raw: string | undefined): string {
  if (!raw) {
    return "unknown";
  }

  if (raw.startsWith("::ffff:")) {
    return raw.slice(7);
  }

  return raw;
}

function extractForwardedIp(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  const raw = Array.isArray(value) ? value.join(",") : value;
  const candidate = raw.split(",")[0]?.trim();
  if (!candidate) {
    return null;
  }

  const normalized = normalizeIp(candidate);
  if (isIP(normalized) === 0) {
    return null;
  }

  return normalized;
}

export function getSocketIp(socket: Socket<ClientToServerEvents, ServerToClientEvents>): string {
  const headers = socket.handshake.headers;

  const forwarded =
    extractForwardedIp(headers["x-forwarded-for"]) ||
    extractForwardedIp(headers["x-real-ip"]) ||
    extractForwardedIp(headers["cf-connecting-ip"]);

  if (forwarded) {
    return forwarded;
  }

  return normalizeIp(socket.handshake.address);
}
