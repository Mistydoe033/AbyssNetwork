// Fix for hanging connections in deployed environments
import { io, type Socket } from "socket.io-client";

import type {
  AliasResultPayload,
  BotEventPayload,
  ChannelEventPayload,
  ClaimAliasPayload,
  ClientToServerEvents,
  CommandExecPayload,
  DeviceHelloPayload,
  HistoryFetchPayload,
  HistorySnapshotPayload,
  JoinChannelPayload,
  MessageDeletePayload,
  MessageEditPayload,
  MessageEventPayload,
  NetworkSnapshotPayload,
  PartChannelPayload,
  PresenceEventPayload,
  ReactTogglePayload,
  SendChannelMessagePayload,
  SendDmMessagePayload,
  ServerErrorPayload,
  ServerToClientEvents,
  SessionReadyPayload,
  TypingStatePayload,
  BotInvokePayload
} from "@abyss/irc-shared";

const DEFAULT_SERVER_URL = "ws://127.0.0.1:7001";

function normalizeServerUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return DEFAULT_SERVER_URL;
  }
  if (value.startsWith("http://")) {
    return `ws://${value.slice("http://".length)}`;
  }
  if (value.startsWith("https://")) {
    return `wss://${value.slice("https://".length)}`;
  }
  return value;
}

type Cleanup = () => void;

export class ChatSocket {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Use environment variable or fallback to default
    const configured = import.meta.env.VITE_IRC_SERVER_URL || DEFAULT_SERVER_URL;
    
    // Add connection timeout to prevent hanging
    this.socket = io(normalizeServerUrl(configured), {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000, // 10 second connection timeout
      autoConnect: false // Don't auto-connect, connect manually
    });
    
    // Set up connection timeout
    this.setupConnectionTimeout();
  }

  private setupConnectionTimeout(): void {
    // Clear any existing timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    
    // Set new timeout
    this.connectionTimeout = setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        console.error('WebSocket connection timeout - check server URL and network connectivity');
        // Optionally emit an error event or handle timeout
      }
    }, 10000); // 10 second timeout
  }

  connect(): void {
    // Clear any existing timeout before connecting
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Connect manually
    this.socket.connect();
    
    // Set up timeout again after connection attempt
    this.setupConnectionTimeout();
  }

  onConnect(listener: (connected: boolean) => void): Cleanup {
    const onConnect = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      listener(true);
    };
    
    const onDisconnect = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      listener(false);
    };
    
    this.socket.on("connect", onConnect);
    this.socket.on("disconnect", onDisconnect);
    listener(this.socket.connected);
    return () => {
      this.socket.off("connect", onConnect);
      this.socket.off("disconnect", onDisconnect);
    };
  }

  // ... rest of the methods remain the same
  // (I'll show the rest of the methods below)
  
  onSessionReady(listener: (payload: SessionReadyPayload) => void): Cleanup {
    this.socket.on("session_ready", listener);
    return () => this.socket.off("session_ready", listener);
  }

  onAliasResult(listener: (payload: AliasResultPayload) => void): Cleanup {
    this.socket.on("alias_result", listener);
    return () => this.socket.off("alias_result", listener);
  }

  onNetworkSnapshot(listener: (payload: NetworkSnapshotPayload) => void): Cleanup {
    this.socket.on("network_snapshot", listener);
    return () => this.socket.off("network_snapshot", listener);
  }

  onChannelEvent(listener: (payload: ChannelEventPayload) => void): Cleanup {
    this.socket.on("channel_event", listener);
    return () => this.socket.off("channel_event", listener);
  }

  onMessageEvent(listener: (payload: MessageEventPayload) => void): Cleanup {
    this.socket.on("message_event", listener);
    return () => this.socket.off("message_event", listener);
  }

  onPresenceEvent(listener: (payload: PresenceEventPayload) => void): Cleanup {
    this.socket.on("presence_event", listener);
    return () => this.socket.off("presence_event", listener);
  }

  onBotEvent(listener: (payload: BotEventPayload) => void): Cleanup {
    this.socket.on("bot_event", listener);
    return () => this.socket.off("bot_event", listener);
  }

  onHistorySnapshot(listener: (payload: HistorySnapshotPayload) => void): Cleanup {
    this.socket.on("history_snapshot", listener);
    return () => this.socket.off("history_snapshot", listener);
  }

  onError(listener: (payload: ServerErrorPayload) => void): Cleanup {
    this.socket.on("server_error", listener);
    return () => this.socket.off("server_error", listener);
  }

  helloDevice(payload: DeviceHelloPayload): void {
    this.socket.emit("hello_device", payload);
  }

  claimAlias(payload: ClaimAliasPayload): void {
    this.socket.emit("claim_alias", payload);
  }

  commandExec(payload: CommandExecPayload): void {
    this.socket.emit("command_exec", payload);
  }

  joinChannel(payload: JoinChannelPayload): void {
    this.socket.emit("join_channel", payload);
  }

  partChannel(payload: PartChannelPayload): void {
    this.socket.emit("part_channel", payload);
  }

  sendChannelMessage(payload: SendChannelMessagePayload): void {
    this.socket.emit("send_channel_message", payload);
  }

  sendDmMessage(payload: SendDmMessagePayload): void {
    this.socket.emit("send_dm_message", payload);
  }

  reactToggle(payload: ReactTogglePayload): void {
    this.socket.emit("react_toggle", payload);
  }

  messageEdit(payload: MessageEditPayload): void {
    this.socket.emit("message_edit", payload);
  }

  messageDelete(payload: MessageDeletePayload): void {
    this.socket.emit("message_delete", payload);
  }

  historyFetch(payload: HistoryFetchPayload): void {
    this.socket.emit("history_fetch", payload);
  }

  typingState(payload: TypingStatePayload): void {
    this.socket.emit("typing_state", payload);
  }

  botInvoke(payload: BotInvokePayload): void {
    this.socket.emit("bot_invoke", payload);
  }
}

export const chatSocket = new ChatSocket();# IRC

Abyss IRC Ultra layout:
- `client/` - React renderer with multi-pane channels/DM UI and command composer.
- `server/` - Node gateway (Socket.IO + WebIRC endpoint `/webirc`) with channel/domain logic.
- `bot-runner/` - worker process for bot execution lifecycle.
- `shared/` - shared TypeScript event contracts and payload types.

## Core capabilities
- Device handshake and alias claim flow (`hello_device`, `claim_alias`).
- Channels + DMs + history fetch by scope.
- Command execution (`command_exec`) with moderation and utility commands.
- Message lifecycle events: create/edit/delete/reaction.
- Presence, moderation, bot events, and network snapshots.
- Retention cleanup (30 days default).

## Build and run
- Server: `cd IRC/server && npm ci && npm run build && npm run start`
- Client: `cd IRC/client && npm ci && npm run build && npm run preview`
- Bot runner: `cd IRC/bot-runner && npm ci && npm run build && npm run start`

## Render
Blueprint from root `render.yaml` provisions:
- `abyss-irc-gateway` (web)
- `abyss-irc-bot-runner` (worker)
- `abyss-irc-client` (static site)
