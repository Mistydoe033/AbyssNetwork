import type { Role } from "@abyss/irc-shared";

const ROLE_WEIGHT: Record<Role, number> = {
  OWNER: 5,
  ADMIN: 4,
  OP: 3,
  VOICE: 2,
  MEMBER: 1
};

export function hasRoleAtLeast(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) {
    return false;
  }
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[minimum];
}

export function roleFromMode(mode: string): Role | null {
  switch (mode) {
    case "op":
      return "OP";
    case "deop":
      return "MEMBER";
    case "voice":
      return "VOICE";
    case "devoice":
      return "MEMBER";
    default:
      return null;
  }
}
