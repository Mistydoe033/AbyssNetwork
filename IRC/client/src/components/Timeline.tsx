import type { HistoryEntryPayload } from "@abyss/irc-shared";

import { identityColorSeed } from "../utils/identity";
import { formatTimestampSeconds, getUserColor } from "../utils/userFormatting";

interface TimelineProps {
  entries: HistoryEntryPayload[];
}

export function Timeline({ entries }: TimelineProps) {
  return (
    <div className="messages">
      {entries.map((entry) => {
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
  );
}
