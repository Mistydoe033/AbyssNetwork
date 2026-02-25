import { describe, expect, it } from "vitest";

import { chatReducer, initialChatState } from "./chatState";

describe("chatReducer", () => {
  it("stores presence updates", () => {
    const state = chatReducer(initialChatState, {
      type: "SET_CLIENTS",
      clients: [
        {
          clientId: "abc",
          alias: "Alpha",
          ip: "127.0.0.1",
          connectedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });

    expect(state.clients).toHaveLength(1);
    expect(state.clients[0].alias).toBe("Alpha");
  });

  it("keeps timeline ordered by sequence", () => {
    const withMessage = chatReducer(initialChatState, {
      type: "ADD_MESSAGE",
      message: {
        sequence: 2,
        messageId: "id-2",
        clientId: "abc",
        alias: "Alpha",
        ip: "127.0.0.1",
        text: "hello",
        timestamp: "2026-01-01T00:00:02.000Z"
      }
    });

    const withNotice = chatReducer(withMessage, {
      type: "ADD_NOTICE",
      notice: {
        sequence: 1,
        code: "ALIAS_SET",
        message: "Alias set to Alpha.",
        timestamp: "2026-01-01T00:00:01.000Z",
        actorClientId: "abc"
      }
    });

    expect(withNotice.timeline).toHaveLength(2);
    expect(withNotice.timeline[0].kind).toBe("notice");
    expect(withNotice.timeline[1].kind).toBe("chat");
  });

  it("deduplicates events by sequence", () => {
    const first = chatReducer(initialChatState, {
      type: "ADD_MESSAGE",
      message: {
        sequence: 10,
        messageId: "id-10",
        clientId: "abc",
        alias: "Alpha",
        ip: "127.0.0.1",
        text: "first",
        timestamp: "2026-01-01T00:00:10.000Z"
      }
    });

    const second = chatReducer(first, {
      type: "ADD_MESSAGE",
      message: {
        sequence: 10,
        messageId: "id-10b",
        clientId: "abc",
        alias: "Alpha",
        ip: "127.0.0.1",
        text: "duplicate",
        timestamp: "2026-01-01T00:00:10.000Z"
      }
    });

    expect(second.timeline).toHaveLength(1);
    expect(second.timeline[0].kind).toBe("chat");
  });
});
