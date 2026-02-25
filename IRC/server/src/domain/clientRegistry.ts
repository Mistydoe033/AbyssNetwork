import type { PresenceClient } from "@abyss/irc-shared";

export interface ClientState {
  clientId: string;
  alias: string | null;
  ip: string;
  connectedAt: string;
  messageTimestamps: number[];
}

export type AliasSetResult =
  | { ok: true; client: ClientState; changed: boolean }
  | { ok: false; reason: "CLIENT_NOT_FOUND" | "ALIAS_IN_USE" };

export class ClientRegistry {
  private readonly clientsBySocketId = new Map<string, ClientState>();
  private readonly socketIdByAlias = new Map<string, string>();

  addClient(clientId: string, ip: string, connectedAt: string): ClientState {
    const client: ClientState = {
      clientId,
      alias: null,
      ip,
      connectedAt,
      messageTimestamps: []
    };

    this.clientsBySocketId.set(clientId, client);
    return client;
  }

  getClient(clientId: string): ClientState | undefined {
    return this.clientsBySocketId.get(clientId);
  }

  removeClient(clientId: string): ClientState | undefined {
    const client = this.clientsBySocketId.get(clientId);
    if (!client) {
      return undefined;
    }

    this.clientsBySocketId.delete(clientId);

    if (client.alias && this.socketIdByAlias.get(client.alias) === clientId) {
      this.socketIdByAlias.delete(client.alias);
    }

    return client;
  }

  listPresence(): PresenceClient[] {
    return Array.from(this.clientsBySocketId.values()).map((client) => ({
      clientId: client.clientId,
      alias: client.alias,
      ip: client.ip,
      connectedAt: client.connectedAt
    }));
  }

  setAliasIfAvailable(clientId: string, alias: string): AliasSetResult {
    const client = this.clientsBySocketId.get(clientId);
    if (!client) {
      return { ok: false, reason: "CLIENT_NOT_FOUND" };
    }

    if (client.alias === alias) {
      return { ok: true, client, changed: false };
    }

    const ownerClientId = this.socketIdByAlias.get(alias);
    if (ownerClientId && ownerClientId !== clientId) {
      return { ok: false, reason: "ALIAS_IN_USE" };
    }

    if (client.alias && this.socketIdByAlias.get(client.alias) === clientId) {
      this.socketIdByAlias.delete(client.alias);
    }

    client.alias = alias;
    this.socketIdByAlias.set(alias, clientId);

    return { ok: true, client, changed: true };
  }
}
