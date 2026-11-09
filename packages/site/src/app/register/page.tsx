import { ArrowRight, Check, Cloud } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "~/components/auth/register-form";
import { cloudPlan, formatPrice } from "~/content/plans";
import { pageMetadata } from "~/lib/metadata";

const description =
  "Create a Dash Cloud account for your team. Dash Cloud is the managed Dash, with automatic upgrades and daily backups.";

export const metadata: Metadata = pageMetadata({
  title: "Create your Dash Cloud account",
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
      <div className="container-x relative grid grid-cols-1 gap-10 pt-16 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-12 lg:pt-24">
        <div className="flex max-w-xl flex-col lg:col-start-1 lg:row-start-1">
          <p className="eyebrow mb-4">Dash Cloud</p>
          <h1
            id="register-title"
            className="text-shine font-display text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl"
          >
            Create your Dash Cloud account.
          </h1>
          <p className="mt-5 text-lg leading-8 text-mist text-pretty">
            Dash Cloud is the managed Dash. Complete the form to create the account for your team.
          </p>
        </div>

        <div className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1 motion-safe:animate-rise">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-accent/10 blur-3xl"
          />
          <div className="relative rounded-3xl bg-[linear-gradient(180deg,rgb(94_234_212/0.09),rgb(94_234_212/0.02)_40%),var(--color-panel)] p-6 shadow-glow ring-1 ring-accent/35 sm:p-9">
            <RegisterForm />
          </div>
        </div>

        <aside
          aria-labelledby="cloud-plan-title"
          className="surface max-w-xl rounded-3xl p-6 sm:p-8 lg:col-start-1 lg:row-start-2 lg:self-start motion-safe:animate-rise-slow"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
              <Cloud className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Managed</p>
              <h2 id="cloud-plan-title" className="text-lg font-semibold text-paper">
                What your account includes
              </h2>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-7 sm:grid-cols-[auto_1fr] sm:gap-8">
            <div>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold tracking-tight text-paper">
                  {formatPrice(cloudPlan)}
                </span>
                <span className="text-sm text-mist">{cloudPlan.priceUnit}</span>
              </p>
              <p className="mt-1 text-sm text-mist">{cloudPlan.priceLabel}. Prices are in USD.</p>
              <Link
                href="/pricing/"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-mist-2 hover:text-paper"
              >
                Compare each plan
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="space-y-2.5 border-t border-line pt-6 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-8">
              {cloudPlan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-[0.95rem] text-mist-2">
                  <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
