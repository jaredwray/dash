import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { OrganizationSettings } from "@dash/core";
import { api } from "~/lib/api";
import { fetchMe } from "~/lib/session";
import { Field, PrimaryButton, TextInput } from "~/components/ui";
import { McpConnectionBanner } from "~/components/mcp-connection-banner";

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
        Set your organization preferences here. Use the API tokens and Agent tokens pages to manage tokens.
      </p>
      {current ? (
        <div className="mt-8 space-y-4 rounded-2xl border border-line bg-panel p-6">
          <Field label="Organization name">
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
      <McpConnectionBanner />
    </div>
  );
}
