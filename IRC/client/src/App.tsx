import { FormEvent, useEffect, useMemo, useReducer, useState } from "react";

import type { PresenceClient } from "@abyss/irc-shared";

import bgImage from "./assets/HBG.jpg";
import { chatSocket } from "./lib/chatSocket";
import { chatReducer, initialChatState } from "./state/chatState";
import {
  isValidAlias,
  isValidMessage,
  sanitizeAlias,
  sanitizeMessage
} from "./utils/validation";

const ALIAS_KEY = "abyss_alias";

function formatClient(client: PresenceClient): string {
  return client.alias ? `${client.alias} (${client.ip})` : client.ip;
}

function App() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [aliasInput, setAliasInput] = useState(localStorage.getItem(ALIAS_KEY) || "");
  const [messageInput, setMessageInput] = useState("");
  const localIpHint = useMemo(() => {
    const desktop = (window as Window & { abyssDesktop?: { localIp?: string | null } }).abyssDesktop;
    return desktop?.localIp ?? null;
  }, []);

  useEffect(() => {
    const stopConnection = chatSocket.onConnection((connection) => {
      dispatch({ type: "SET_CONNECTION", connection });
    });

    const stopPresence = chatSocket.onPresence((payload) => {
      dispatch({ type: "SET_CLIENTS", clients: payload.clients });
    });

    const stopMessages = chatSocket.onMessage((payload) => {
      dispatch({ type: "ADD_MESSAGE", message: payload });
    });

    const stopNotices = chatSocket.onNotice((payload) => {
      dispatch({ type: "ADD_NOTICE", notice: payload });
      if (payload.code === "ERROR") {
        dispatch({ type: "SET_ERROR", error: payload.message });
      }
    });

    return () => {
      stopConnection();
      stopPresence();
      stopMessages();
      stopNotices();
    };
  }, []);

  useEffect(() => {
    if (state.connection.connected && state.alias) {
      chatSocket.registerAlias(state.alias, localIpHint);
    }
  }, [state.connection.connected, state.alias, localIpHint]);

  const connectedClientLabels = useMemo(
    () => state.clients.map(formatClient),
    [state.clients]
  );

  const submitAlias = (event: FormEvent) => {
    event.preventDefault();

    const alias = sanitizeAlias(aliasInput);
    if (!isValidAlias(alias)) {
      dispatch({ type: "SET_ERROR", error: "Alias must be 1-24 chars with no control characters." });
      return;
    }

    localStorage.setItem(ALIAS_KEY, alias);
    dispatch({ type: "SET_ALIAS", alias });
    dispatch({ type: "SET_ERROR", error: null });
    chatSocket.registerAlias(alias, localIpHint);
  };

  const sendMessage = () => {
    const cleaned = sanitizeMessage(messageInput);

    if (!isValidMessage(cleaned)) {
      dispatch({ type: "SET_ERROR", error: "Message must be 1-1000 chars with no control characters." });
      return;
    }

    const sent = chatSocket.sendChat(cleaned);
    if (!sent) {
      dispatch({ type: "SET_ERROR", error: "Still connecting. Message queued." });
      return;
    }

    dispatch({ type: "SET_ERROR", error: null });
    setMessageInput("");
  };

  return (
    <div
      className="page"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.65), rgba(7, 2, 16, 0.85)), url(${bgImage})`
      }}
    >
      {!state.connection.connected && (
        <div className="overlay">
          <div className="overlayCard">
            <h3>Connecting to IRC server...</h3>
            {state.connection.attempt > 0 && <p>Retry attempt: {state.connection.attempt}</p>}
            <p>Server: {import.meta.env.VITE_IRC_SERVER_URL || "ws://127.0.0.1:7001"}</p>
          </div>
        </div>
      )}

      <div className="mainPanel">
        <h1>The Abyss</h1>

        {!state.alias ? (
          <form className="aliasForm" onSubmit={submitAlias}>
            <p>Step into the Abyss. Darkness awaits.</p>
            <input
              value={aliasInput}
              onChange={(event) => setAliasInput(event.target.value)}
              placeholder="Alias"
              maxLength={24}
            />
            <button type="submit">Enter Chat</button>
          </form>
        ) : (
          <>
            <div className="chatHeader">Logged in as {state.alias}</div>
            <div className="messages">
              {state.messages.map((entry) => (
                <div className="messageRow" key={entry.messageId}>
                  <strong>{entry.alias}</strong>
                  <span className="messageIp">({entry.ip})</span>
                  <span>: {entry.text}</span>
                </div>
              ))}

              {state.notices.map((notice, index) => (
                <div className="noticeRow" key={`${notice.timestamp}-${index}`}>
                  [{notice.code}] {notice.message}
                </div>
              ))}
            </div>

            <div className="composer">
              <input
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder="Message"
                maxLength={1000}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    sendMessage();
                  }
                }}
              />
              <button type="button" onClick={sendMessage}>
                Send
              </button>
            </div>
          </>
        )}

        {state.error && <div className="errorBar">{state.error}</div>}
      </div>

      <aside className="clientsPanel">
        <h2>Connected Clients</h2>
        <div className="clientsList">
          {connectedClientLabels.map((label, index) => (
            <div key={`${label}-${index}`}>{label}</div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default App;
