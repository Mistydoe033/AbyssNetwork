import { describe, expect, it } from "vitest";

import {
  MAX_MESSAGE_LENGTH,
  isValidAlias,
  isValidMessage,
  sanitizeAlias,
  sanitizeMessage
} from "./validation";

describe("send/alias validation", () => {
  it("sanitizes and validates aliases", () => {
    const alias = sanitizeAlias("  Raven  ");
    expect(alias).toBe("Raven");
    expect(isValidAlias(alias)).toBe(true);
  });

  it("rejects empty sanitized messages", () => {
    const message = sanitizeMessage("    ");
    expect(message).toBe("");
    expect(isValidMessage(message)).toBe(false);
  });

  it("rejects too-large messages", () => {
    expect(isValidMessage("x".repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false);
  });

  it("rejects control characters", () => {
    expect(isValidMessage("hello\u0007world")).toBe(false);
  });
});
