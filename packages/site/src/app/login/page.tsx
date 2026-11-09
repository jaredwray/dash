import { ArrowRight, Cloud, Mail, Server } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "~/components/button-link";
import { GitHubIcon } from "~/components/icons";
import { SectionHeading } from "~/components/section-heading";
import { pageMetadata } from "~/lib/metadata";
import { contactHref, cta, site } from "~/lib/site";

const description =
  "Dash Cloud is not open yet, so Dash Cloud accounts do not exist. If you self-host Dash, sign in on your own Dash instance.";

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
      <div className="container-x relative flex flex-col items-center pt-20 pb-20 sm:pt-28 sm:pb-28">
        <SectionHeading
          as="h1"
          eyebrow="Sign in"
          id="login-title"
          title="Sign-in opens with Dash Cloud."
          description="Dash Cloud accounts do not exist yet. Pick the path that matches how you run Dash."
          align="center"
        />

        <div className="mt-16 grid w-full max-w-4xl grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch motion-safe:animate-rise-slow">
          <article
            aria-labelledby="login-cloud"
            className="relative flex flex-col overflow-hidden rounded-3xl bg-[linear-gradient(180deg,rgb(94_234_212/0.09),rgb(94_234_212/0.02)_40%),var(--color-panel)] p-7 shadow-glow ring-1 ring-accent/35 sm:p-9"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/15 blur-3xl"
            />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
                <Cloud className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Managed</p>
                <h2 id="login-cloud" className="text-xl font-semibold text-paper">
                  Dash Cloud account
                </h2>
              </div>
            </div>
            <p className="relative mt-6 text-[0.97rem] leading-7 text-mist">
              Dash Cloud is not open yet. Ask for early access by email, or read what Dash Cloud
              will include.
            </p>
            <div className="relative mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:flex-wrap sm:items-center">
              <ButtonLink href={cta.earlyAccess.href} icon={<Mail />}>
                {cta.earlyAccess.label}
              </ButtonLink>
              <ButtonLink href={cta.cloud.href} variant="secondary" trailingIcon={<ArrowRight />}>
                What Dash Cloud includes
              </ButtonLink>
            </div>
          </article>

          <article
            aria-labelledby="login-self-host"
            className="surface relative flex flex-col rounded-3xl p-7 sm:p-9"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-paper ring-1 ring-inset ring-white/10">
                <Server className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow !text-mist">Self-host</p>
                <h2 id="login-self-host" className="text-xl font-semibold text-paper">
                  Your own Dash instance
                </h2>
              </div>
            </div>
            <p className="mt-6 text-[0.97rem] leading-7 text-mist">
              A self-hosted Dash has its own accounts. Open the address of your instance and sign in
              there. This site does not hold your account.
            </p>
            <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:items-center">
              <ButtonLink href={cta.selfHost.href} variant="secondary" icon={<GitHubIcon />}>
                {cta.selfHost.label}
              </ButtonLink>
            </div>
          </article>
        </div>

        <p className="mt-8 max-w-md text-center text-sm leading-6 text-mist text-pretty">
          Do you have a question about accounts? Write to{" "}
          <a href={contactHref} className="text-paper underline-offset-4 hover:underline">
            {site.contactEmail}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
