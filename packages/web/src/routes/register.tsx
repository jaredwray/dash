import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { AuthCard, Field, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
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
      await navigate({ to: "/dashboards" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Create your workspace"
      subtitle="The first account becomes the administrator."
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
        {pending ? "Creating…" : "Create account"}
      </PrimaryButton>
    </AuthCard>
  );
}
