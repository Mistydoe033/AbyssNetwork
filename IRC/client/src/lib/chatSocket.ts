import { io, type Socket } from "socket.io-client";

import type {
  ChatSendPayload,
  ClientToServerEvents,
  PresenceUpdatePayload,
  RegisterAliasPayload,
  ServerToClientEvents,
  SystemNoticePayload,
  ChatReceivePayload,
  HistorySnapshotPayload
} from "@abyss/irc-shared";

import type { ConnectionState } from "../state/chatState";

const DEFAULT_SERVER_URL = "ws://127.0.0.1:7001";

type Cleanup = () => void;

type QueuedEmit = () => void;

function normalizeServerUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    return DEFAULT_SERVER_URL;
  }

  if (value.startsWith("ws://") || value.startsWith("wss://")) {
    return value;
  }

  if (value.startsWith("https://")) {
    return `wss://${value.slice("https://".length)}`;
  }

  if (value.startsWith("http://")) {
    return `ws://${value.slice("http://".length)}`;
  }

  return value;
}

class ChatSocket {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private queue: QueuedEmit[] = [];
  private readonly maxQueue = 100;
  private connectionListeners = new Set<(state: ConnectionState) => void>();
  private state: ConnectionState = {
    connected: false,
    reconnecting: true,
    attempt: 0
  };

  constructor() {
    const configuredUrl = import.meta.env.VITE_IRC_SERVER_URL || DEFAULT_SERVER_URL;
    const serverUrl = normalizeServerUrl(configuredUrl);

    this.socket = io(serverUrl, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity
    });

    this.attachLifecycleListeners();
    this.socket.connect();
  }

  private attachLifecycleListeners() {
    this.socket.on("connect", () => {
      this.setConnectionState({ connected: true, reconnecting: false, attempt: 0 });
      this.flushQueue();
    });

    this.socket.on("disconnect", () => {
      this.setConnectionState({ connected: false, reconnecting: true, attempt: this.state.attempt });
    });

    this.socket.io.on("reconnect_attempt", (attempt) => {
      this.setConnectionState({ connected: false, reconnecting: true, attempt });
    });
  }

  private setConnectionState(next: ConnectionState) {
    this.state = next;
    for (const listener of this.connectionListeners) {
      listener(this.state);
    }
  }

  private emitOrQueue(action: QueuedEmit): boolean {
    if (this.socket.connected) {
      action();
      return true;
    }

    if (this.queue.length >= this.maxQueue) {
      this.queue.shift();
    }

    this.queue.push(action);
    return false;
  }

  private flushQueue() {
    while (this.queue.length > 0 && this.socket.connected) {
      const action = this.queue.shift();
      action?.();
    }
  }

  onConnection(listener: (state: ConnectionState) => void): Cleanup {
    this.connectionListeners.add(listener);
    listener(this.state);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  onHistory(listener: (payload: HistorySnapshotPayload) => void): Cleanup {
    this.socket.on("history_snapshot", listener);
    return () => {
      this.socket.off("history_snapshot", listener);
    };
  }

  onPresence(listener: (payload: PresenceUpdatePayload) => void): Cleanup {
    this.socket.on("presence_update", listener);
    return () => {
      this.socket.off("presence_update", listener);
    };
  }

  onMessage(listener: (payload: ChatReceivePayload) => void): Cleanup {
    this.socket.on("chat_receive", listener);
    return () => {
      this.socket.off("chat_receive", listener);
    };
  }

  onNotice(listener: (payload: SystemNoticePayload) => void): Cleanup {
    this.socket.on("system_notice", listener);
    return () => {
      this.socket.off("system_notice", listener);
    };
  }

  registerAlias(alias: string): boolean {
    const payload: RegisterAliasPayload = { alias };
    return this.emitOrQueue(() => {
      this.socket.emit("register_alias", payload);
    });
  }

  sendChat(text: string): boolean {
    const payload: ChatSendPayload = { text };
    return this.emitOrQueue(() => {
      this.socket.emit("chat_send", payload);
    });
  }
}

export const chatSocket = new ChatSocket();
