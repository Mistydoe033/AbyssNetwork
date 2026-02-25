export type SystemNoticeCode = "ALIAS_SET" | "USER_JOINED" | "USER_LEFT" | "ERROR";

export interface RegisterAliasPayload {
  alias: string;
}

export interface ChatSendPayload {
  text: string;
}

export interface PresenceClient {
  clientId: string;
  alias: string | null;
  ip: string;
  connectedAt: string;
}

export interface PresenceUpdatePayload {
  clients: PresenceClient[];
}

export interface ChatReceivePayload {
  sequence: number;
  messageId: string;
  clientId: string;
  alias: string;
  ip: string;
  text: string;
  timestamp: string;
}

export interface SystemNoticePayload {
  sequence: number;
  code: SystemNoticeCode;
  message: string;
  timestamp: string;
  actorClientId?: string;
  actorColorSeed?: string;
}

export type HistoryEntryPayload =
  | { kind: "chat"; message: ChatReceivePayload }
  | { kind: "notice"; notice: SystemNoticePayload };

export interface HistorySnapshotPayload {
  entries: HistoryEntryPayload[];
}

export interface ClientToServerEvents {
  register_alias: (payload: RegisterAliasPayload) => void;
  chat_send: (payload: ChatSendPayload) => void;
}

export interface ServerToClientEvents {
  history_snapshot: (payload: HistorySnapshotPayload) => void;
  presence_update: (payload: PresenceUpdatePayload) => void;
  chat_receive: (payload: ChatReceivePayload) => void;
  system_notice: (payload: SystemNoticePayload) => void;
}
