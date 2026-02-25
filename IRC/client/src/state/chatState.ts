import type {
  ChatReceivePayload,
  HistoryEntryPayload,
  PresenceClient,
  SystemNoticePayload
} from "@abyss/irc-shared";

export interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  attempt: number;
}

export interface ChatState {
  alias: string | null;
  connection: ConnectionState;
  clients: PresenceClient[];
  timeline: HistoryEntryPayload[];
  error: string | null;
}

export const initialChatState: ChatState = {
  alias: null,
  connection: {
    connected: false,
    reconnecting: true,
    attempt: 0
  },
  clients: [],
  timeline: [],
  error: null
};

export type ChatAction =
  | { type: "SET_ALIAS"; alias: string }
  | { type: "SET_CONNECTION"; connection: ConnectionState }
  | { type: "SET_CLIENTS"; clients: PresenceClient[] }
  | { type: "SET_HISTORY"; entries: HistoryEntryPayload[] }
  | { type: "ADD_MESSAGE"; message: ChatReceivePayload }
  | { type: "ADD_NOTICE"; notice: SystemNoticePayload }
  | { type: "SET_ERROR"; error: string | null };

function entrySequence(entry: HistoryEntryPayload): number {
  return entry.kind === "chat" ? entry.message.sequence : entry.notice.sequence;
}

function sortAndDeduplicate(entries: HistoryEntryPayload[]): HistoryEntryPayload[] {
  const sorted = [...entries].sort((a, b) => entrySequence(a) - entrySequence(b));
  const deduped: HistoryEntryPayload[] = [];

  for (const entry of sorted) {
    const sequence = entrySequence(entry);
    const previous = deduped[deduped.length - 1];
    if (previous && entrySequence(previous) === sequence) {
      continue;
    }
    deduped.push(entry);
  }

  return deduped;
}

function appendOrdered(stateEntries: HistoryEntryPayload[], nextEntry: HistoryEntryPayload): HistoryEntryPayload[] {
  const nextSequence = entrySequence(nextEntry);
  if (stateEntries.some((entry) => entrySequence(entry) === nextSequence)) {
    return stateEntries;
  }

  const last = stateEntries[stateEntries.length - 1];
  if (!last || entrySequence(last) < nextSequence) {
    return [...stateEntries, nextEntry];
  }

  return sortAndDeduplicate([...stateEntries, nextEntry]);
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_ALIAS":
      return {
        ...state,
        alias: action.alias
      };
    case "SET_CONNECTION":
      return {
        ...state,
        connection: action.connection
      };
    case "SET_CLIENTS":
      return {
        ...state,
        clients: action.clients
      };
    case "SET_HISTORY":
      return {
        ...state,
        timeline: sortAndDeduplicate(action.entries)
      };
    case "ADD_MESSAGE":
      return {
        ...state,
        timeline: appendOrdered(state.timeline, { kind: "chat", message: action.message })
      };
    case "ADD_NOTICE":
      return {
        ...state,
        timeline: appendOrdered(state.timeline, { kind: "notice", notice: action.notice })
      };
    case "SET_ERROR":
      return {
        ...state,
        error: action.error
      };
    default:
      return state;
  }
}
