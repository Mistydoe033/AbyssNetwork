import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ChannelModeFlag,
  ChannelSummary,
  DmSummary,
  MembershipSummary,
  MessageKind,
  MessageRecord,
  MessageScope,
  MessageScopeKind,
  ModerationActionType,
  Role
} from "@abyss/irc-shared";

interface DeviceRecord {
  publicKey: string;
  createdAt: string;
  lastSeenAt: string;
}

interface AliasRecord {
  currentDeviceId: string;
  activeSessionId: string | null;
  lastIp: string;
  claimedAt: string;
  reclaimNonce: string;
}

interface SessionRecord {
  sessionId: string;
  deviceId: string;
  alias: string | null;
  ip: string;
  connectedAt: string;
  disconnectedAt: string | null;
  resumeToken: string;
}

interface ChannelRecord {
  channelId: string;
  name: string;
  topic: string;
  modes: ChannelModeFlag[];
  ownerAlias: string;
  createdAt: string;
}

interface ChannelMemberRecord {
  alias: string;
  role: Role;
  joinedAt: string;
  mutedUntil: string | null;
  isBanned: boolean;
}

interface DmConversationRecord {
  convoId: string;
  aliasA: string;
  aliasB: string;
  createdAt: string;
}

interface ModerationRecord {
  actionId: string;
  actorAlias: string;
  targetAlias: string;
  channel: string;
  actionType: ModerationActionType;
  reason?: string;
  createdAt: string;
}

interface BotRecord {
  botId: string;
  name: string;
  version: string;
  permissions: string[];
  enabledChannels: string[];
  createdAt: string;
}

interface AuditRecord {
  eventId: string;
  category: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface PersistedState {
  devices: Record<string, DeviceRecord>;
  aliases: Record<string, AliasRecord>;
  sessions: Record<string, SessionRecord>;
  channels: Record<string, ChannelRecord>;
  channelMembers: Record<string, Record<string, ChannelMemberRecord>>;
  dmConversations: Record<string, DmConversationRecord>;
  messages: MessageRecord[];
  moderationActions: ModerationRecord[];
  botApps: Record<string, BotRecord>;
  auditEvents: AuditRecord[];
}

const EMPTY_STATE: PersistedState = {
  devices: {},
  aliases: {},
  sessions: {},
  channels: {},
  channelMembers: {},
  dmConversations: {},
  messages: [],
  moderationActions: [],
  botApps: {},
  auditEvents: []
};

function nowIso(): string {
  return new Date().toISOString();
}

function buildScopeKey(scope: MessageScope): string {
  if (scope.kind === "channel") {
    return `channel:${scope.channel ?? ""}`;
  }
  if (scope.kind === "dm") {
    return `dm:${scope.convoId ?? ""}`;
  }
  return `thread:${scope.threadId ?? ""}`;
}

export class FileStore {
  private state: PersistedState = { ...EMPTY_STATE };
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;
      this.state = {
        ...EMPTY_STATE,
        ...parsed
      };
    } catch {
      this.state = { ...EMPTY_STATE };
      await this.flush();
    }

