import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import type { InvitationPreview } from "@dash/core";
import { USER_ROLE_LABELS } from "@dash/core";
import { api } from "~/lib/api";
import { invitationTokenFromHash } from "~/lib/invitation";
import { AuthCard, Field, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
});

/** `undefined` until mounted: the fragment exists only in the browser, never in the SSR request. */
function useInvitationToken(): string | null | undefined {
  const [token, setToken] = useState<string | null>();
  useEffect(() => {
    setToken(invitationTokenFromHash(window.location.hash));
  }, []);
  return token;
}

function InvitePage() {
  const token = useInvitationToken();
  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: async () =>
      (
        await api<{ invitation: InvitationPreview }>("/api/auth/invitation", {
          method: "POST",
          body: JSON.stringify({ token }),
        })
      ).invitation,
    enabled: typeof token === "string",
    retry: false,
  });

  if (token === undefined || (token && preview.isPending)) {
    return <p className="grid min-h-screen place-items-center text-sm text-mist">Loading…</p>;
  }
  if (!token || preview.isError || !preview.data) {
    return <InvitationUnavailable />;
  }
  return <AcceptForm token={token} invitation={preview.data} />;
}

function InvitationUnavailable() {
  return (
    <AuthCard
      title="Invitation unavailable"
      subtitle="This link is invalid, was already used, was revoked, or has expired."
      footer={
        <Link to="/login" className="text-accent">
          Log in
        </Link>
      }
    >
      <p className="text-sm text-mist">Ask an administrator for a new invite link.</p>
    </AuthCard>
  );
}

function AcceptForm({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const role = USER_ROLE_LABELS[invitation.role];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/invitation/accept", {
        method: "POST",
        body: JSON.stringify({ token, name, password }),
      });
      // Drop anything cached for a previous account in this browser.
      queryClient.clear();
      await navigate({ to: "/dashboards", replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept the invitation");
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={`Join ${invitation.workspaceName}`}
      subtitle={
        invitation.invitedByName
          ? `${invitation.invitedByName} invited you with the ${role} role.`
          : `You were invited with the ${role} role.`
      }
      onSubmit={(event) => void onSubmit(event)}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-accent">
            Log in
          </Link>
        </>
      }
    >
      <Field label="Email">
        <TextInput
          type="email"
          value={invitation.email}
          readOnly
          autoComplete="username"
          className="text-mist"
        />
      </Field>
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={80}
          required
        />
      </Field>
      <Field label="Password">
        <TextInput
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <PrimaryButton type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Accept invitation"}
      </PrimaryButton>
    </AuthCard>
  );
}
