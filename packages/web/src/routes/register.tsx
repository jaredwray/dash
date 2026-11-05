import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthBootstrap } from "~/lib/bootstrap";
import { api } from "~/lib/api";
import { AuthCard, Field, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const bootstrap = useQuery({
    queryKey: ["auth-bootstrap"],
    queryFn: () => api<AuthBootstrap>("/api/auth/bootstrap"),
  });

  if (bootstrap.isPending) {
    return <p className="grid min-h-screen place-items-center text-sm text-mist">Loading…</p>;
  }
  if (bootstrap.isError || !bootstrap.data) {
    const detail = bootstrap.error instanceof Error ? bootstrap.error.message : null;
    return (
      <p className="mx-auto grid min-h-screen max-w-lg place-items-center px-6 text-center text-sm text-rose-300">
        {detail ?? "Could not load registration."}
      </p>
    );
  }
  if (!bootstrap.data.allowRegistration) {
    return (
      <AuthCard
        title="Registration is closed"
        subtitle="An administrator has turned off new accounts."
        footer={
          <Link to="/login" className="text-accent">
            Log in
          </Link>
        }
      >
        <p className="text-sm text-mist">Ask an administrator for an invite link if you need access to this organization.</p>
      </AuthCard>
    );
  }

  return <RegisterForm needsSetup={bootstrap.data.needsSetup} />;
}

function RegisterForm({ needsSetup }: { needsSetup: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["auth-bootstrap"] });
      await navigate({ to: "/dashboards" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={needsSetup ? "Create the administrator" : "Create your account"}
      subtitle={
        needsSetup
          ? "The first account becomes the administrator. You can invite others later, or turn registration off in Settings."
          : "Join this organization. An administrator can close registration at any time."
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
      <Field label="Name">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label="Email">
        <TextInput
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
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
        {pending ? "Creating…" : needsSetup ? "Create administrator" : "Create account"}
      </PrimaryButton>
    </AuthCard>
  );
}
