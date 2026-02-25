import type { PresenceClient } from "@abyss/irc-shared";

import { identityColorSeed } from "../utils/identity";
import { getUserColor } from "../utils/userFormatting";

interface ConnectedClientsProps {
  clients: PresenceClient[];
}

export function ConnectedClients({ clients }: ConnectedClientsProps) {
  return (
    <aside className="clientsPanel">
      <h2>Connected Clients</h2>
      <div className="clientsList">
        {clients.map((client) => (
          <div
            key={client.clientId}
            style={{
              color:
                client.color ?? getUserColor(identityColorSeed(client.alias, client.ip))
            }}
          >
            {client.alias ? `${client.alias} (${client.ip})` : client.ip}
          </div>
        ))}
      </div>
    </aside>
  );
}
