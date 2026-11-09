import { ArrowRight, Check, Cloud, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "~/components/button-link";
import { GitHubIcon } from "~/components/icons";
import { SectionHeading } from "~/components/section-heading";
import { cloudPlan, formatPrice } from "~/content/plans";
import { pageMetadata } from "~/lib/metadata";
import { cta } from "~/lib/site";

const description =
  "Dash Cloud is not open for sign-up yet. Ask for early access by email, or self-host Dash today for free.";

export const metadata: Metadata = pageMetadata({
  title: "Start on Dash Cloud",
  description,
  path: "/register/",
  index: false,
});

export default function RegisterPage() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="register-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_50%_-10%,rgb(94_234_212/0.14),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[30rem]"
      />
      <div className="container-x relative flex flex-col items-center pt-20 pb-20 sm:pt-28 sm:pb-28">
        <SectionHeading
          as="h1"
          eyebrow="Dash Cloud"
          id="register-title"
          title="Dash Cloud is on the way."
          description="Sign-up is not open yet. Ask for early access, or self-host Dash today for free."
          align="center"
        />

        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href={cta.earlyAccess.href} size="lg" icon={<Mail />}>
            {cta.earlyAccess.label}
          </ButtonLink>
          <ButtonLink href={cta.selfHost.href} size="lg" variant="secondary" icon={<GitHubIcon />}>
            {cta.selfHost.label}
          </ButtonLink>
        </div>

        <article
          aria-labelledby="cloud-plan-title"
          className="relative mt-16 w-full max-w-3xl overflow-hidden rounded-3xl bg-[linear-gradient(180deg,rgb(94_234_212/0.09),rgb(94_234_212/0.02)_40%),var(--color-panel)] p-7 shadow-glow ring-1 ring-accent/35 motion-safe:animate-rise-slow sm:p-9"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/15 blur-3xl"
          />
          <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
                <Cloud className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Managed</p>
                <h2 id="cloud-plan-title" className="text-xl font-semibold text-paper">
                  What Dash Cloud will include
                </h2>
              </div>
            </div>
            <p className="inline-flex items-center gap-2 self-start justify-self-start rounded-full bg-white/[0.06] px-3 py-1.5 font-mono text-[0.68rem] font-medium uppercase tracking-[0.16em] text-mist-2 ring-1 ring-inset ring-white/10">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-warn motion-safe:animate-pulse-dot"
              />
              Sign-up not open
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold tracking-tight text-paper">
                  {formatPrice(cloudPlan)}
                </span>
                <span className="text-sm text-mist">{cloudPlan.priceUnit}</span>
              </p>
              <p className="mt-1 text-sm text-mist">{cloudPlan.priceLabel}. Prices are in USD.</p>
              <p className="mt-5 text-[0.95rem] leading-6 text-mist">{cloudPlan.description}</p>
              <Link
                href="/pricing/"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-mist-2 hover:text-paper"
              >
                Compare each plan
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="space-y-3 border-t border-line pt-7 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-8">
              {cloudPlan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-[0.95rem] text-mist-2">
                  <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <p className="mt-8 max-w-md text-center text-sm leading-6 text-mist text-pretty">
          The code on GitHub is the code that will run Dash Cloud. You can self-host it now and move
          to Dash Cloud later.
        </p>
      </div>
    </section>
  );
}
