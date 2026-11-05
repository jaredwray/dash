import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthBootstrap, DemoLogin } from "~/lib/bootstrap";
import { api } from "~/lib/api";
import { AuthCard, Field, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
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
        {detail ?? "Could not load sign-in."}
      </p>
    );
  }
  if (bootstrap.data.needsSetup) {
    return <SetupPrompt />;
  }
  return (
    <LoginForm
      demoLogin={bootstrap.data.demoLogin}
      allowRegistration={bootstrap.data.allowRegistration}
    />
  );
}

function SetupPrompt() {
  return (
    <AuthCard
      title="Create the first account"
      subtitle="This organization has no users yet. The first account is the administrator. Additional people register after that, until an admin turns registration off in Settings."
    >
      <Link
        to="/register"
        className="inline-flex w-full justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink"
      >
        Create administrator
      </Link>
    </AuthCard>
  );
}

function LoginForm({
  demoLogin,
  allowRegistration,
}: {
  demoLogin: DemoLogin | null;
  allowRegistration: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(demoLogin?.email ?? "");
  const [password, setPassword] = useState(demoLogin?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/dashboards" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle={
        demoLogin
          ? `Local demo: ${demoLogin.email} / ${demoLogin.password}`
          : "Sign in with your organization account."
      }
      onSubmit={(event) => void onSubmit(event)}
      footer={
        allowRegistration ? (
          <>
            New here?{" "}
            <Link to="/register" className="text-accent">
              Create an account
            </Link>
          </>
        ) : (
          <>Need an account? Ask an administrator for an invite link.</>
        )
      }
    >
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
          autoComplete="current-password"
          required
        />
      </Field>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <PrimaryButton type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Log in"}
      </PrimaryButton>
    </AuthCard>
  );
}
