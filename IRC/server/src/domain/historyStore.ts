import type { ChatReceivePayload, HistoryEntryPayload } from "@abyss/irc-shared";

export class HistoryStore {
  private sequence = 0;
  private readonly chatEntries: HistoryEntryPayload[] = [];

  nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  appendChat(message: ChatReceivePayload): void {
    this.chatEntries.push({ kind: "chat", message });
  }

  snapshot(): HistoryEntryPayload[] {
    return [...this.chatEntries];
  }
}
