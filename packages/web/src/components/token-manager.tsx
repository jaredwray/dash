import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiTokenScope, PublicApiToken } from "@dash/core";
import { API_TOKEN_SCOPES } from "@dash/core";
import { api } from "~/lib/api";
import { useWorkspace } from "~/components/WorkspaceProvider";
import { Field, GhostButton, PrimaryButton, TextInput } from "~/components/ui";
import { McpConnectionBanner } from "~/components/mcp-connection-banner";

export function TokenManager({ agent = false }: { agent?: boolean }) {
  const { workspace, workspaces, workspaceApi } = useWorkspace();
  const queryClient = useQueryClient();
  const tokens = useQuery({
    queryKey: ["tokens"],
    queryFn: async () => {
      const payload = await api<{ tokens: PublicApiToken[] }>("/api/tokens");
      return payload.tokens;
    },
  });
  const [name, setName] = useState(agent ? "MCP agent" : "MCP client");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["read", "mcp"]);
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      workspaceApi<{ token: string; record: PublicApiToken }>("/api/tokens", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), scopes, expiresInDays: 90 }),
      }),
    onMutate: () => {
      setIssued(null);
      setCopyStatus("");
    },
    onSuccess: async (payload) => {
      setIssued({ id: payload.record.id, token: payload.token });
      await queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => api(`/api/tokens/${id}`, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      setIssued((current) => current?.id === id ? null : current);
      setCopyStatus("");
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

  async function copyToken() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopyStatus("Token copied.");
    } catch {
      setCopyStatus("Could not copy. Select the token and copy it.");
    }
  }

  const visibleTokens = (tokens.data ?? []).filter((token) => !agent || token.scopes.includes("mcp"));

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold">{agent ? "Agent tokens" : "API tokens"}</h1>
      {agent ? (
        <p className="mt-2 text-sm text-mist">
          Agent tokens give your agents access to Dash through MCP. This page lists your API tokens with MCP access.
        </p>
      ) : null}
      <p className="mt-2 text-sm text-mist">
        Dash shows each new token once. Use the token as <code>Authorization: Bearer dash_live_…</code>.
      </p>
      <McpConnectionBanner showTokenLink={!agent} />
      <form
        className="mt-8 space-y-4 rounded-2xl border border-line bg-panel p-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <p className="text-sm text-mist">New tokens use the {workspace.name} workspace and expire after 90 days.</p>
        <Field label="Token name">
          <TextInput required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div>
          <div className="mb-2 text-sm text-mist">Scopes</div>
          <div className="flex flex-wrap gap-3">
            {API_TOKEN_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  disabled={agent && scope !== "write"}
                  onChange={() => toggleScope(scope)}
                />
                {scope}
              </label>
            ))}
          </div>
        </div>
        {agent ? (
          <p className="text-sm text-mist">
            Read and MCP access are required. Select write to let the agent create dashboards and add charts.
          </p>
        ) : null}
        <PrimaryButton type="submit" disabled={create.isPending || !name.trim() || scopes.length === 0}>
          {create.isPending ? "Please wait…" : agent ? "Issue agent token" : "Issue token"}
        </PrimaryButton>
        {create.error ? <p role="alert" className="text-rose-300">{create.error.message}</p> : null}
        {issued ? (
          <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
            <div className="mb-1 text-mist">Copy this token now. You cannot retrieve it later.</div>
            <code className="block break-all select-all text-accent">{issued.token}</code>
            <GhostButton className="mt-3" type="button" onClick={() => void copyToken()}>
              Copy token
            </GhostButton>
            <p role="status" className={copyStatus ? "mt-2 text-mist" : "sr-only"}>{copyStatus}</p>
          </div>
        ) : null}
      </form>
      {tokens.isPending ? <p role="status" className="mt-8 text-sm text-mist">Please wait for the tokens.</p> : null}
      {tokens.error ? <p role="alert" className="mt-8 text-sm text-rose-300">{tokens.error.message}</p> : null}
      {revoke.error ? <p role="alert" className="mt-8 text-sm text-rose-300">{revoke.error.message}</p> : null}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/4 text-mist">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Prefix</th>
              <th className="px-4 py-3 font-medium">Scopes</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {tokens.isSuccess && visibleTokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-mist">
                  {agent ? "No agent tokens yet. Issue a token to connect your agent." : "No API tokens yet."}
                </td>
              </tr>
            ) : null}
            {visibleTokens.map((token) => (
              <tr key={token.id} className="border-t border-line">
                <td className="px-4 py-3">{token.name}</td>
                <td className="px-4 py-3">{workspaces.find((item) => item.id === token.workspaceId)?.name ?? "No access"}</td>
                <td className="px-4 py-3 font-mono text-xs">{token.prefix}…</td>
                <td className="px-4 py-3">{token.scopes.join(", ")}</td>
                <td className="px-4 py-3 text-mist">
                  {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <GhostButton
                    type="button"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(token.id)}
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
