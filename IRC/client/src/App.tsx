import { FormEvent, useEffect, useMemo, useReducer, useState } from "react";

import bgImage from "./assets/HBG.jpg";
import { chatSocket } from "./lib/chatSocket";
import { chatReducer, initialChatState } from "./state/chatState";
import {
  isValidAlias,
  isValidMessage,
  sanitizeAlias,
  sanitizeMessage
} from "./utils/validation";
import { formatTimestampSeconds, getUserColor } from "./utils/userFormatting";

const ALIAS_KEY = "abyss_alias";

function identityColorSeed(alias: string | null, ip: string): string {
  return alias ? `${alias}|${ip}` : ip;
}

function App() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [aliasInput, setAliasInput] = useState(localStorage.getItem(ALIAS_KEY) || "");
  const [messageInput, setMessageInput] = useState("");

  useEffect(() => {
    const stopConnection = chatSocket.onConnection((connection) => {
      dispatch({ type: "SET_CONNECTION", connection });
    });

    const stopHistory = chatSocket.onHistory((payload) => {
      dispatch({ type: "SET_HISTORY", entries: payload.entries });
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
      stopHistory();
      stopPresence();
      stopMessages();
      stopNotices();
    };
  }, []);

  useEffect(() => {
    if (state.connection.connected && state.alias) {
      chatSocket.registerAlias(state.alias);
    }
  }, [state.connection.connected, state.alias]);

  const connectedClients = useMemo(() => state.clients, [state.clients]);

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
              {state.timeline.map((entry) => {
                if (entry.kind === "chat") {
                  const message = entry.message;
                  const color = getUserColor(identityColorSeed(message.alias, message.ip));

                  return (
                    <div className="messageRow" key={`chat-${message.sequence}`}>
                      <span className="timestamp">[{formatTimestampSeconds(message.timestamp)}]</span>{" "}
                      <span className="messageBody" style={{ color }}>
                        <strong>{message.alias}</strong>
                        <span> ({message.ip})</span>
                        <span>: {message.text}</span>
                      </span>
                    </div>
                  );
                }

                const notice = entry.notice;

                return (
                  <div
                    className="noticeRow"
                    key={`notice-${notice.sequence}`}
                    style={{ color: getUserColor(notice.actorColorSeed ?? notice.actorClientId) }}
                  >
                    <span className="timestamp">[{formatTimestampSeconds(notice.timestamp)}]</span>{" "}
                    [{notice.code}] {notice.message}
                  </div>
                );
              })}
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
          {connectedClients.map((client) => (
            <div
              key={client.clientId}
              style={{ color: getUserColor(identityColorSeed(client.alias, client.ip)) }}
            >
              {client.alias ? `${client.alias} (${client.ip})` : client.ip}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default App;
