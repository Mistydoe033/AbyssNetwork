import type { FormEvent } from "react";

interface AliasGateProps {
  aliasInput: string;
  aliasPending: boolean;
  error: string | null;
  onAliasInputChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function AliasGate({
  aliasInput,
  aliasPending,
  error,
  onAliasInputChange,
  onSubmit
}: AliasGateProps) {
  return (
    <form className="aliasForm" onSubmit={onSubmit}>
      <p>Step into the Abyss. Darkness awaits.</p>
      <input
        value={aliasInput}
        onChange={(event) => onAliasInputChange(event.target.value)}
        placeholder="Alias"
        maxLength={24}
        disabled={aliasPending}
      />
      <button type="submit" disabled={aliasPending}>
        {aliasPending ? "Claiming Alias..." : "Enter Chat"}
      </button>
      {error && <div className="errorBar">{error}</div>}
    </form>
  );
}
