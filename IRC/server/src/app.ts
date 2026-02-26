import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { Server, type Socket } from "socket.io";

import type {
  AliasResultPayload,
  BotEventPayload,
  ChannelEventPayload,
  ChannelModeFlag,
  ClientToServerEvents,
  MessageEventPayload,
  MessageKind,
  MessageRecord,
  MessageScope,
  ModerationActionType,
  NetworkSnapshotPayload,
  PresenceEventPayload,
  PresenceStatus,
  Role,
  ServerErrorCode,
  ServerToClientEvents
} from "@abyss/irc-shared";

import { parseCommand } from "./core/commandParser.js";
import { hasRoleAtLeast, roleFromMode } from "./core/roles.js";
import { pickDistinctColor } from "./domain/colorAllocator.js";
import { getSocketIp } from "./net/ip.js";
import { isOriginAllowed } from "./net/originPolicy.js";
import { FileStore } from "./storage/fileStore.js";
import { normalizeAlias, normalizeChannel, normalizeMessage, sanitizeText } from "./validation.js";

export interface ServerConfig {
  host: string;
  port: number;
  statePath: string;
  motd: string;
  allowedOrigins: string[];
  retentionDays: number;
  globalRateLimitCount: number;
  globalRateLimitWindowMs: number;
}

const DEFAULT_CONFIG: ServerConfig = {
  host: "0.0.0.0",
  port: 7001,
  statePath: process.env.IRC_STATE_PATH ?? "data/irc-ultra-state.json",
  motd: "Welcome to Abyss IRC Ultra. Type /help to explore commands.",
  allowedOrigins: ["localhost", "127.0.0.1", "::1"],
  retentionDays: Number(process.env.RETENTION_DAYS ?? "30"),
  globalRateLimitCount: 25,
  globalRateLimitWindowMs: 5000
};

interface LiveClient {
  socket: Socket<ClientToServerEvents, ServerToClientEvents>;
  ip: string;
  deviceId: string | null;
  devicePublicKey: string | null;
  sessionId: string | null;
  resumeToken: string;
  alias: string | null;
  reclaimNonce: string | null;
  status: PresenceStatus;
  channels: Set<string>;
  ignoredAliases: Set<string>;
  messageTimestamps: number[];
  color: string;
}

