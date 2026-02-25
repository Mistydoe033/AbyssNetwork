import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";

import type {
  ChatReceivePayload,
  ClientToServerEvents,
  HistorySnapshotPayload,
  PresenceUpdatePayload,
  ServerToClientEvents
} from "@abyss/irc-shared";

import { createChatServer } from "../src/app.js";

let server: ReturnType<typeof createChatServer>;
let clientA: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;
let clientB: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

async function waitForEvent<T>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  event: keyof ServerToClientEvents,
  predicate: (payload: T) => boolean,
  timeoutMs = 4000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`Timed out waiting for ${event as string}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(payload);
    };

    socket.on(event, handler as never);
  });
}

async function connectClient(url: string): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000
    });

    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => reject(error));
  });
}

beforeEach(async () => {
  server = createChatServer({ host: "127.0.0.1", port: 0 });
  await server.start();
});

afterEach(async () => {
  clientA?.disconnect();
  clientB?.disconnect();
  await server.stop();
});

describe("chat server", () => {
  it("broadcasts presence and messages", async () => {
    const port = server.getPort();
    const url = `ws://127.0.0.1:${port}`;

    clientA = await connectClient(url);
    clientB = await connectClient(url);

    const presencePromise = waitForEvent<PresenceUpdatePayload>(
      clientA,
      "presence_update",
      (payload) =>
        payload.clients.length === 2 &&
        payload.clients.some((client) => client.ip === "192.168.1.10") &&
        payload.clients.some((client) => client.ip === "192.168.1.11") &&
        payload.clients.some((client) => client.alias === "Alpha") &&
        payload.clients.some((client) => client.alias === "Beta")
    );

    clientA.emit("register_alias", { alias: "Alpha", clientIpHint: "192.168.1.10" });
    clientB.emit("register_alias", { alias: "Beta", clientIpHint: "192.168.1.11" });

    const presence = await presencePromise;
    expect(presence.clients).toHaveLength(2);
    expect(presence.clients.map((client) => client.alias)).toContain("Beta");

    const messagePromise = waitForEvent<ChatReceivePayload>(
      clientB,
      "chat_receive",
      (payload) => payload.text === "hello abyss"
    );

    clientA.emit("chat_send", { text: "hello abyss" });
    const message = await messagePromise;

    expect(message.alias).toBe("Alpha");
    expect(message.ip).toBe("192.168.1.10");
    expect(message.sequence).toBeGreaterThan(0);

    const disconnectPresencePromise = waitForEvent<PresenceUpdatePayload>(
      clientA,
      "presence_update",
      (payload) => payload.clients.length === 1
    );

    clientB.disconnect();
    await disconnectPresencePromise;
  });

  it("replays history to newly connected clients", async () => {
    const port = server.getPort();
    const url = `ws://127.0.0.1:${port}`;

    clientA = await connectClient(url);
    clientA.emit("register_alias", { alias: "Alpha", clientIpHint: "192.168.1.10" });

    const messagePromise = waitForEvent<ChatReceivePayload>(
      clientA,
      "chat_receive",
      (payload) => payload.text === "persist me"
    );

    clientA.emit("chat_send", { text: "persist me" });
    const sentMessage = await messagePromise;

    const snapshotPromise = new Promise<HistorySnapshotPayload>((resolve, reject) => {
      const socket = io(url, {
        transports: ["websocket"],
        reconnection: false,
        timeout: 3000
      });

      clientB = socket;

      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error("Timed out waiting for history_snapshot"));
      }, 4000);

      socket.once("history_snapshot", (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });

      socket.once("connect_error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const snapshot = await snapshotPromise;

    const historyMessage = snapshot.entries.find(
      (entry): entry is { kind: "chat"; message: ChatReceivePayload } =>
        entry.kind === "chat" && entry.message.text === "persist me"
    );

    expect(historyMessage).toBeDefined();
    expect(historyMessage?.message.sequence).toBe(sentMessage.sequence);
  });
});
