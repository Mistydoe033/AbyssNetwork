import type { NoticeErrorKey, SystemNoticePayload } from "@abyss/irc-shared";

function identityColorSeed(alias: string | null, ip: string): string {
  return alias ? `${alias}|${ip}` : ip;
}

export class NoticeBuilder {
  constructor(private readonly nextSequence: () => number) {}

  userJoined(clientId: string, alias: string, ip: string, color: string): SystemNoticePayload {
    return {
      sequence: this.nextSequence(),
      code: "USER_JOINED",
      message: `${alias} joined from ${ip}.`,
      timestamp: new Date().toISOString(),
      actorClientId: clientId,
      actorColor: color,
      actorColorSeed: identityColorSeed(alias, ip)
    };
  }

  aliasSet(clientId: string, alias: string, ip: string, color: string): SystemNoticePayload {
    return {
      sequence: this.nextSequence(),
      code: "ALIAS_SET",
      message: `Alias set to ${alias}.`,
      timestamp: new Date().toISOString(),
      actorClientId: clientId,
      actorColor: color,
      actorColorSeed: identityColorSeed(alias, ip),
      alias
    };
  }

  userLeft(clientId: string, alias: string | null, ip: string, color: string): SystemNoticePayload {
    const label = alias ? `${alias} (${ip})` : ip;

    return {
      sequence: this.nextSequence(),
      code: "USER_LEFT",
      message: `${label} disconnected.`,
      timestamp: new Date().toISOString(),
      actorClientId: clientId,
      actorColor: color,
      actorColorSeed: identityColorSeed(alias, ip)
    };
  }

  error(message: string, errorKey: NoticeErrorKey): SystemNoticePayload {
    return {
      sequence: this.nextSequence(),
      code: "ERROR",
      message,
      timestamp: new Date().toISOString(),
      errorKey
    };
  }
}
