import type {
  ChatReceivePayload,
  HistoryEntryPayload,
  PresenceClient,
  SystemNoticePayload
} from "@abyss/irc-shared";

import { isAliasErrorNotice, isAliasSetNotice } from "../utils/noticeMeta";

export interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  attempt: number;
}

export interface ChatState {
  aliasRequested: string | null;
  aliasConfirmed: string | null;
  aliasPending: boolean;
  connection: ConnectionState;
  clients: PresenceClient[];
  timeline: HistoryEntryPayload[];
  error: string | null;
}

export const initialChatState: ChatState = {
  aliasRequested: null,
  aliasConfirmed: null,
  aliasPending: false,
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
  | { type: "REQUEST_ALIAS"; alias: string }
  | { type: "CLEAR_USER_CHAT"; alias: string; ip: string }
  | { type: "SET_CONNECTION"; connection: ConnectionState }
  | { type: "SET_CLIENTS"; clients: PresenceClient[] }
  | { type: "SET_HISTORY"; entries: HistoryEntryPayload[] }
  | { type: "ADD_MESSAGE"; message: ChatReceivePayload }
  | { type: "RECEIVE_NOTICE"; notice: SystemNoticePayload }
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
    case "REQUEST_ALIAS":
      return {
        ...state,
        aliasRequested: action.alias,
        aliasPending: true,
        error: null
      };
    case "CLEAR_USER_CHAT":
      return {
        ...state,
        timeline: state.timeline.filter(
          (entry) =>
            entry.kind !== "chat" ||
            entry.message.alias !== action.alias ||
            entry.message.ip !== action.ip
        ),
        error: null
      };
    case "SET_CONNECTION": {
      if (!action.connection.connected && state.aliasConfirmed) {
        return {
          ...state,
          connection: action.connection,
          aliasRequested: state.aliasConfirmed,
          aliasConfirmed: null,
          aliasPending: true
        };
      }

      return {
        ...state,
        connection: action.connection
      };
    }
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
    case "RECEIVE_NOTICE": {
      const timeline = appendOrdered(state.timeline, { kind: "notice", notice: action.notice });

      if (isAliasSetNotice(action.notice)) {
        return {
          ...state,
          timeline,
          aliasRequested: action.notice.alias,
          aliasConfirmed: action.notice.alias,
          aliasPending: false,
          error: null
        };
      }

      if (isAliasErrorNotice(action.notice)) {
        return {
          ...state,
          timeline,
          aliasPending: false,
          error: action.notice.message
        };
      }

      if (action.notice.code === "ERROR") {
        return {
          ...state,
          timeline,
          error: action.notice.message
        };
      }

      return {
        ...state,
        timeline
      };
    }
    case "SET_ERROR":
      return {
        ...state,
        error: action.error
      };
    default:
      return state;
  }
}
