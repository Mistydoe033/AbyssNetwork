import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";

import { Server } from "socket.io";

import type {
  ChatReceivePayload,
  ClientToServerEvents,
  ServerToClientEvents
} from "@abyss/irc-shared";

import { ClientRegistry, type ClientState } from "./domain/clientRegistry.js";
import { HistoryStore } from "./domain/historyStore.js";
import { NoticeBuilder } from "./domain/noticeBuilder.js";
import { getSocketIp } from "./net/ip.js";
import { isOriginAllowed } from "./net/originPolicy.js";
import { validateAlias, validateMessage } from "./validation.js";

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

function canSendMessage(
  client: ClientState,
  now: number,
  maxCount: number,
  windowMs: number
): boolean {
  client.messageTimestamps = client.messageTimestamps.filter((ts) => now - ts <= windowMs);

  if (client.messageTimestamps.length >= maxCount) {
    return false;
  }

  client.messageTimestamps.push(now);
  return true;
}

type NoticeTarget = {
  emit: (event: "system_notice", payload: Parameters<ServerToClientEvents["system_notice"]>[0]) => void;
};

export function createChatServer(overrides: Partial<ServerConfig> = {}) {
  const config: ServerConfig = { ...DEFAULT_CONFIG, ...overrides };

  const httpServer = createHttpServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

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

  const clientRegistry = new ClientRegistry();
  const historyStore = new HistoryStore();
  const noticeBuilder = new NoticeBuilder(() => historyStore.nextSequence());

  const emitNotice = (target: NoticeTarget, payload: Parameters<ServerToClientEvents["system_notice"]>[0]) => {
    target.emit("system_notice", payload);
  };

  const broadcastPresence = () => {
    io.emit("presence_update", {
      clients: clientRegistry.listPresence()
    });
  };

  io.on("connection", (socket) => {
    socket.emit("history_snapshot", {
      entries: historyStore.snapshot()
    });

    const client = clientRegistry.addClient(socket.id, getSocketIp(socket), nowIso());

    broadcastPresence();
    emitNotice(socket.broadcast, noticeBuilder.userJoined(client.clientId, client.ip));

    socket.on("register_alias", (payload) => {
      const validatedAlias = validateAlias(payload?.alias);
      if (!validatedAlias.ok || !validatedAlias.value) {
        emitNotice(
          socket,
          noticeBuilder.error(validatedAlias.error ?? "Invalid alias.", "ALIAS_INVALID")
        );
        return;
      }

      const aliasResult = clientRegistry.setAliasIfAvailable(socket.id, validatedAlias.value);
      if (!aliasResult.ok) {
        if (aliasResult.reason === "ALIAS_IN_USE") {
          emitNotice(
            socket,
            noticeBuilder.error(`Alias ${validatedAlias.value} is already in use.`, "ALIAS_IN_USE")
          );
        }
        return;
      }

      if (!aliasResult.changed) {
        return;
      }

      emitNotice(
        socket,
        noticeBuilder.aliasSet(aliasResult.client.clientId, validatedAlias.value, aliasResult.client.ip)
      );
      broadcastPresence();
    });

    socket.on("chat_send", (payload) => {
      const currentClient = clientRegistry.getClient(socket.id);
      if (!currentClient) {
        return;
      }

      const validation = validateMessage(payload?.text);
      if (!validation.ok || !validation.value) {
        emitNotice(
          socket,
          noticeBuilder.error(validation.error ?? "Invalid message.", "MESSAGE_INVALID")
        );
        return;
      }

      const allowed = canSendMessage(
        currentClient,
        Date.now(),
        config.messageRateLimitCount,
        config.messageRateLimitWindowMs
      );

      if (!allowed) {
        emitNotice(
          socket,
          noticeBuilder.error("Rate limit exceeded: max 10 messages per 5 seconds.", "RATE_LIMIT")
        );
        return;
      }

      const message: ChatReceivePayload = {
        sequence: historyStore.nextSequence(),
        messageId: randomUUID(),
        clientId: currentClient.clientId,
        alias: currentClient.alias ?? currentClient.ip,
        ip: currentClient.ip,
        text: validation.value,
        timestamp: nowIso()
      };

      historyStore.appendChat(message);
      io.emit("chat_receive", message);
    });

    socket.on("disconnect", () => {
      const disconnected = clientRegistry.removeClient(socket.id);
      broadcastPresence();

      if (!disconnected) {
        return;
      }

      emitNotice(
        socket.broadcast,
        noticeBuilder.userLeft(disconnected.clientId, disconnected.alias, disconnected.ip)
      );
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
    getPort
  };
}
