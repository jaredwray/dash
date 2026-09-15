import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiTokenScope, PublicApiToken } from "@dash/core";
import { API_TOKEN_SCOPES } from "@dash/core";
import { api } from "~/lib/api";
import { Field, GhostButton, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/_authed/tokens")({
  component: TokensPage,
});

function TokensPage() {
  const queryClient = useQueryClient();
  const tokens = useQuery({
    queryKey: ["tokens"],
    queryFn: async () => {
      const payload = await api<{ tokens: PublicApiToken[] }>("/api/tokens");
      return payload.tokens;
    },
  });
  const [name, setName] = useState("MCP client");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["read", "mcp"]);
  const [issued, setIssued] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      api<{ token: string; record: PublicApiToken }>("/api/tokens", {
        method: "POST",
        body: JSON.stringify({ name, scopes, expiresInDays: 90 }),
      }),
    onSuccess: async (payload) => {
      setIssued(payload.token);
      await queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
  });

  function toggleScope(scope: ApiTokenScope) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold">API tokens</h1>
      <p className="mt-2 text-sm text-mist">
        Tokens are shown once at creation. Dash stores only a SHA-256 hash, with scopes and an
        expiry. Use a token as <code>Authorization: Bearer dash_live_…</code>.
      </p>
      <form
        className="mt-8 space-y-4 rounded-2xl border border-line bg-panel p-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Token name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div>
          <div className="mb-2 text-sm text-mist">Scopes</div>
          <div className="flex flex-wrap gap-3">
            {API_TOKEN_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {scope}
              </label>
            ))}
          </div>
        </div>
        <PrimaryButton type="submit" disabled={create.isPending || scopes.length === 0}>
          Issue token
        </PrimaryButton>
        {issued ? (
          <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
            <div className="mb-1 text-mist">Copy this token now. It cannot be retrieved later.</div>
            <code className="break-all text-accent">{issued}</code>
          </div>
        ) : null}
      </form>
      <div className="mt-8 overflow-hidden rounded-2xl border border-line">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/4 text-mist">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Prefix</th>
              <th className="px-4 py-3 font-medium">Scopes</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(tokens.data ?? []).map((token) => (
              <tr key={token.id} className="border-t border-line">
                <td className="px-4 py-3">{token.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{token.prefix}…</td>
                <td className="px-4 py-3">{token.scopes.join(", ")}</td>
                <td className="px-4 py-3 text-mist">
                  {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <GhostButton
                    type="button"
                    onClick={async () => {
                      await api(`/api/tokens/${token.id}`, { method: "DELETE" });
                      await queryClient.invalidateQueries({ queryKey: ["tokens"] });
                    }}
                  >
                    Revoke
                  </GhostButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
