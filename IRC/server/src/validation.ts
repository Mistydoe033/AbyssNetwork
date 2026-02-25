const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CHANNEL_REGEX = /^#[A-Za-z0-9_\-]{1,48}$/;

export const MAX_ALIAS_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_CHANNEL_LENGTH = 49;

export interface ValidationResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export function sanitizeText(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }
  return input.trim();
}

function hasDisallowedControlChars(input: string): boolean {
  return CONTROL_CHAR_REGEX.test(input);
}

export function normalizeAlias(input: unknown): ValidationResult {
  const value = sanitizeText(input);
  if (!value) {
    return { ok: false, error: "Alias is required." };
  }
  if (value.length > MAX_ALIAS_LENGTH) {
    return { ok: false, error: `Alias must be ${MAX_ALIAS_LENGTH} characters or fewer.` };
  }
  if (hasDisallowedControlChars(value)) {
    return { ok: false, error: "Alias contains invalid control characters." };
  }
  return { ok: true, value };
}

export function normalizeChannel(input: unknown): ValidationResult {
  const value = sanitizeText(input);
  if (!value) {
    return { ok: false, error: "Channel is required." };
  }
  if (value.length > MAX_CHANNEL_LENGTH) {
    return { ok: false, error: "Channel name is too long." };
  }
  if (!CHANNEL_REGEX.test(value)) {
    return { ok: false, error: "Channel must start with # and contain letters, numbers, _ or -." };
  }
  return { ok: true, value: value.toLowerCase() };
}

export function normalizeMessage(input: unknown): ValidationResult {
  const value = sanitizeText(input);
  if (!value) {
    return { ok: false, error: "Message cannot be empty." };
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  }
  if (hasDisallowedControlChars(value)) {
    return { ok: false, error: "Message contains invalid control characters." };
  }
  return { ok: true, value };
}
