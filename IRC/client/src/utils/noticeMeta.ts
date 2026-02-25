import type { NoticeErrorKey, SystemNoticePayload } from "@abyss/irc-shared";

const ALIAS_ERROR_KEYS: NoticeErrorKey[] = ["ALIAS_IN_USE", "ALIAS_INVALID"];

export function isAliasSetNotice(
  notice: SystemNoticePayload
): notice is SystemNoticePayload & { code: "ALIAS_SET"; alias: string } {
  return notice.code === "ALIAS_SET" && typeof notice.alias === "string" && notice.alias.length > 0;
}

export function isAliasErrorNotice(notice: SystemNoticePayload): boolean {
  return notice.code === "ERROR" && !!notice.errorKey && ALIAS_ERROR_KEYS.includes(notice.errorKey);
}
