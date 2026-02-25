import type {
  ChatReceivePayload,
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
  messages: ChatReceivePayload[];
  notices: SystemNoticePayload[];
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
  messages: [],
  notices: [],
  error: null
};

export type ChatAction =
  | { type: "SET_ALIAS"; alias: string }
  | { type: "SET_CONNECTION"; connection: ConnectionState }
  | { type: "SET_CLIENTS"; clients: PresenceClient[] }
  | { type: "ADD_MESSAGE"; message: ChatReceivePayload }
  | { type: "ADD_NOTICE"; notice: SystemNoticePayload }
  | { type: "SET_ERROR"; error: string | null };

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
    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.message]
      };
    case "ADD_NOTICE":
      return {
        ...state,
        notices: [...state.notices, action.notice]
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
