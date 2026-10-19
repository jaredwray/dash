import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { AuthCard, Field, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("admin@dash.dev");
  const [password, setPassword] = useState("dashadmin");
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
      subtitle="Local demo: admin@dash.dev / dashadmin"
      onSubmit={(event) => void onSubmit(event)}
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="text-accent">
            Create an account
          </Link>
        </>
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
