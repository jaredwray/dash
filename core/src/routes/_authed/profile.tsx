import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "~/lib/api";
import { fetchMe } from "~/lib/session";
import { Field, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/_authed/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const [name, setName] = useState<string>();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () =>
      api("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name ?? me.data?.name,
          password: password || undefined,
        }),
      }),
    onSuccess: async () => {
      setPassword("");
      setMessage("Profile updated");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  if (!me.data) {
    return <div className="text-mist">Loading profile…</div>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold">Profile</h1>
      <div className="mt-8 space-y-4 rounded-2xl border border-line bg-panel p-6">
        <Field label="Name">
          <TextInput
            value={name ?? me.data.name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Email">
          <TextInput value={me.data.email} disabled />
        </Field>
        <Field label="Role">
          <TextInput value={me.data.role} disabled />
        </Field>
        <Field label="New password">
          <TextInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Leave blank to keep the current password"
          />
        </Field>
        {message ? <p className="text-sm text-accent">{message}</p> : null}
        {save.isError ? (
          <p className="text-sm text-rose-300">
            {save.error instanceof Error ? save.error.message : "Update failed"}
          </p>
        ) : null}
        <PrimaryButton type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"}
        </PrimaryButton>
      </div>
    </div>
  );
}
