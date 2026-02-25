import { describe, expect, it } from "vitest";

import { MAX_ALIAS_LENGTH, MAX_MESSAGE_LENGTH, validateAlias, validateMessage } from "../src/validation.js";

describe("validation", () => {
  it("accepts a valid alias", () => {
    const result = validateAlias("AbyssUser");
    expect(result.ok).toBe(true);
    expect(result.value).toBe("AbyssUser");
  });

  it("rejects alias over max length", () => {
    const result = validateAlias("a".repeat(MAX_ALIAS_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("rejects empty message", () => {
    const result = validateMessage("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects message over max length", () => {
    const result = validateMessage("a".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("rejects control characters", () => {
    const result = validateMessage("hello\u0007world");
    expect(result.ok).toBe(false);
  });
});
