import { useEffect, useMemo, useState } from "react";

import type {
  DmSummary,
  MessageRecord,
  MessageScope,
  NetworkSnapshotPayload,
  PresenceEventPayload
} from "@abyss/irc-shared";

import bgImage from "./assets/HBG.jpg";
import { chatSocket } from "./lib/chatSocket";
import { decryptDmBody, encryptDmBody, ensureDeviceIdentity } from "./lib/deviceIdentity";
import { isValidAlias, isValidMessage, sanitizeAlias, sanitizeMessage } from "./utils/validation";

type ActiveView =
  | { kind: "channel"; channel: string }
  | { kind: "dm"; convoId: string };

const COMMANDS = [
  "/help",
  "/nick",
  "/whoami",
  "/away",
  "/back",
  "/quit",
  "/join",
  "/part",
  "/invite",
  "/list",
  "/names",
  "/who",
  "/whois",
  "/topic",
  "/mode",
  "/op",
  "/deop",
  "/voice",
  "/devoice",
  "/ban",
  "/unban",
  "/mute",
  "/unmute",
  "/msg",
  "/me",
  "/notice",
  "/reply",
  "/thread",
  "/ignore",
  "/unignore",
  "/search",
  "/pin",
  "/unpin",
  "/clear",
  "/bot list",
  "/bot run"
];

function scopeKey(scope: MessageScope): string {
  if (scope.kind === "channel") {
    return `channel:${scope.channel ?? ""}`;
  }
  if (scope.kind === "dm") {
    return `dm:${scope.convoId ?? ""}`;
  }
  return `thread:${scope.threadId ?? ""}`;
}

