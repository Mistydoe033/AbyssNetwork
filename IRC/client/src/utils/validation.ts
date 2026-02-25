const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const MAX_ALIAS_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 1000;

export function sanitizeAlias(input: string): string {
  return input.trim();
}

export function sanitizeMessage(input: string): string {
  return input.trim();
}

export function isValidAlias(input: string): boolean {
  return (
    input.length >= 1 &&
    input.length <= MAX_ALIAS_LENGTH &&
    !CONTROL_CHAR_REGEX.test(input)
  );
}

export function isValidMessage(input: string): boolean {
  return (
    input.length >= 1 &&
    input.length <= MAX_MESSAGE_LENGTH &&
    !CONTROL_CHAR_REGEX.test(input)
  );
}
