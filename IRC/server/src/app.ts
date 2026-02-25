import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Server, type Socket } from "socket.io";

import type {
  ChatReceivePayload,
  ClientToServerEvents,
  PresenceClient,
  ServerToClientEvents,
  SystemNoticeCode
} from "@abyss/irc-shared";

import { validateAlias, validateMessage } from "./validation.js";

interface ClientState {
  clientId: string;
  alias: string | null;
  ip: string;
  connectedAt: string;
  messageTimestamps: number[];
}

export interface ServerConfig {
  host: string;
  port: number;
  allowedOrigins: string[];
  messageRateLimitCount: number;
  messageRateLimitWindowMs: number;
}

const DEFAULT_CONFIG: ServerConfig = {
  host: "0.0.0.0",
  port: 7001,
  allowedOrigins: ["localhost", "127.0.0.1", "::1", "192.168.0.0/16", "10.0.0.0/8"],
  messageRateLimitCount: 10,
  messageRateLimitWindowMs: 5000
};

function nowIso(): string {
  return new Date().toISOString();
}

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

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

function normalizeClientIpHint(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const value = raw.trim();
  if (!value) {
    return null;
  }

  const normalized = normalizeIp(value);
  if (isIP(normalized) === 0 || isLoopbackIp(normalized)) {
    return null;
  }

  return normalized;
}

function getSocketIp(socket: Socket<ClientToServerEvents, ServerToClientEvents>): string {
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

function isPrivateIpv4(hostname: string): boolean {
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4Match) {
    return false;
  }

  const first = Number(ipv4Match[1]);
  const second = Number(ipv4Match[2]);

  if (first === 10) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  return false;
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes("*")) {
    return true;
  }

  if (!origin || origin === "null") {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      return true;
    }

    if (isPrivateIpv4(hostname)) {
      return true;
    }

    return allowedOrigins.includes(origin) || allowedOrigins.includes(hostname);
  } catch {
    return false;
  }
}

function toPresenceClient(state: ClientState): PresenceClient {
  return {
    clientId: state.clientId,
    alias: state.alias,
    ip: state.ip,
    connectedAt: state.connectedAt
  };
}

function canSendMessage(
  state: ClientState,
  now: number,
  maxCount: number,
  windowMs: number
): boolean {
  state.messageTimestamps = state.messageTimestamps.filter((ts) => now - ts <= windowMs);
  if (state.messageTimestamps.length >= maxCount) {
    return false;
  }
  state.messageTimestamps.push(now);
  return true;
}

export function createChatServer(overrides: Partial<ServerConfig> = {}) {
  const config: ServerConfig = { ...DEFAULT_CONFIG, ...overrides };

  const httpServer = createHttpServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    transports: ["websocket"],
    allowUpgrades: false,
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin, config.allowedOrigins)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed"));
      }
    }
  });

  const clients = new Map<string, ClientState>();

  const broadcastPresence = () => {
    io.emit("presence_update", {
      clients: Array.from(clients.values()).map(toPresenceClient)
    });
  };

  const emitNotice = (
    target: typeof io | Socket<ClientToServerEvents, ServerToClientEvents>,
    code: SystemNoticeCode,
    message: string
  ) => {
    target.emit("system_notice", {
      code,
      message,
      timestamp: nowIso()
    });
  };

  io.on("connection", (socket) => {
    const state: ClientState = {
      clientId: socket.id,
      alias: null,
      ip: getSocketIp(socket),
      connectedAt: nowIso(),
      messageTimestamps: []
    };

    clients.set(socket.id, state);
    broadcastPresence();
    emitNotice(io, "USER_JOINED", `Client joined from ${state.ip}.`);

    socket.on("register_alias", (payload) => {
      const result = validateAlias(payload?.alias);
      if (!result.ok || !result.value) {
        emitNotice(socket, "ERROR", result.error ?? "Invalid alias.");
        return;
      }

      const current = clients.get(socket.id);
      if (!current) {
        return;
      }

      const hintedIp = normalizeClientIpHint(payload?.clientIpHint);
      if (hintedIp && isLoopbackIp(current.ip)) {
        current.ip = hintedIp;
      }

      current.alias = result.value;
      emitNotice(socket, "ALIAS_SET", `Alias set to ${result.value}.`);
      broadcastPresence();
    });

    socket.on("chat_send", (payload) => {
      const current = clients.get(socket.id);
      if (!current) {
        return;
      }

      const validation = validateMessage(payload?.text);
      if (!validation.ok || !validation.value) {
        emitNotice(socket, "ERROR", validation.error ?? "Invalid message.");
        return;
      }

      const allowed = canSendMessage(
        current,
        Date.now(),
        config.messageRateLimitCount,
        config.messageRateLimitWindowMs
      );

      if (!allowed) {
        emitNotice(socket, "ERROR", "Rate limit exceeded: max 10 messages per 5 seconds.");
        return;
      }

      const message: ChatReceivePayload = {
        messageId: randomUUID(),
        clientId: current.clientId,
        alias: current.alias ?? current.ip,
        ip: current.ip,
        text: validation.value,
        timestamp: nowIso()
      };

      io.emit("chat_receive", message);
    });

    socket.on("disconnect", () => {
      const disconnected = clients.get(socket.id);
      clients.delete(socket.id);
      broadcastPresence();

      if (disconnected) {
        const label = disconnected.alias ? `${disconnected.alias} (${disconnected.ip})` : disconnected.ip;
        emitNotice(io, "USER_LEFT", `${label} disconnected.`);
      }
    });
  });

  const start = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(config.port, config.host, () => {
        httpServer.off("error", reject);
        resolve();
      });
    });
  };

  const stop = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });

    await new Promise<void>((resolve, reject) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }

      httpServer.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  const getPort = (): number => {
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      return config.port;
    }
    return address.port;
  };

  return {
    start,
    stop,
    getPort,
    clients
  };
}