    if (Object.keys(this.state.botApps).length === 0) {
      this.state.botApps.echo = {
        botId: "echo",
        name: "EchoBot",
        version: "1.0.0",
        permissions: ["CHANNEL_WRITE"],
        enabledChannels: [],
        createdAt: nowIso()
      };
      this.markDirty();
    }
  }

  async flush(): Promise<void> {
    if (!this.dirty) {
      return;
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
    this.dirty = false;
  }

  stop(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  runRetentionCleanup(days: number): void {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let changed = false;
    this.state.messages = this.state.messages.map((message) => {
      if (!message.deletedAt && new Date(message.timestamp).getTime() < cutoff) {
        changed = true;
        return { ...message, deletedAt: nowIso() };
      }
      return message;
    });
    if (changed) {
      this.markDirty();
    }
  }

  upsertDevice(deviceId: string, publicKey: string): void {
    const existing = this.state.devices[deviceId];
    this.state.devices[deviceId] = {
      publicKey,
      createdAt: existing?.createdAt ?? nowIso(),
      lastSeenAt: nowIso()
    };
    this.markDirty();
  }

  createSession(sessionId: string, deviceId: string, ip: string, resumeToken: string): void {
    this.state.sessions[sessionId] = {
      sessionId,
      deviceId,
      alias: null,
      ip,
      connectedAt: nowIso(),
      disconnectedAt: null,
      resumeToken
    };
    this.markDirty();
  }

  closeSession(sessionId: string): void {
    const session = this.state.sessions[sessionId];
    if (!session) {
      return;
    }
    session.disconnectedAt = nowIso();
    this.markDirty();
  }

  claimAlias(alias: string, deviceId: string, sessionId: string, ip: string, reclaimNonce: string): void {
    this.state.aliases[alias] = {
      currentDeviceId: deviceId,
      activeSessionId: sessionId,
      lastIp: ip,
      claimedAt: nowIso(),
      reclaimNonce
    };
    const session = this.state.sessions[sessionId];
    if (session) {
      session.alias = alias;
    }
    this.markDirty();
  }

  releaseAlias(alias: string): void {
    const existing = this.state.aliases[alias];
    if (!existing) {
      return;
    }
    existing.activeSessionId = null;
    this.markDirty();
  }

  getAliasRecord(alias: string): AliasRecord | null {
    return this.state.aliases[alias] ?? null;
  }

  findAliasByDevice(deviceId: string): { alias: string; reclaimNonce: string } | null {
    for (const [alias, record] of Object.entries(this.state.aliases)) {
      if (record.currentDeviceId === deviceId) {
        return { alias, reclaimNonce: record.reclaimNonce };
      }
    }
    return null;
  }

  getDevicePublicKey(deviceId: string): string | null {
    return this.state.devices[deviceId]?.publicKey ?? null;
  }

  ensureChannel(channel: string, ownerAlias: string): void {
    if (this.state.channels[channel]) {
      return;
    }
    this.state.channels[channel] = {
      channelId: `${channel}:${Date.now()}`,
      name: channel,
      topic: "",
      modes: [],
      ownerAlias,
      createdAt: nowIso()
    };
    if (!this.state.channelMembers[channel]) {
      this.state.channelMembers[channel] = {};
    }
    this.markDirty();
  }

  getChannelTopic(channel: string): string {
    return this.state.channels[channel]?.topic ?? "";
  }

  setChannelTopic(channel: string, topic: string): void {
    if (!this.state.channels[channel]) {
      return;
    }
    this.state.channels[channel].topic = topic;
    this.markDirty();
  }

  getChannelModes(channel: string): ChannelModeFlag[] {
    return this.state.channels[channel]?.modes ?? [];
  }

  setChannelModes(channel: string, modes: ChannelModeFlag[]): void {
    if (!this.state.channels[channel]) {
      return;
    }
    this.state.channels[channel].modes = modes;
    this.markDirty();
  }

  upsertMembership(channel: string, alias: string, role: Role): void {
    if (!this.state.channelMembers[channel]) {
      this.state.channelMembers[channel] = {};
    }
    const existing = this.state.channelMembers[channel][alias];
    this.state.channelMembers[channel][alias] = {
      alias,
      role,
      joinedAt: existing?.joinedAt ?? nowIso(),
      mutedUntil: existing?.mutedUntil ?? null,
      isBanned: false
    };
    this.markDirty();
  }

  partMembership(channel: string, alias: string): void {
    if (!this.state.channelMembers[channel]?.[alias]) {
      return;
    }
    delete this.state.channelMembers[channel][alias];
    this.markDirty();
  }

  setMemberRole(channel: string, alias: string, role: Role): void {
    const member = this.state.channelMembers[channel]?.[alias];
    if (!member) {
      return;
    }
    member.role = role;
    this.markDirty();
  }

  setMemberMute(channel: string, alias: string, mutedUntil: string | null): void {
    const member = this.state.channelMembers[channel]?.[alias];
    if (!member) {
      return;
    }
    member.mutedUntil = mutedUntil;
    this.markDirty();
  }

  setMemberBan(channel: string, alias: string, isBanned: boolean): void {
    if (!this.state.channelMembers[channel]) {
      this.state.channelMembers[channel] = {};
    }
    const member = this.state.channelMembers[channel][alias] ?? {
      alias,
      role: "MEMBER" as Role,
      joinedAt: nowIso(),
      mutedUntil: null,
      isBanned
    };
    member.isBanned = isBanned;
    this.state.channelMembers[channel][alias] = member;
    this.markDirty();
  }

  getMembership(channel: string, alias: string): MembershipSummary | null {
    const member = this.state.channelMembers[channel]?.[alias];
    if (!member) {
      return null;
    }
    return {
      channel,
      alias,
      role: member.role,
      mutedUntil: member.mutedUntil,
      isBanned: member.isBanned
    };
  }

  listMemberships(alias: string): MembershipSummary[] {
    const out: MembershipSummary[] = [];
    for (const [channel, members] of Object.entries(this.state.channelMembers)) {
      const member = members[alias];
      if (!member || member.isBanned) {
        continue;
      }
      out.push({
        channel,
        alias,
        role: member.role,
        mutedUntil: member.mutedUntil,
        isBanned: member.isBanned
      });
    }
    return out.sort((a, b) => a.channel.localeCompare(b.channel));
  }

  listChannelMembers(channel: string): Array<{ alias: string; role: Role }> {
    const members = Object.values(this.state.channelMembers[channel] ?? {})
      .filter((member) => !member.isBanned)
      .map((member) => ({ alias: member.alias, role: member.role }));
    members.sort((a, b) => a.alias.localeCompare(b.alias));
    return members;
  }

  listChannelsForAlias(alias: string): ChannelSummary[] {
    return this.listMemberships(alias).map((membership) => {
      const channel = this.state.channels[membership.channel];
      const members = this.listChannelMembers(membership.channel);
      return {
        channel: membership.channel,
        topic: channel?.topic ?? "",
        modes: channel?.modes ?? [],
        memberCount: members.length,
        unread: 0
      };
    });
  }

  listAllChannels(): Array<{ name: string; topic: string; members: number }> {
    return Object.keys(this.state.channels)
      .sort((a, b) => a.localeCompare(b))
      .map((channel) => ({
        name: channel,
        topic: this.state.channels[channel].topic,
        members: this.listChannelMembers(channel).length
      }));
  }

  getOrCreateDmConversation(aliasA: string, aliasB: string): string {
    const sorted = [aliasA, aliasB].sort((a, b) => a.localeCompare(b));
    const existing = Object.values(this.state.dmConversations).find(
      (conversation) => conversation.aliasA === sorted[0] && conversation.aliasB === sorted[1]
    );
    if (existing) {
      return existing.convoId;
    }
    const convoId = `dm:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    this.state.dmConversations[convoId] = {
      convoId,
      aliasA: sorted[0],
      aliasB: sorted[1],
      createdAt: nowIso()
    };
    this.markDirty();
    return convoId;
  }

  listDms(alias: string): DmSummary[] {
    return Object.values(this.state.dmConversations)
      .filter((conversation) => conversation.aliasA === alias || conversation.aliasB === alias)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((conversation) => ({
        convoId: conversation.convoId,
        withAlias: conversation.aliasA === alias ? conversation.aliasB : conversation.aliasA,
        unread: 0,
        locked: true
      }));
  }

  getDmConversation(convoId: string): DmConversationRecord | null {
    return this.state.dmConversations[convoId] ?? null;
  }

  insertMessage(record: MessageRecord): void {
    this.state.messages.push(record);
    this.markDirty();
  }

  listHistory(scope: MessageScope, limit: number, before?: string): MessageRecord[] {
    const key = buildScopeKey(scope);
    const beforeTs = before ? new Date(before).getTime() : Number.POSITIVE_INFINITY;
    return this.state.messages
      .filter((message) => !message.deletedAt)
      .filter((message) => buildScopeKey(message.scope) === key)
      .filter((message) => new Date(message.timestamp).getTime() < beforeTs)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-limit);
  }

  findMessage(messageId: string): MessageRecord | null {
    return this.state.messages.find((message) => message.messageId === messageId) ?? null;
  }

  editMessage(messageId: string, body: string): MessageRecord | null {
    const message = this.state.messages.find((entry) => entry.messageId === messageId);
    if (!message) {
      return null;
    }
    message.body = body;
    this.markDirty();
    return message;
  }

  deleteMessage(messageId: string): MessageRecord | null {
    const message = this.state.messages.find((entry) => entry.messageId === messageId);
    if (!message) {
      return null;
    }
    message.deletedAt = nowIso();
    this.markDirty();
    return message;
  }

  toggleReaction(messageId: string, alias: string, emoji: string): boolean {
    const message = this.state.messages.find((entry) => entry.messageId === messageId);
    if (!message) {
      return false;
    }

    const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
    if (!existing) {
      message.reactions.push({ emoji, aliases: [alias] });
      this.markDirty();
      return true;
    }

    if (existing.aliases.includes(alias)) {
      existing.aliases = existing.aliases.filter((entry) => entry !== alias);
      if (existing.aliases.length === 0) {
        message.reactions = message.reactions.filter((entry) => entry !== existing);
      }
      this.markDirty();
      return false;
    }

    existing.aliases.push(alias);
    this.markDirty();
    return true;
  }

  searchChannelMessages(channel: string, term: string, limit: number): MessageRecord[] {
    const needle = term.toLowerCase();
    return this.state.messages
      .filter((message) => message.scope.kind === "channel" && message.scope.channel === channel)
      .filter((message) => !message.deletedAt && !!message.body)
      .filter((message) => (message.body ?? "").toLowerCase().includes(needle))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-limit);
  }

  insertModerationAction(input: {
    actionId: string;
    actorAlias: string;
    targetAlias: string;
    channel: string;
    actionType: ModerationActionType;
    reason?: string;
  }): void {
    this.state.moderationActions.push({
      actionId: input.actionId,
      actorAlias: input.actorAlias,
      targetAlias: input.targetAlias,
      channel: input.channel,
      actionType: input.actionType,
      reason: input.reason,
      createdAt: nowIso()
    });
    this.markDirty();
  }

  listBots(): Array<{ botId: string; name: string; version: string }> {
    return Object.values(this.state.botApps).map((bot) => ({
      botId: bot.botId,
      name: bot.name,
      version: bot.version
    }));
  }

  insertAuditEvent(eventId: string, category: string, actor: string, payload: Record<string, unknown>): void {
    this.state.auditEvents.push({
      eventId,
      category,
      actor,
      payload,
      createdAt: nowIso()
    });
    this.markDirty();
  }

  listMessagesByScope(scopeKind: MessageScopeKind): MessageRecord[] {
    return this.state.messages.filter((message) => message.scope.kind === scopeKind && !message.deletedAt);
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 800);
  }
}
