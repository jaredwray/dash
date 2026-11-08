import { ArrowRight, Check, Cloud, Server } from "lucide-react";
import Link from "next/link";
import { cloudPlan, formatPrice } from "~/content/plans";
import { cta } from "~/lib/site";
import { ButtonLink } from "./button-link";
import { GitHubIcon } from "./icons";

const selfHostPoints = [
  "All product features. No feature gates.",
  "MIT license. Your infrastructure, your data.",
  "Node.js 24 and MongoDB. A Dockerfile is included.",
  "Community support on GitHub Issues.",
];

const cloudPoints = [
  "We run it. You sign in.",
  "Automatic upgrades and daily backups.",
  "Email support from the team that builds Dash.",
  "The same product as the open source build.",
];

/** Side-by-side comparison of self-host and Dash Cloud. */
export function TwoWays() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <article
        aria-labelledby="way-self-host"
        className="surface relative flex flex-col rounded-3xl p-7 sm:p-9"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.05] text-paper ring-1 ring-inset ring-white/10">
            <Server className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow !text-mist">Self-host</p>
            <h3 id="way-self-host" className="text-xl font-semibold text-paper">
              Open source
            </h3>
          </div>
        </div>
        <p className="mt-6 font-display text-4xl font-semibold tracking-tight text-paper">
          $0 <span className="text-base font-normal text-mist">forever</span>
        </p>
        <ul className="mt-7 space-y-3">
          {selfHostPoints.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[0.97rem] text-mist-2">
              <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink href={cta.selfHost.href} variant="secondary" icon={<GitHubIcon />}>
            {cta.selfHost.label}
          </ButtonLink>
          <Link
            href="/open-source/"
            className="inline-flex items-center gap-1.5 px-2 text-sm font-medium text-mist-2 hover:text-paper"
          >
            Read the quick start
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </article>

      <article
        aria-labelledby="way-cloud"
        className="relative flex flex-col overflow-hidden rounded-3xl bg-[linear-gradient(180deg,rgb(94_234_212/0.1),rgb(94_234_212/0.02)_45%),var(--color-panel)] p-7 shadow-glow ring-1 ring-accent/35 sm:p-9"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/15 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
            <Cloud className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Managed</p>
            <h3 id="way-cloud" className="text-xl font-semibold text-paper">
              Dash Cloud
            </h3>
          </div>
        </div>
        <p className="relative mt-6 font-display text-4xl font-semibold tracking-tight text-paper">
          {formatPrice(cloudPlan)}{" "}
          <span className="text-base font-normal text-mist">{cloudPlan.priceUnit}</span>
        </p>
        <ul className="relative mt-7 space-y-3">
          {cloudPoints.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[0.97rem] text-mist-2">
              <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <div className="relative mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink href={cta.cloud.href} trailingIcon={<ArrowRight />}>
            {cta.cloud.label}
          </ButtonLink>
          <Link
            href="/pricing/"
            className="inline-flex items-center gap-1.5 px-2 text-sm font-medium text-mist-2 hover:text-paper"
          >
            See pricing
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </article>
    </div>
  );
}
