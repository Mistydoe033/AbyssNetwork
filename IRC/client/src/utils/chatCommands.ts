export type ParsedChatInput =
  | { type: "empty" }
  | { type: "plain"; text: string }
  | { type: "help" }
  | { type: "nick"; alias: string }
  | { type: "me"; action: string }
  | { type: "who" }
  | { type: "clear" }
  | { type: "unknown"; name: string };

export function parseChatInput(rawInput: string): ParsedChatInput {
  const text = rawInput.trim();
  if (!text) {
    return { type: "empty" };
  }

  if (text === "help") {
    return { type: "help" };
  }

  if (text === "who") {
    return { type: "who" };
  }

  if (text === "clear") {
    return { type: "clear" };
  }

  if (!text.startsWith("/")) {
    return { type: "plain", text };
  }

  const [commandToken, ...argParts] = text.split(/\s+/);
  const commandName = commandToken.slice(1).toLowerCase();
  const args = argParts.join(" ").trim();

  switch (commandName) {
    case "help":
      return { type: "help" };
    case "nick":
      return { type: "nick", alias: args };
    case "me":
      return { type: "me", action: args };
    case "who":
      return { type: "who" };
    case "clear":
      return { type: "clear" };
    default:
      return { type: "unknown", name: commandName || "/" };
  }
}
