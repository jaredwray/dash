import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { OrganizationSettings } from "@dash/core";
import { api } from "~/lib/api";
import { fetchMe } from "~/lib/session";
import { Field, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const payload = await api<{ settings: OrganizationSettings }>("/api/settings");
      return payload.settings;
    },
  });
  const [name, setName] = useState<string>();
  const [allowRegistration, setAllowRegistration] = useState<boolean>();
  const save = useMutation({
    mutationFn: async () =>
      api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          name: name ?? settings.data?.name,
          allowRegistration: allowRegistration ?? settings.data?.allowRegistration,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const current = settings.data;
  const isAdmin = me.data?.role === "admin";

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-mist">
        Workspace preferences. API tokens and MCP live on their own pages.
      </p>
      {current ? (
        <div className="mt-8 space-y-4 rounded-2xl border border-line bg-panel p-6">
          <Field label="Workspace name">
            <TextInput
              value={name ?? current.name}
              onChange={(event) => setName(event.target.value)}
              disabled={!isAdmin}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowRegistration ?? current.allowRegistration}
              onChange={(event) => setAllowRegistration(event.target.checked)}
              disabled={!isAdmin}
            />
            Allow new account registration
          </label>
          {isAdmin ? (
            <PrimaryButton type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save settings"}
            </PrimaryButton>
          ) : (
            <p className="text-sm text-mist">Only administrators can change these settings.</p>
          )}
        </div>
      ) : (
        <p className="mt-8 text-mist">Loading settings…</p>
      )}
      <section className="mt-8 rounded-2xl border border-line bg-panel p-6 text-sm text-mist">
        <h2 className="text-base font-medium text-paper">Dash MCP</h2>
        <p className="mt-2">
          Point an MCP client at <code className="text-accent">/mcp</code> with a bearer API
          token that includes the <code>mcp</code> scope. Agents can list sources, query data,
          and add chart widgets to dashboard pages.
        </p>
      </section>
    </div>
  );
}
