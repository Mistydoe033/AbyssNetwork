export interface ParsedCommand {
  name: string;
  args: string[];
  rawArgs: string;
}

export function parseCommand(raw: string): ParsedCommand | null {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith("/")) {
    return null;
  }

  const withoutSlash = trimmed.slice(1).trim();
  if (!withoutSlash) {
    return null;
  }

  const [nameToken, ...rest] = withoutSlash.split(/\s+/);
  return {
    name: nameToken.toLowerCase(),
    args: rest,
    rawArgs: rest.join(" ").trim()
  };
}
