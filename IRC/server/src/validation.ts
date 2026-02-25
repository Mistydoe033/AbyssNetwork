const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const MAX_ALIAS_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 1000;

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

export function hasDisallowedControlChars(input: string): boolean {
  return CONTROL_CHAR_REGEX.test(input);
}

export function validateAlias(input: unknown): ValidationResult {
  const value = sanitizeText(input);
  if (!value) {
    return { ok: false, error: "Alias is required." };
  }
  if (value.length > MAX_ALIAS_LENGTH) {
    return {
      ok: false,
      error: `Alias must be ${MAX_ALIAS_LENGTH} characters or fewer.`
    };
  }
  if (hasDisallowedControlChars(value)) {
    return { ok: false, error: "Alias contains invalid control characters." };
  }
  return { ok: true, value };
}

export function validateMessage(input: unknown): ValidationResult {
  const value = sanitizeText(input);
  if (!value) {
    return { ok: false, error: "Message cannot be empty." };
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`
    };
  }
  if (hasDisallowedControlChars(value)) {
    return { ok: false, error: "Message contains invalid control characters." };
  }
  return { ok: true, value };
}