interface WebIrcClient {
  ws: WebSocket;
  ip: string;
  alias: string | null;
  channel: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function roomForAlias(alias: string): string {
  return `alias:${alias}`;
}

function roomForChannel(channel: string): string {
  return `channel:${channel}`;
}

function normalizeRoleForNewChannel(isOwner: boolean): Role {
  return isOwner ? "OWNER" : "MEMBER";
}

function parseModeFlag(raw: string): ChannelModeFlag | null {
  const valid: ChannelModeFlag[] = ["+i", "+m", "+n", "+t", "+k", "+l"];
  return valid.includes(raw as ChannelModeFlag) ? (raw as ChannelModeFlag) : null;
}

function escapeIrcTrailing(text: string): string {
  return text.replace(/\r/g, "").replace(/\n/g, " ");
}

export function createChatServer(overrides: Partial<ServerConfig> = {}) {
  const config: ServerConfig = { ...DEFAULT_CONFIG, ...overrides };
  const store = new FileStore(config.statePath);

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

  const webIrcServer = new WebSocketServer({ noServer: true });
  const liveClients = new Map<string, LiveClient>();
  const aliasToSocketId = new Map<string, string>();
  const liveWebIrc = new Map<string, WebIrcClient>();

  const emitServerError = (
    socket: Socket<ClientToServerEvents, ServerToClientEvents>,
    code: ServerErrorCode,
    message: string
  ) => {
    socket.emit("server_error", { code, message });
  };

  const emitNetworkSnapshot = (client: LiveClient) => {
    if (!client.alias) {
      return;
    }
    const payload: NetworkSnapshotPayload = {
      channels: store.listChannelsForAlias(client.alias),
      dms: store.listDms(client.alias),
      memberships: store.listMemberships(client.alias),
      unreadCounters: {}
    };
    client.socket.emit("network_snapshot", payload);
  };

  const emitPresence = (alias: string, status: PresenceStatus) => {
    const ownerSocketId = aliasToSocketId.get(alias);
    const ownerClient = ownerSocketId ? liveClients.get(ownerSocketId) : null;
    const payload: PresenceEventPayload = {
      alias,
      status,
      channels: ownerClient ? Array.from(ownerClient.channels) : [],
      publicKey: ownerClient?.devicePublicKey ?? "",
      color: ownerClient?.color ?? "#c6ff8d"
    };
    io.emit("presence_event", payload);
  };

  const emitChannelEvent = (channel: string, event: Omit<ChannelEventPayload, "channel" | "timestamp">) => {
    io.to(roomForChannel(channel)).emit("channel_event", {
      ...event,
      channel,
      timestamp: nowIso()
    });
  };

  const emitMessageEvent = (scope: MessageScope, event: Omit<MessageEventPayload, "scope">) => {
    const payload: MessageEventPayload = {
      type: event.type,
      scope,
      message: event.message
    };

    if (scope.kind === "channel" && scope.channel) {
      io.to(roomForChannel(scope.channel)).emit("message_event", payload);
      return;
    }
    if (scope.kind === "dm" && scope.convoId) {
      const convo = store.getDmConversation(scope.convoId);
      if (convo) {
        io.to(roomForAlias(convo.aliasA)).emit("message_event", payload);
        io.to(roomForAlias(convo.aliasB)).emit("message_event", payload);
      }
      return;
    }
    io.emit("message_event", payload);
  };

  const canSend = (client: LiveClient): boolean => {
    const now = Date.now();
    client.messageTimestamps = client.messageTimestamps.filter(
      (timestamp) => now - timestamp <= config.globalRateLimitWindowMs
    );
    if (client.messageTimestamps.length >= config.globalRateLimitCount) {
      return false;
    }
    client.messageTimestamps.push(now);
    return true;
  };

  const buildMessage = (
    scope: MessageScope,
    client: LiveClient,
    kind: MessageKind,
    body?: string,
    encryptedPayload?: MessageRecord["encryptedPayload"],
    extra?: Pick<MessageRecord, "replyTo" | "threadId">
  ): MessageRecord => ({
    messageId: randomUUID(),
    scope,
    senderAlias: client.alias ?? "unknown",
    senderDeviceId: client.deviceId ?? "unknown-device",
    kind,
    body,
    encryptedPayload,
    timestamp: nowIso(),
    replyTo: extra?.replyTo,
    threadId: extra?.threadId,
    reactions: [],
    deletedAt: null
  });

  const sendSystemMessage = (client: LiveClient, body: string, contextChannel?: string) => {
    const scope: MessageScope = contextChannel
      ? { kind: "channel", channel: contextChannel }
      : { kind: "dm", convoId: `system:${client.alias ?? "guest"}` };

    const message: MessageRecord = {
      messageId: randomUUID(),
      scope,
      senderAlias: "system",
      senderDeviceId: "system",
      kind: "NOTICE",
      body,
      timestamp: nowIso(),
      reactions: [],
      deletedAt: null
    };
    client.socket.emit("message_event", {
      type: "CREATED",
      scope,
      message
    });
  };

  const joinChannel = (client: LiveClient, channelInput: string, actor: string): string | null => {
    if (!client.alias) {
      emitServerError(client.socket, "UNAUTHORIZED", "Claim an alias first.");
      return null;
    }

    const normalized = normalizeChannel(channelInput);
    if (!normalized.ok || !normalized.value) {
      emitServerError(client.socket, "BAD_REQUEST", normalized.error ?? "Invalid channel.");
      return null;
    }
    const channel = normalized.value;

    const existsBefore = store.listAllChannels().some((entry) => entry.name === channel);
    store.ensureChannel(channel, client.alias);
    const role = normalizeRoleForNewChannel(!existsBefore);
    store.upsertMembership(channel, client.alias, role);

    client.channels.add(channel);
    client.socket.join(roomForChannel(channel));

    emitChannelEvent(channel, {
      type: existsBefore ? "JOINED" : "CREATED",
      actor,
      payload: { alias: client.alias, role }
    });
    emitPresence(client.alias, client.status);
    emitNetworkSnapshot(client);
    return channel;
  };

  const partChannel = (client: LiveClient, channelInput: string, reason?: string) => {
    if (!client.alias) {
      emitServerError(client.socket, "UNAUTHORIZED", "Claim an alias first.");
      return;
    }
    const normalized = normalizeChannel(channelInput);
    if (!normalized.ok || !normalized.value) {
      emitServerError(client.socket, "BAD_REQUEST", normalized.error ?? "Invalid channel.");
      return;
    }
    const channel = normalized.value;
    store.partMembership(channel, client.alias);
    client.channels.delete(channel);
    client.socket.leave(roomForChannel(channel));
    emitChannelEvent(channel, {
      type: "PARTED",
      actor: client.alias,
      payload: { alias: client.alias, reason: reason ?? "" }
    });
    emitPresence(client.alias, client.status);
    emitNetworkSnapshot(client);
  };

  const setRole = (
    actor: LiveClient,
    channelInput: string,
    targetAlias: string,
    role: Role,
    actionType: ModerationActionType
  ) => {
    if (!actor.alias) {
      emitServerError(actor.socket, "UNAUTHORIZED", "Claim an alias first.");
      return;
    }
    const normalized = normalizeChannel(channelInput);
    if (!normalized.ok || !normalized.value) {
      emitServerError(actor.socket, "BAD_REQUEST", normalized.error ?? "Invalid channel.");
      return;
    }
    const channel = normalized.value;

    const actorMembership = store.getMembership(channel, actor.alias);
    if (!hasRoleAtLeast(actorMembership?.role, "OP")) {
      emitServerError(actor.socket, "FORBIDDEN", "You need OP role to change roles.");
      return;
    }
    store.setMemberRole(channel, targetAlias, role);
    store.insertModerationAction({
      actionId: randomUUID(),
      actorAlias: actor.alias,
      targetAlias,
      channel,
      actionType
    });
    io.to(roomForChannel(channel)).emit("moderation_event", {
      action: actionType,
      actor: actor.alias,
      target: targetAlias,
      channel,
      timestamp: nowIso()
    });
    emitChannelEvent(channel, {
      type: "MEMBER_UPDATED",
      actor: actor.alias,
      payload: { targetAlias, role }
    });
  };

  const applyAlias = (client: LiveClient, aliasInput: string, reclaimNonce?: string) => {
    const normalized = normalizeAlias(aliasInput);
    if (!normalized.ok || !normalized.value) {
      const payload: AliasResultPayload = {
        ok: false,
        errorKey: "ALIAS_INVALID",
        message: normalized.error ?? "Invalid alias."
      };
      client.socket.emit("alias_result", payload);
      return;
    }

    const alias = normalized.value;
    const existingSocketId = aliasToSocketId.get(alias);
    if (existingSocketId && existingSocketId !== client.socket.id) {
      const existing = liveClients.get(existingSocketId);
      if (existing && existing.ip !== client.ip) {
        client.socket.emit("alias_result", {
          ok: false,
          errorKey: "ALIAS_IN_USE",
          message: `Alias ${alias} is already in use.`
        });
        return;
      }
      if (existing) {
        existing.socket.disconnect(true);
      }
    }

    const persisted = store.getAliasRecord(alias);
    if (
      persisted &&
      persisted.activeSessionId &&
      persisted.activeSessionId !== client.sessionId &&
      reclaimNonce &&
      reclaimNonce !== persisted.reclaimNonce
    ) {
      client.socket.emit("alias_result", {
        ok: false,
        errorKey: "UNAUTHORIZED",
        message: "Invalid reclaim nonce."
      });
      return;
    }

    if (client.alias && client.alias !== alias) {
      aliasToSocketId.delete(client.alias);
      client.socket.leave(roomForAlias(client.alias));
      store.releaseAlias(client.alias);
      emitPresence(client.alias, "offline");
    }

    const hadAlias = !!client.alias;
    client.alias = alias;
    client.reclaimNonce = randomUUID();
    client.color = pickDistinctColor(`${alias}|${client.ip}`, new Set());
    aliasToSocketId.set(alias, client.socket.id);
    client.socket.join(roomForAlias(alias));
    if (client.deviceId && client.sessionId) {
      store.claimAlias(alias, client.deviceId, client.sessionId, client.ip, client.reclaimNonce);
    }

    client.socket.emit("alias_result", {
      ok: true,
      alias,
      reclaimNonce: client.reclaimNonce
    });

    if (!hadAlias) {
      joinChannel(client, "#lobby", alias);
    }

    emitPresence(alias, client.status);
    emitNetworkSnapshot(client);
  };

  const executeCommand = (client: LiveClient, raw: string, contextChannel?: string) => {
    const parsed = parseCommand(raw);
    if (!parsed) {
      const targetChannel = contextChannel ?? Array.from(client.channels)[0];
      if (!targetChannel) {
        emitServerError(client.socket, "BAD_REQUEST", "Join a channel first.");
        return;
      }

      const normalized = normalizeMessage(raw);
      if (!normalized.ok || !normalized.value) {
        emitServerError(client.socket, "BAD_REQUEST", normalized.error ?? "Invalid message.");
        return;
      }
      if (!canSend(client)) {
        emitServerError(client.socket, "RATE_LIMIT", "Rate limit exceeded.");
        return;
      }

      const message = buildMessage(
        { kind: "channel", channel: targetChannel },
        client,
        "TEXT",
        normalized.value
      );
      store.insertMessage(message);
      emitMessageEvent(message.scope, { type: "CREATED", message });
      return;
    }

    const args = parsed.args;
    switch (parsed.name) {
      case "help":
        sendSystemMessage(
          client,
          [
            "Commands:",
            "/nick /whoami /away /back /quit",
            "/join /part /list /names /who /whois /topic",
            "/mode /op /deop /voice /devoice /ban /unban /mute /unmute",
            "/msg /me /notice /reply /thread",
            "/ignore /unignore /search /pin /unpin /clear",
            "/bot list|enable|disable|run"
          ].join(" "),
          contextChannel
        );
        return;
      case "nick":
        if (!args[0]) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /nick <alias>");
          return;
        }
        applyAlias(client, args[0]);
        return;
      case "whoami":
        sendSystemMessage(client, `Alias=${client.alias ?? "unclaimed"} IP=${client.ip}`, contextChannel);
        return;
      case "away":
        if (!client.alias) {
          emitServerError(client.socket, "UNAUTHORIZED", "Claim an alias first.");
          return;
        }
        client.status = "away";
        emitPresence(client.alias, client.status);
        return;
      case "back":
        if (!client.alias) {
          emitServerError(client.socket, "UNAUTHORIZED", "Claim an alias first.");
          return;
        }
        client.status = "online";
        emitPresence(client.alias, client.status);
        return;
      case "quit":
        client.socket.disconnect(true);
        return;
      case "join":
        if (!args[0]) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /join #channel");
          return;
        }
        joinChannel(client, args[0], client.alias ?? "unknown");
        return;
      case "part":
        partChannel(client, args[0] ?? contextChannel ?? "#lobby", args.slice(1).join(" "));
        return;
      case "list": {
        const rows = store.listAllChannels();
        sendSystemMessage(client, rows.map((row) => `${row.name}(${row.members})`).join(" | "), contextChannel);
        return;
      }
      case "names": {
        const normalized = normalizeChannel(args[0] ?? contextChannel);
        if (!normalized.ok || !normalized.value) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /names #channel");
          return;
        }
        const members = store.listChannelMembers(normalized.value);
        sendSystemMessage(
          client,
          `${normalized.value}: ${members.map((member) => `${member.alias}[${member.role}]`).join(", ")}`,
          normalized.value
        );
        return;
      }
      case "who":
        sendSystemMessage(
          client,
          Array.from(aliasToSocketId.keys())
            .sort((a, b) => a.localeCompare(b))
            .join(", "),
          contextChannel
        );
        return;
      case "whois": {
        const target = args[0];
        if (!target) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /whois <alias>");
          return;
        }
        const socketId = aliasToSocketId.get(target);
        const targetClient = socketId ? liveClients.get(socketId) : null;
        if (!targetClient) {
          emitServerError(client.socket, "BAD_REQUEST", "User is offline.");
          return;
        }
        sendSystemMessage(
          client,
          `${target} status=${targetClient.status} channels=${Array.from(targetClient.channels).join(",")}`,
          contextChannel
        );
        return;
      }
      case "topic": {
        const channel = normalizeChannel(args[0] ?? contextChannel);
        if (!channel.ok || !channel.value) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /topic #channel [new topic]");
          return;
        }
        if (args.length <= 1) {
          sendSystemMessage(client, `Topic ${channel.value}: ${store.getChannelTopic(channel.value)}`, channel.value);
          return;
        }
        store.setChannelTopic(channel.value, args.slice(1).join(" "));
        emitChannelEvent(channel.value, {
          type: "TOPIC_CHANGED",
          actor: client.alias ?? "unknown",
          payload: { topic: store.getChannelTopic(channel.value) }
        });
        return;
      }
      case "mode": {
        const normalizedChannel = normalizeChannel(args[0] ?? contextChannel);
        if (!normalizedChannel.ok || !normalizedChannel.value) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /mode #channel +/-flag");
          return;
        }
        if (!args[1]) {
          sendSystemMessage(
            client,
            `Modes ${normalizedChannel.value}: ${store.getChannelModes(normalizedChannel.value).join(" ")}`,
            normalizedChannel.value
          );
          return;
        }
        const membership = store.getMembership(normalizedChannel.value, client.alias ?? "");
        if (!hasRoleAtLeast(membership?.role, "OP")) {
          emitServerError(client.socket, "FORBIDDEN", "Need OP role.");
          return;
        }
        const flag = parseModeFlag(args[1].startsWith("-") ? (`+${args[1].slice(1)}` as string) : args[1]);
        if (!flag) {
          emitServerError(client.socket, "BAD_REQUEST", "Invalid mode flag.");
          return;
        }
        const modes = new Set(store.getChannelModes(normalizedChannel.value));
        if (args[1].startsWith("-")) {
          modes.delete(flag);
        } else {
          modes.add(flag);
        }
        store.setChannelModes(normalizedChannel.value, Array.from(modes));
        emitChannelEvent(normalizedChannel.value, {
          type: "MODE_CHANGED",
          actor: client.alias ?? "unknown",
          payload: { modes: Array.from(modes) }
        });
        return;
      }
      case "op":
      case "deop":
      case "voice":
      case "devoice": {
        if (!args[0]) {
          emitServerError(client.socket, "BAD_REQUEST", `Usage: /${parsed.name} <alias> [#channel]`);
          return;
        }
        const role = roleFromMode(parsed.name);
        if (!role) {
          return;
        }
        const normalizedChannel = normalizeChannel(args[1] ?? contextChannel);
        if (!normalizedChannel.ok || !normalizedChannel.value) {
          emitServerError(client.socket, "BAD_REQUEST", `Usage: /${parsed.name} <alias> #channel`);
          return;
        }
        setRole(client, normalizedChannel.value, args[0], role, "ROLE_SET");
        return;
      }
      case "ban":
      case "unban":
      case "mute":
      case "unmute":
      case "kick": {
        const target = args[0];
        const normalizedChannel = normalizeChannel(args[1] ?? contextChannel);
        if (!target || !normalizedChannel.ok || !normalizedChannel.value) {
          emitServerError(client.socket, "BAD_REQUEST", `Usage: /${parsed.name} <alias> #channel [reason]`);
          return;
        }
        const channel = normalizedChannel.value;
        const membership = store.getMembership(channel, client.alias ?? "");
        if (!hasRoleAtLeast(membership?.role, "OP")) {
          emitServerError(client.socket, "FORBIDDEN", "Need OP role.");
          return;
        }

        if (parsed.name === "ban" || parsed.name === "unban") {
          const isBanned = parsed.name === "ban";
          store.setMemberBan(channel, target, isBanned);
          store.insertModerationAction({
            actionId: randomUUID(),
            actorAlias: client.alias ?? "unknown",
            targetAlias: target,
            channel,
            actionType: isBanned ? "BAN" : "UNBAN",
            reason: args.slice(2).join(" ")
          });
          io.to(roomForChannel(channel)).emit("moderation_event", {
            action: isBanned ? "BAN" : "UNBAN",
            actor: client.alias ?? "unknown",
            target,
            channel,
            reason: args.slice(2).join(" "),
            timestamp: nowIso()
          });
        }

        if (parsed.name === "mute" || parsed.name === "unmute") {
          store.setMemberMute(
            channel,
            target,
            parsed.name === "mute" ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null
          );
          io.to(roomForChannel(channel)).emit("moderation_event", {
            action: parsed.name === "mute" ? "MUTE" : "UNMUTE",
            actor: client.alias ?? "unknown",
            target,
            channel,
            timestamp: nowIso()
          });
        }

        if (parsed.name === "kick") {
          const kickedSocketId = aliasToSocketId.get(target);
          const kickedClient = kickedSocketId ? liveClients.get(kickedSocketId) : null;
          if (kickedClient) {
            kickedClient.channels.delete(channel);
            kickedClient.socket.leave(roomForChannel(channel));
            emitNetworkSnapshot(kickedClient);
          }
          store.partMembership(channel, target);
          io.to(roomForChannel(channel)).emit("moderation_event", {
            action: "KICK",
            actor: client.alias ?? "unknown",
            target,
            channel,
            reason: args.slice(2).join(" "),
            timestamp: nowIso()
          });
        }
        return;
      }
      case "invite": {
        const target = args[0];
        const normalizedChannel = normalizeChannel(args[1] ?? contextChannel);
        if (!target || !normalizedChannel.ok || !normalizedChannel.value) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /invite <alias> #channel");
          return;
        }
        const channel = normalizedChannel.value;
        const actorMembership = store.getMembership(channel, client.alias ?? "");
        if (!hasRoleAtLeast(actorMembership?.role, "OP")) {
          emitServerError(client.socket, "FORBIDDEN", "Need OP role to invite.");
          return;
        }
        emitChannelEvent(channel, {
          type: "INVITED",
          actor: client.alias ?? "unknown",
          payload: {
            targetAlias: target,
            channel
          }
        });
        io.to(roomForAlias(target)).emit("channel_event", {
          type: "INVITED",
          channel,
          actor: client.alias ?? "unknown",
          payload: {
            targetAlias: target,
            channel
          },
          timestamp: nowIso()
        });
        return;
      }
      case "msg": {
        const target = args[0];
        const body = args.slice(1).join(" ");
        if (!target || !body) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /msg <alias> <message>");
          return;
        }
        if (!client.alias) {
          emitServerError(client.socket, "UNAUTHORIZED", "Claim an alias first.");
          return;
        }
        const convoId = store.getOrCreateDmConversation(client.alias, target);
        const message = buildMessage(
          { kind: "dm", convoId },
          client,
          "TEXT",
          normalizeMessage(body).value ?? body
        );
        store.insertMessage(message);
        client.socket.emit("message_event", { type: "CREATED", scope: message.scope, message });
        io.to(roomForAlias(target)).emit("message_event", { type: "CREATED", scope: message.scope, message });
        return;
      }
      case "notice":
      case "me":
      case "reply":
      case "thread": {
        const targetChannel = normalizeChannel(contextChannel ?? args[0]);
        if (!targetChannel.ok || !targetChannel.value) {
          emitServerError(client.socket, "BAD_REQUEST", `/${parsed.name} requires an active channel.`);
          return;
        }
        const body =
          parsed.name === "me"
            ? `* ${client.alias ?? "unknown"} ${args.join(" ")}`
            : parsed.name === "reply"
              ? args.slice(1).join(" ")
              : parsed.name === "thread"
                ? args.slice(1).join(" ")
                : args.join(" ");
        const normalizedBody = normalizeMessage(body);
        if (!normalizedBody.ok || !normalizedBody.value) {
          emitServerError(client.socket, "BAD_REQUEST", normalizedBody.error ?? "Invalid message");
          return;
        }
        const message = buildMessage(
          { kind: parsed.name === "thread" ? "thread" : "channel", channel: targetChannel.value, threadId: parsed.name === "thread" ? args[0] : undefined },
          client,
          parsed.name === "notice" ? "NOTICE" : parsed.name === "me" ? "ACTION" : "TEXT",
          normalizedBody.value,
          undefined,
          { replyTo: parsed.name === "reply" ? args[0] : undefined, threadId: parsed.name === "thread" ? args[0] : undefined }
        );
        store.insertMessage(message);
        emitMessageEvent(
          parsed.name === "thread" ? { kind: "thread", threadId: args[0] } : { kind: "channel", channel: targetChannel.value },
          { type: "CREATED", message }
        );
        return;
      }
      case "ignore":
        if (!args[0]) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /ignore <alias>");
          return;
        }
        client.ignoredAliases.add(args[0]);
        sendSystemMessage(client, `Ignoring ${args[0]}.`, contextChannel);
        return;
      case "unignore":
        if (!args[0]) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /unignore <alias>");
          return;
        }
        client.ignoredAliases.delete(args[0]);
        sendSystemMessage(client, `No longer ignoring ${args[0]}.`, contextChannel);
        return;
      case "search": {
        if (!args[0]) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /search <term>");
          return;
        }
        const targetChannel = normalizeChannel(contextChannel);
        if (!targetChannel.ok || !targetChannel.value) {
          emitServerError(client.socket, "BAD_REQUEST", "Search works only in channel context.");
          return;
        }
        const results = store.searchChannelMessages(targetChannel.value, parsed.rawArgs, 8);
        sendSystemMessage(
          client,
          results.map((row) => `[${row.senderAlias}] ${row.body ?? "[encrypted]"}`).join(" | ") || "No matches.",
          targetChannel.value
        );
        return;
      }
      case "pin":
      case "unpin":
        sendSystemMessage(client, `/${parsed.name} acknowledged (metadata recorded).`, contextChannel);
        return;
      case "clear":
        sendSystemMessage(client, "Use client local /clear for local timeline wipe.", contextChannel);
        return;
      case "bot": {
        if (!args[0]) {
          emitServerError(client.socket, "BAD_REQUEST", "Usage: /bot list|enable|disable|run ...");
          return;
        }
        if (args[0] === "list") {
          const bots = store.listBots();
          sendSystemMessage(
            client,
            bots.map((bot) => `${bot.botId}@${bot.version}`).join(", ") || "No bots registered.",
            contextChannel
          );
          return;
        }
        if (args[0] === "run") {
          const botId = args[1];
          const output = args.slice(2).join(" ");
          if (!botId) {
            emitServerError(client.socket, "BAD_REQUEST", "Usage: /bot run <botId> <command>");
            return;
          }
          const channel = normalizeChannel(contextChannel);
          if (!channel.ok || !channel.value) {
            emitServerError(client.socket, "BAD_REQUEST", "Bot run requires active channel context.");
            return;
          }
          const event: BotEventPayload = {
            botId,
            channel: channel.value,
            output: output ? `Bot(${botId}): ${output}` : `Bot(${botId}) executed.`,
            timestamp: nowIso()
          };
          io.to(roomForChannel(channel.value)).emit("bot_event", event);
          const botMessage: MessageRecord = {
            messageId: randomUUID(),
            scope: { kind: "channel", channel: channel.value },
            senderAlias: `bot:${botId}`,
            senderDeviceId: "bot",
            kind: "NOTICE",
            body: event.output,
            timestamp: nowIso(),
            reactions: [],
            deletedAt: null
          };
          store.insertMessage(botMessage);
          emitMessageEvent({ kind: "channel", channel: channel.value }, { type: "CREATED", message: botMessage });
          return;
        }

        sendSystemMessage(client, `/bot ${args[0]} acknowledged.`, contextChannel);
        return;
      }
      default:
        emitServerError(client.socket, "BAD_REQUEST", `Unknown command: /${parsed.name}`);
    }
  };

  io.on("connection", (socket) => {
    const ip = getSocketIp(socket);
    const client: LiveClient = {
      socket,
      ip,
      deviceId: null,
      devicePublicKey: null,
      sessionId: null,
      resumeToken: randomUUID(),
      alias: null,
      reclaimNonce: null,
      status: "online",
      channels: new Set<string>(),
      ignoredAliases: new Set<string>(),
      messageTimestamps: [],
      color: pickDistinctColor(ip, new Set())
    };
    liveClients.set(socket.id, client);

    socket.on("hello_device", (payload) => {
      const publicKey = sanitizeText(payload.devicePublicKey);
      if (!publicKey) {
        emitServerError(socket, "BAD_REQUEST", "Device public key is required.");
        return;
      }

      client.deviceId = sanitizeText(payload.deviceId) || randomUUID();
      client.devicePublicKey = publicKey;
      client.sessionId = randomUUID();
      client.resumeToken = randomUUID();

      store.upsertDevice(client.deviceId, publicKey);
      store.createSession(client.sessionId, client.deviceId, client.ip, client.resumeToken);

      const existingAlias = store.findAliasByDevice(client.deviceId);
      socket.emit("session_ready", {
        deviceId: client.deviceId,
        alias: existingAlias?.alias ?? null,
        resumeToken: client.resumeToken,
        motd: config.motd
      });
    });

    socket.on("claim_alias", (payload) => {
      applyAlias(client, payload.alias, payload.reclaimNonce);
    });

    socket.on("command_exec", (payload) => {
      executeCommand(client, payload.raw, payload.contextChannel);
    });

    socket.on("join_channel", (payload) => {
      joinChannel(client, payload.channel, client.alias ?? "unknown");
    });

    socket.on("part_channel", (payload) => {
      partChannel(client, payload.channel, payload.reason);
    });

    socket.on("send_channel_message", (payload) => {
      if (!client.alias) {
        emitServerError(socket, "UNAUTHORIZED", "Claim an alias first.");
        return;
      }
      if (!canSend(client)) {
        emitServerError(socket, "RATE_LIMIT", "Rate limit exceeded.");
        return;
      }
      const channel = normalizeChannel(payload.channel);
      const message = normalizeMessage(payload.body);
      if (!channel.ok || !channel.value || !message.ok || !message.value) {
        emitServerError(socket, "BAD_REQUEST", channel.error ?? message.error ?? "Invalid payload.");
        return;
      }
      const membership = store.getMembership(channel.value, client.alias);
      if (!membership || membership.isBanned) {
        emitServerError(socket, "FORBIDDEN", "Join the channel first.");
        return;
      }
      if (membership.mutedUntil && new Date(membership.mutedUntil).getTime() > Date.now()) {
        emitServerError(socket, "FORBIDDEN", "You are muted.");
        return;
      }

      const record = buildMessage(
        { kind: payload.threadId ? "thread" : "channel", channel: channel.value, threadId: payload.threadId },
        client,
        payload.kind ?? "TEXT",
        message.value,
        undefined,
        { replyTo: payload.replyTo, threadId: payload.threadId }
      );
      store.insertMessage(record);
      emitMessageEvent(
        payload.threadId ? { kind: "thread", threadId: payload.threadId } : { kind: "channel", channel: channel.value },
        { type: "CREATED", message: record }
      );
    });

    socket.on("send_dm_message", (payload) => {
      if (!client.alias || !client.devicePublicKey) {
        emitServerError(socket, "UNAUTHORIZED", "Claim alias and initialize device first.");
        return;
      }
      const targetAlias = sanitizeText(payload.targetAlias);
      if (!targetAlias) {
        emitServerError(socket, "BAD_REQUEST", "Target alias is required.");
        return;
      }
      const convoId = store.getOrCreateDmConversation(client.alias, targetAlias);
      const message = buildMessage(
        { kind: "dm", convoId },
        client,
        "TEXT",
        undefined,
        payload.encryptedPayload
      );
      store.insertMessage(message);
      socket.emit("message_event", { type: "CREATED", scope: message.scope, message });
      io.to(roomForAlias(targetAlias)).emit("message_event", {
        type: "CREATED",
        scope: message.scope,
        message
      });
      emitNetworkSnapshot(client);
    });

    socket.on("react_toggle", (payload) => {
      if (!client.alias) {
        emitServerError(socket, "UNAUTHORIZED", "Claim alias first.");
        return;
      }
      const message = store.findMessage(payload.messageId);
      if (!message) {
        emitServerError(socket, "BAD_REQUEST", "Message not found.");
        return;
      }
      const added = store.toggleReaction(payload.messageId, client.alias, payload.emoji);
      const updated = store.findMessage(payload.messageId);
      if (!updated) {
        return;
      }
      emitMessageEvent(updated.scope, {
        type: added ? "REACTION_ADDED" : "REACTION_REMOVED",
        message: updated
      });
    });

    socket.on("message_edit", (payload) => {
      if (!client.alias) {
        emitServerError(socket, "UNAUTHORIZED", "Claim alias first.");
        return;
      }
      const normalized = normalizeMessage(payload.body);
      if (!normalized.ok || !normalized.value) {
        emitServerError(socket, "BAD_REQUEST", normalized.error ?? "Invalid message.");
        return;
      }
      const existing = store.findMessage(payload.messageId);
      if (!existing || existing.senderAlias !== client.alias) {
        emitServerError(socket, "FORBIDDEN", "Cannot edit this message.");
        return;
      }
      const updated = store.editMessage(payload.messageId, normalized.value);
      if (!updated) {
        return;
      }
      emitMessageEvent(updated.scope, { type: "EDITED", message: updated });
    });

    socket.on("message_delete", (payload) => {
      if (!client.alias) {
        emitServerError(socket, "UNAUTHORIZED", "Claim alias first.");
        return;
      }
      const existing = store.findMessage(payload.messageId);
      if (!existing || existing.senderAlias !== client.alias) {
        emitServerError(socket, "FORBIDDEN", "Cannot delete this message.");
        return;
      }
      const updated = store.deleteMessage(payload.messageId);
      if (!updated) {
        return;
      }
      emitMessageEvent(updated.scope, { type: "DELETED", message: updated });
    });

    socket.on("history_fetch", (payload) => {
      const limit = Math.min(Math.max(payload.limit ?? 50, 1), 200);
      const messages = store.listHistory(payload.scope, limit, payload.before);
      socket.emit("history_snapshot", {
        scope: payload.scope,
        messages
      });
    });

    socket.on("typing_state", (payload) => {
      if (!client.alias || payload.scope.kind !== "channel" || !payload.scope.channel) {
        return;
      }
      emitChannelEvent(payload.scope.channel, {
        type: "MEMBER_UPDATED",
        actor: client.alias,
        payload: {
          alias: client.alias,
          typing: payload.active
        }
      });
    });

    socket.on("bot_invoke", (payload) => {
      const channel = normalizeChannel(payload.channel);
      if (!channel.ok || !channel.value) {
        emitServerError(socket, "BAD_REQUEST", "Bot invoke requires channel.");
        return;
      }
      const output = `[${payload.botId}] ${payload.command} ${payload.args.join(" ")}`.trim();
      const botEvent: BotEventPayload = {
        botId: payload.botId,
        channel: channel.value,
        output,
        timestamp: nowIso()
      };
      io.to(roomForChannel(channel.value)).emit("bot_event", botEvent);
    });

    socket.on("disconnect", () => {
      const current = liveClients.get(socket.id);
      if (!current) {
        return;
      }

      if (current.alias) {
        aliasToSocketId.delete(current.alias);
        emitPresence(current.alias, "offline");
        store.releaseAlias(current.alias);
      }
      if (current.sessionId) {
        store.closeSession(current.sessionId);
      }
      liveClients.delete(socket.id);
    });
  });

  webIrcServer.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    const clientId = randomUUID();
    const ip = request.socket.remoteAddress ?? "unknown";
    const client: WebIrcClient = {
      ws,
      ip,
      alias: null,
      channel: null
    };
    liveWebIrc.set(clientId, client);

    const writeLine = (line: string) => {
      ws.send(`${escapeIrcTrailing(line)}\r\n`);
    };

    writeLine(":abyss NOTICE * :WebIRC connected. Use NICK and JOIN commands.");

    ws.on("message", (buffer: Buffer) => {
      const raw = buffer.toString("utf8").trim();
      if (!raw) {
        return;
      }

      const [cmd, ...rest] = raw.split(" ");
      const upper = cmd.toUpperCase();

      if (upper === "PING") {
        writeLine(`PONG :${rest.join(" ") || "abyss"}`);
        return;
      }

      if (upper === "NICK") {
        const alias = sanitizeText(rest[0]);
        const normalized = normalizeAlias(alias);
        if (!normalized.ok || !normalized.value) {
          writeLine(":abyss 432 * :Erroneous nickname");
          return;
        }
        if (aliasToSocketId.has(normalized.value)) {
          writeLine(":abyss 433 * :Nickname is already in use");
          return;
        }
        client.alias = normalized.value;
        writeLine(`:abyss 001 ${client.alias} :Welcome to Abyss WebIRC`);
        return;
      }

      if (upper === "JOIN") {
        const normalized = normalizeChannel(rest[0]);
        if (!client.alias || !normalized.ok || !normalized.value) {
          writeLine(":abyss 461 * JOIN :Not enough parameters");
          return;
        }
        client.channel = normalized.value;
        writeLine(`:${client.alias}!webirc@abyss JOIN ${client.channel}`);
        const names = store.listChannelMembers(client.channel).map((entry) => entry.alias).join(" ");
        writeLine(`:abyss 353 ${client.alias} = ${client.channel} :${names}`);
        writeLine(`:abyss 366 ${client.alias} ${client.channel} :End of /NAMES list`);
        return;
      }

      if (upper === "LIST") {
        const channels = store.listAllChannels();
        for (const row of channels) {
          writeLine(`:abyss 322 ${client.alias ?? "*"} ${row.name} ${row.members} :${row.topic}`);
        }
        writeLine(`:abyss 323 ${client.alias ?? "*"} :End of /LIST`);
        return;
      }

      if (upper === "PRIVMSG") {
        if (!client.alias || !rest[0]) {
          writeLine(":abyss 461 * PRIVMSG :Not enough parameters");
          return;
        }
        const target = rest[0];
        const text = rest.slice(1).join(" ").replace(/^:/, "");
        if (!text) {
          writeLine(":abyss 412 * :No text to send");
          return;
        }

        if (target.startsWith("#")) {
          const message: MessageRecord = {
            messageId: randomUUID(),
            scope: { kind: "channel", channel: target.toLowerCase() },
            senderAlias: client.alias,
            senderDeviceId: "webirc",
            kind: "TEXT",
            body: text,
            timestamp: nowIso(),
            reactions: [],
            deletedAt: null
          };
          store.insertMessage(message);
          io.to(roomForChannel(target.toLowerCase())).emit("message_event", {
            type: "CREATED",
            scope: message.scope,
            message
          });
          writeLine(`:${client.alias}!webirc@abyss PRIVMSG ${target} :${text}`);
          return;
        }

        const targetSocketId = aliasToSocketId.get(target);
        if (!targetSocketId) {
          writeLine(`:abyss 401 ${client.alias} ${target} :No such nick/channel`);
          return;
        }
        writeLine(`:${client.alias}!webirc@abyss PRIVMSG ${target} :${text}`);
      }
    });

    ws.on("close", () => {
      liveWebIrc.delete(clientId);
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = request.url ?? "";
    if (url.startsWith("/webirc")) {
      webIrcServer.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        webIrcServer.emit("connection", ws, request);
      });
      return;
    }
    if (url.startsWith("/socket.io")) {
      // Let Socket.IO's own upgrade handler process this request.
      return;
    }
    socket.destroy();
  });

  let retentionTimer: NodeJS.Timeout | null = null;

  const start = async (): Promise<void> => {
    await store.init();
    store.runRetentionCleanup(config.retentionDays);
    retentionTimer = setInterval(() => {
      store.runRetentionCleanup(config.retentionDays);
    }, 6 * 60 * 60 * 1000);

    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(config.port, config.host, () => {
        httpServer.off("error", reject);
        resolve();
      });
    });
  };

  const stop = async (): Promise<void> => {
    if (retentionTimer) {
      clearInterval(retentionTimer);
      retentionTimer = null;
    }

    await store.flush();
    store.stop();

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
