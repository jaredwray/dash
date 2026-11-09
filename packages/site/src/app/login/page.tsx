import { Server } from "lucide-react";
import type { Metadata } from "next";
import { LoginForm } from "~/components/auth/login-form";
import { pageMetadata } from "~/lib/metadata";

const description =
  "Sign in to your Dash Cloud account. A self-hosted Dash has its own sign-in on its own address.";

export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  description,
  path: "/login/",
  index: false,
});

export default function LoginPage() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="login-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_50%_-10%,rgb(129_140_248/0.16),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[30rem]"
      />
      <div className="container-x relative flex flex-col items-center pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="flex max-w-xl flex-col items-center text-center">
          <p className="eyebrow mb-4">Dash Cloud</p>
          <h1
            id="login-title"
            className="text-shine font-display text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-5xl"
          >
            Sign in to Dash Cloud.
          </h1>
          <p className="mt-5 text-lg leading-8 text-mist text-pretty">
            Enter the email and password of your Dash Cloud account.
          </p>
        </div>

        <div className="relative mt-12 w-full max-w-md motion-safe:animate-rise">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-accent/10 blur-3xl"
          />
          <div className="relative rounded-3xl bg-[linear-gradient(180deg,rgb(94_234_212/0.09),rgb(94_234_212/0.02)_40%),var(--color-panel)] p-6 shadow-glow ring-1 ring-accent/35 sm:p-9">
            <LoginForm />
          </div>
        </div>

        <p className="mt-10 flex max-w-md items-start gap-3 text-left text-sm leading-6 text-mist text-pretty sm:items-center">
          <Server className="mt-1 size-4 shrink-0 text-mist-2 sm:mt-0" aria-hidden="true" />
          <span>
            Do you self-host Dash? A self-hosted Dash has its own sign-in on its own address.
          </span>
        </p>
      </div>
    </section>
  );
}
