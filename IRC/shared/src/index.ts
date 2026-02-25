export type Role = "OWNER" | "ADMIN" | "OP" | "VOICE" | "MEMBER";
export type PresenceStatus = "online" | "away" | "offline";
export type MessageScopeKind = "channel" | "dm" | "thread";
export type ChannelModeFlag = "+i" | "+m" | "+n" | "+t" | "+k" | "+l";
export type ServerErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "ALIAS_IN_USE"
  | "ALIAS_INVALID"
  | "CHANNEL_NOT_FOUND"
  | "FORBIDDEN"
  | "RATE_LIMIT"
  | "INTERNAL";
export type MessageEventType =
  | "CREATED"
  | "EDITED"
  | "DELETED"
  | "REACTION_ADDED"
  | "REACTION_REMOVED";
export type ChannelEventType =
  | "JOINED"
  | "PARTED"
  | "TOPIC_CHANGED"
  | "MODE_CHANGED"
  | "INVITED"
  | "KICKED"
  | "MEMBER_UPDATED"
  | "CREATED";
export type ModerationActionType =
  | "KICK"
  | "BAN"
  | "UNBAN"
  | "MUTE"
  | "UNMUTE"
  | "ROLE_SET";
export type MessageKind = "TEXT" | "ACTION" | "NOTICE";

export interface DeviceHelloPayload {
  deviceId?: string;
  devicePublicKey: string;
}

export interface ClaimAliasPayload {
  alias: string;
  reclaimNonce?: string;
}

export interface CommandExecPayload {
  raw: string;
  contextChannel?: string;
}

export interface JoinChannelPayload {
  channel: string;
}

export interface PartChannelPayload {
  channel: string;
  reason?: string;
}

export interface SendChannelMessagePayload {
  channel: string;
  body: string;
  kind?: MessageKind;
  replyTo?: string;
  threadId?: string;
}

export interface EncryptedDmPayload {
  algorithm: string;
  nonce: string;
  ciphertext: string;
  senderPublicKey: string;
  recipientEncryptedKey: string;
  senderEncryptedKey: string;
}

export interface SendDmMessagePayload {
  targetAlias: string;
  encryptedPayload: EncryptedDmPayload;
}

export interface ReactTogglePayload {
  messageId: string;
  emoji: string;
}

export interface MessageEditPayload {
  messageId: string;
  body: string;
}

export interface MessageDeletePayload {
  messageId: string;
}

export interface HistoryFetchPayload {
  scope: MessageScope;
  before?: string;
  limit?: number;
}

export interface TypingStatePayload {
  scope: MessageScope;
  active: boolean;
}

export interface BotInvokePayload {
  botId: string;
  command: string;
  args: string[];
  channel?: string;
}

export interface ChannelSummary {
  channel: string;
  topic: string;
  modes: ChannelModeFlag[];
  memberCount: number;
  unread: number;
}

export interface DmSummary {
  convoId: string;
  withAlias: string;
  unread: number;
  locked: boolean;
}

export interface MembershipSummary {
  channel: string;
  alias: string;
  role: Role;
  mutedUntil: string | null;
  isBanned: boolean;
}

export interface UnreadCounters {
  [scopeId: string]: number;
}

export interface SessionReadyPayload {
  deviceId: string;
  alias: string | null;
  resumeToken: string;
  motd: string;
}

export interface AliasResultPayload {
  ok: boolean;
  alias?: string;
  reclaimNonce?: string;
  errorKey?: ServerErrorCode;
  message?: string;
}

export interface NetworkSnapshotPayload {
  channels: ChannelSummary[];
  dms: DmSummary[];
  memberships: MembershipSummary[];
  unreadCounters: UnreadCounters;
}

export interface MessageScope {
  kind: MessageScopeKind;
  channel?: string;
  convoId?: string;
  threadId?: string;
}

export interface MessageRecord {
  messageId: string;
  scope: MessageScope;
  senderAlias: string;
  senderDeviceId: string;
  kind: MessageKind;
  body?: string;
  encryptedPayload?: EncryptedDmPayload;
  timestamp: string;
  replyTo?: string;
  threadId?: string;
  reactions: Array<{ emoji: string; aliases: string[] }>;
  deletedAt?: string | null;
}

export interface ChannelEventPayload {
  type: ChannelEventType;
  channel: string;
  actor: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface MessageEventPayload {
  type: MessageEventType;
  scope: MessageScope;
  message: MessageRecord;
}

export interface PresenceEventPayload {
  alias: string;
  status: PresenceStatus;
  channels: string[];
  publicKey: string;
  color: string;
}

export interface ModerationEventPayload {
  action: ModerationActionType;
  actor: string;
  target: string;
  channel: string;
  reason?: string;
  timestamp: string;
}

export interface BotEventPayload {
  botId: string;
  channel: string;
  output: string;
  timestamp: string;
}

export interface ServerErrorPayload {
  code: ServerErrorCode;
  message: string;
}

export interface HistorySnapshotPayload {
  scope: MessageScope;
  messages: MessageRecord[];
}

export interface ClientToServerEvents {
  hello_device: (payload: DeviceHelloPayload) => void;
  claim_alias: (payload: ClaimAliasPayload) => void;
  command_exec: (payload: CommandExecPayload) => void;
  join_channel: (payload: JoinChannelPayload) => void;
  part_channel: (payload: PartChannelPayload) => void;
  send_channel_message: (payload: SendChannelMessagePayload) => void;
  send_dm_message: (payload: SendDmMessagePayload) => void;
  react_toggle: (payload: ReactTogglePayload) => void;
  message_edit: (payload: MessageEditPayload) => void;
  message_delete: (payload: MessageDeletePayload) => void;
  history_fetch: (payload: HistoryFetchPayload) => void;
  typing_state: (payload: TypingStatePayload) => void;
  bot_invoke: (payload: BotInvokePayload) => void;
}

export interface ServerToClientEvents {
  session_ready: (payload: SessionReadyPayload) => void;
  alias_result: (payload: AliasResultPayload) => void;
  network_snapshot: (payload: NetworkSnapshotPayload) => void;
  channel_event: (payload: ChannelEventPayload) => void;
  message_event: (payload: MessageEventPayload) => void;
  presence_event: (payload: PresenceEventPayload) => void;
  moderation_event: (payload: ModerationEventPayload) => void;
  bot_event: (payload: BotEventPayload) => void;
  server_error: (payload: ServerErrorPayload) => void;
  history_snapshot: (payload: HistorySnapshotPayload) => void;
}
