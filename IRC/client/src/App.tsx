import { FormEvent, useEffect, useMemo, useReducer, useState } from "react";

import bgImage from "./assets/HBG.jpg";
import { AliasGate } from "./components/AliasGate";
import { ConnectedClients } from "./components/ConnectedClients";
import { Timeline } from "./components/Timeline";
import { chatSocket } from "./lib/chatSocket";
import { chatReducer, initialChatState } from "./state/chatState";
import {
  isValidAlias,
  isValidMessage,
  sanitizeAlias,
  sanitizeMessage
} from "./utils/validation";

const ALIAS_KEY = "abyss_alias";

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
      dispatch({ type: "RECEIVE_NOTICE", notice: payload });
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
    if (state.connection.connected && state.aliasPending && state.aliasRequested) {
      chatSocket.registerAlias(state.aliasRequested);
    }
  }, [state.connection.connected, state.aliasPending, state.aliasRequested]);

  useEffect(() => {
    if (state.aliasConfirmed) {
      localStorage.setItem(ALIAS_KEY, state.aliasConfirmed);
    }
  }, [state.aliasConfirmed]);

  const connectedClients = useMemo(() => state.clients, [state.clients]);

  const submitAlias = (event: FormEvent) => {
    event.preventDefault();

    const alias = sanitizeAlias(aliasInput);
    if (!isValidAlias(alias)) {
      dispatch({ type: "SET_ERROR", error: "Alias must be 1-24 chars with no control characters." });
      return;
    }

    dispatch({ type: "REQUEST_ALIAS", alias });
  };

  const sendMessage = () => {
    if (!state.aliasConfirmed) {
      dispatch({ type: "SET_ERROR", error: "Set an alias before sending messages." });
      return;
    }

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

        {!state.aliasConfirmed ? (
          <AliasGate
            aliasInput={aliasInput}
            aliasPending={state.aliasPending}
            error={state.error}
            onAliasInputChange={setAliasInput}
            onSubmit={submitAlias}
          />
        ) : (
          <>
            <div className="chatHeader">Logged in as {state.aliasConfirmed}</div>
            <Timeline entries={state.timeline} />

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

        {state.aliasConfirmed && state.error && <div className="errorBar">{state.error}</div>}
      </div>

      <ConnectedClients clients={connectedClients} />
    </div>
  );
}

export default App;
