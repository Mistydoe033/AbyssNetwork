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

  it("appends incoming messages", () => {
    const state = chatReducer(initialChatState, {
      type: "ADD_MESSAGE",
      message: {
        messageId: "id-1",
        clientId: "abc",
        alias: "Alpha",
        ip: "127.0.0.1",
        text: "hello",
        timestamp: "2026-01-01T00:00:00.000Z"
      }
    });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toBe("hello");
  });
});