function viewKey(view: ActiveView | null): string | null {
  if (!view) {
    return null;
  }
  if (view.kind === "channel") {
    return `channel:${view.channel}`;
  }
  return `dm:${view.convoId}`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function mergeMessages(existing: MessageRecord[], incoming: MessageRecord): MessageRecord[] {
  const copy = [...existing];
  const index = copy.findIndex((entry) => entry.messageId === incoming.messageId);
  if (index >= 0) {
    copy[index] = incoming;
  } else {
    copy.push(incoming);
  }
  copy.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return copy;
}

function App() {
  const identity = useMemo(() => ensureDeviceIdentity(), []);
  const [connected, setConnected] = useState(false);
  const [motd, setMotd] = useState("");
  const [aliasInput, setAliasInput] = useState(localStorage.getItem("abyss_alias") ?? "");
  const [alias, setAlias] = useState<string | null>(null);
  const [reclaimNonce, setReclaimNonce] = useState(localStorage.getItem("abyss_reclaim_nonce"));
  const [channels, setChannels] = useState<NetworkSnapshotPayload["channels"]>([]);
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceEventPayload>>({});
  const [messagesByScope, setMessagesByScope] = useState<Record<string, MessageRecord[]>>({});
  const [activeView, setActiveView] = useState<ActiveView | null>(null);
  const [composer, setComposer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const stopConnect = chatSocket.onConnect((isConnected) => {
      setConnected(isConnected);
      if (isConnected) {
        chatSocket.helloDevice({
          deviceId: identity.deviceId,
          devicePublicKey: identity.publicKey
        });
      }
    });

    const stopSession = chatSocket.onSessionReady((payload) => {
      setSessionReady(true);
      setMotd(payload.motd);
      if (payload.alias) {
        setAlias(payload.alias);
        setAliasInput(payload.alias);
      } else {
        setAlias(null);
      }
      const rememberedAlias = localStorage.getItem("abyss_alias");
      const rememberedNonce = localStorage.getItem("abyss_reclaim_nonce") ?? undefined;
      if (!payload.alias && rememberedAlias) {
        chatSocket.claimAlias({ alias: rememberedAlias, reclaimNonce: rememberedNonce });
      }
    });

    const stopAlias = chatSocket.onAliasResult((payload) => {
      if (!payload.ok || !payload.alias) {
        setStatus(payload.message ?? "Alias request failed.");
        return;
      }
      setAlias(payload.alias);
      setAliasInput(payload.alias);
      if (payload.reclaimNonce) {
        setReclaimNonce(payload.reclaimNonce);
        localStorage.setItem("abyss_reclaim_nonce", payload.reclaimNonce);
      }
      localStorage.setItem("abyss_alias", payload.alias);
      setStatus(null);
    });

    const stopSnapshot = chatSocket.onNetworkSnapshot((payload) => {
      setChannels(payload.channels);
      setDms(payload.dms);
      if (!activeView) {
        if (payload.channels[0]) {
          setActiveView({ kind: "channel", channel: payload.channels[0].channel });
        } else if (payload.dms[0]) {
          setActiveView({ kind: "dm", convoId: payload.dms[0].convoId });
        }
      }
    });

    const stopChannel = chatSocket.onChannelEvent((payload) => {
      if (payload.type === "CREATED" || payload.type === "JOINED" || payload.type === "PARTED") {
        chatSocket.commandExec({ raw: "/list", contextChannel: payload.channel });
      }
    });

    const stopMessage = chatSocket.onMessageEvent((payload) => {
      setMessagesByScope((previous) => {
        const key = scopeKey(payload.scope);
        const current = previous[key] ?? [];
        return {
          ...previous,
          [key]: mergeMessages(current, payload.message)
        };
      });
    });

    const stopPresence = chatSocket.onPresenceEvent((payload) => {
      setPresence((previous) => ({
        ...previous,
        [payload.alias]: payload
      }));
    });

    const stopHistory = chatSocket.onHistorySnapshot((payload) => {
      setMessagesByScope((previous) => ({
        ...previous,
        [scopeKey(payload.scope)]: payload.messages
      }));
    });

    const stopBot = chatSocket.onBotEvent((payload) => {
      setStatus(`[BOT ${payload.botId}] ${payload.output}`);
    });

    const stopError = chatSocket.onError((payload) => {
      setStatus(payload.message);
    });

    return () => {
      stopConnect();
      stopSession();
      stopAlias();
      stopSnapshot();
      stopChannel();
      stopMessage();
      stopPresence();
      stopHistory();
      stopBot();
      stopError();
    };
  }, [activeView, identity.deviceId, identity.publicKey]);

  useEffect(() => {
    if (!activeView) {
      return;
    }
    if (activeView.kind === "channel") {
      chatSocket.historyFetch({
        scope: { kind: "channel", channel: activeView.channel },
        limit: 120
      });
      return;
    }
    chatSocket.historyFetch({
      scope: { kind: "dm", convoId: activeView.convoId },
      limit: 120
    });
  }, [activeView]);

  const activeMessages = useMemo(() => {
    const key = viewKey(activeView);
    if (!key) {
      return [];
    }
    return messagesByScope[key] ?? [];
  }, [activeView, messagesByScope]);

  const activeMembers = useMemo(() => {
    if (!activeView || activeView.kind !== "channel") {
      return [];
    }
    return Object.values(presence)
      .filter((entry) => entry.channels.includes(activeView.channel))
      .sort((a, b) => a.alias.localeCompare(b.alias));
  }, [activeView, presence]);

  const commandHints = useMemo(() => {
    if (!composer.startsWith("/")) {
      return [];
    }
    const needle = composer.toLowerCase();
    return COMMANDS.filter((command) => command.startsWith(needle)).slice(0, 6);
  }, [composer]);

  const submitAlias = () => {
    const aliasValue = sanitizeAlias(aliasInput);
    if (!isValidAlias(aliasValue)) {
      setStatus("Alias must be 1-24 chars with no control characters.");
      return;
    }
    chatSocket.claimAlias({
      alias: aliasValue,
      reclaimNonce: reclaimNonce ?? undefined
    });
  };

  const sendMessage = () => {
    const text = sanitizeMessage(composer);
    if (!text) {
      return;
    }
    if (!alias) {
      setStatus("Claim alias first.");
      return;
    }

    if (text.startsWith("/clear")) {
      const key = viewKey(activeView);
      if (key) {
        setMessagesByScope((previous) => ({
          ...previous,
          [key]: (previous[key] ?? []).filter((entry) => entry.senderAlias !== alias)
        }));
      }
      setComposer("");
      return;
    }

    if (text.startsWith("/")) {
      chatSocket.commandExec({
        raw: text,
        contextChannel: activeView?.kind === "channel" ? activeView.channel : undefined
      });
      setComposer("");
      return;
    }

    if (!isValidMessage(text)) {
      setStatus("Message must be 1-1000 chars.");
      return;
    }

    if (!activeView) {
      setStatus("Open a channel or DM first.");
      return;
    }

    if (activeView.kind === "channel") {
      chatSocket.sendChannelMessage({
        channel: activeView.channel,
        body: text,
        kind: "TEXT"
      });
      setComposer("");
      return;
    }

    const dm = dms.find((entry) => entry.convoId === activeView.convoId);
    if (!dm) {
      setStatus("DM not found.");
      return;
    }
    const recipientPresence = presence[dm.withAlias];
    const recipientPublicKey = recipientPresence?.publicKey ?? "unknown";
    const encryptedPayload = encryptDmBody(text, identity.publicKey, recipientPublicKey);
    chatSocket.sendDmMessage({
      targetAlias: dm.withAlias,
      encryptedPayload
    });
    setComposer("");
  };

  return (
    <div
      className="ultraPage"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.65), rgba(7, 2, 16, 0.88)), url(${bgImage})`
      }}
    >
      <aside className="rail">
        <h2>Abyss Net</h2>
        <div className="railSection">
          <h3>Channels</h3>
          {channels.map((channel) => (
            <button
              key={channel.channel}
              className={`railItem ${
                activeView?.kind === "channel" && activeView.channel === channel.channel ? "active" : ""
              }`}
              onClick={() => setActiveView({ kind: "channel", channel: channel.channel })}
            >
              {channel.channel}
            </button>
          ))}
        </div>
        <div className="railSection">
          <h3>DMs</h3>
          {dms.map((dm) => (
            <button
              key={dm.convoId}
              className={`railItem ${
                activeView?.kind === "dm" && activeView.convoId === dm.convoId ? "active" : ""
              }`}
              onClick={() => setActiveView({ kind: "dm", convoId: dm.convoId })}
            >
              @{dm.withAlias}
            </button>
          ))}
        </div>
      </aside>

      <main className="workspace">
        <header className="workspaceHeader">
          <div>
            <h1>The Abyss IRC Ultra</h1>
            <p>{motd || "Booting..."}</p>
          </div>
          <div className="sessionState">
            <span>{connected ? "ONLINE" : "RECONNECTING"}</span>
            <span>{alias ? `alias: ${alias}` : "alias: unclaimed"}</span>
          </div>
        </header>

        {!sessionReady ? (
          <div className="gateCard">Connecting...</div>
        ) : !alias ? (
          <div className="gateCard">
            <h3>Claim Alias</h3>
            <input
              value={aliasInput}
              onChange={(event) => setAliasInput(event.target.value)}
              placeholder="Alias"
              maxLength={24}
            />
            <button type="button" onClick={submitAlias}>
              Enter Network
            </button>
          </div>
        ) : (
          <>
            <section className="timeline">
              {activeMessages.map((message) => {
                const isDmEncrypted = !!message.encryptedPayload;
                const displayBody = isDmEncrypted
                  ? decryptDmBody(message.encryptedPayload!)
                  : message.body ?? "";
                return (
                  <div className="msgRow" key={message.messageId}>
                    <span className="msgTime">[{formatTime(message.timestamp)}]</span>
                    <span className="msgAuthor">{message.senderAlias}</span>
                    <span className="msgBody">{displayBody}</span>
                  </div>
                );
              })}
            </section>

            <section className="composerWrap">
              <input
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                placeholder="Type message or /command"
                maxLength={2000}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    sendMessage();
                  }
                }}
              />
              <button type="button" onClick={sendMessage}>
                Send
              </button>
            </section>

            {commandHints.length > 0 && (
              <div className="commandHints">{commandHints.map((entry) => entry).join("   ")}</div>
            )}
          </>
        )}

        {status && <div className="statusBar">{status}</div>}
      </main>

      <aside className="members">
        <h2>Members</h2>
        {activeMembers.map((member) => (
          <div key={member.alias} style={{ color: member.color }}>
            {member.alias} [{member.status}]
          </div>
        ))}
      </aside>
    </div>
  );
}

export default App;
