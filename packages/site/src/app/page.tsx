import { ArrowRight, Terminal } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AdapterGrid } from "~/components/adapter-grid";
import { AgentCard } from "~/components/agent-card";
import { BrowserFrame } from "~/components/browser-frame";
import { ButtonLink } from "~/components/button-link";
import { CodeBlock } from "~/components/code-block";
import { CtaBand } from "~/components/cta-band";
import { FeatureGrid } from "~/components/feature-grid";
import { GitHubIcon } from "~/components/icons";
import { SectionHeading } from "~/components/section-heading";
import { TwoWays } from "~/components/two-ways";
import { adapterCount } from "~/content/adapters";
import { mcpEndpoint, mcpTools } from "~/content/mcp";
import { cloudPlan, formatPrice } from "~/content/plans";
import { quickStartCommands, selfHostRequirements } from "~/content/quickstart";
import { cta, site } from "~/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const stats = [
  { value: site.license, label: "License" },
  { value: String(adapterCount), label: "Data sources" },
  { value: String(mcpTools.length), label: "MCP tools" },
  { value: "1", label: "REST API for everything" },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="hero-title">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_520px_at_15%_-10%,rgb(94_234_212/0.14),transparent_55%),radial-gradient(900px_460px_at_95%_-5%,rgb(129_140_248/0.18),transparent_50%)]"
        />
        <div
          aria-hidden="true"
          className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[42rem]"
        />

        <div className="container-x relative pt-20 pb-12 sm:pt-28 sm:pb-16">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className="motion-safe:animate-rise inline-flex items-center gap-2 rounded-full bg-white/[0.05] py-1.5 pr-4 pl-1.5 text-sm text-mist-2 ring-1 ring-inset ring-white/10">
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[0.7rem] font-semibold tracking-[0.12em] text-accent uppercase">
                {site.license}
              </span>
              Open source. MCP built in.
            </p>
            <h1
              id="hero-title"
              className="text-shine motion-safe:animate-rise mt-7 font-display text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl [animation-delay:60ms]"
            >
              Analytics for your team <span className="text-spectrum">and your agents</span>.
            </h1>
            <p className="motion-safe:animate-rise mt-6 max-w-2xl text-lg leading-8 text-mist text-pretty sm:text-xl sm:leading-9 [animation-delay:120ms]">
              Dash is an open source, AI-first analytics workspace. Build dashboards from the UI or
              from an agent over MCP. Self-host it for free, or let us run it on Dash Cloud.
            </p>
            <div className="motion-safe:animate-rise mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row [animation-delay:180ms]">
              <ButtonLink
                href={cta.cloud.href}
                size="lg"
                trailingIcon={<ArrowRight />}
                className="w-full sm:w-auto"
              >
                {cta.cloud.label}
              </ButtonLink>
              <ButtonLink
                href={cta.selfHost.href}
                size="lg"
                variant="secondary"
                icon={<GitHubIcon />}
                className="w-full sm:w-auto"
              >
                {cta.selfHost.label}
              </ButtonLink>
            </div>
            <p className="motion-safe:animate-rise mt-5 text-sm text-mist [animation-delay:240ms]">
              Free forever when you self-host. Cloud from {formatPrice(cloudPlan)}{" "}
              {cloudPlan.priceUnit}.
            </p>
          </div>

          <div className="motion-safe:animate-rise-slow relative mt-16 sm:mt-20 [animation-delay:260ms]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-10 -top-16 -bottom-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(94_234_212/0.2),transparent_70%)] blur-2xl"
            />
            <BrowserFrame
              src="/screenshots/executive-overview.webp"
              alt="Executive overview dashboard in Dash with ARR, net revenue retention, paying customers, and gross margin KPI cards above ARR, new logos, and MRR charts"
              width={2400}
              height={2940}
              aspect="16 / 9.5"
              priority
              url="dash.io/dashboards"
              className="relative"
            />
          </div>

          <dl className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-8 sm:mt-16 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col items-center text-center">
                <dd className="order-1 font-display text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
                  {stat.value}
                </dd>
                <dt className="order-2 mt-1 text-sm text-mist">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="container-x">
        <div className="hairline" />
      </div>

      {/* MCP */}
      <section id="mcp" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="mcp-title">
        <div className="container-x">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <p className="eyebrow mb-4">MCP built in</p>
              <h2
                id="mcp-title"
                className="text-shine font-display text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[2.75rem]"
              >
                Ask for a chart. Get a dashboard.
              </h2>
              <p className="mt-5 text-lg leading-8 text-mist text-pretty">
                Dash ships an MCP server at{" "}
                <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.9em] text-paper">
                  {mcpEndpoint}
                </code>
                . Connect Claude Code or another MCP client with a scoped token. The agent reads
                your schemas, runs structured queries, and adds chart widgets to your dashboards.
              </p>

              <h3 className="mt-10 text-sm font-semibold text-paper">{mcpTools.length} tools</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {mcpTools.map((tool) => (
                  <li key={tool.name}>
                    <span
                      title={tool.description}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 font-mono text-[0.78rem] text-mist-2 ring-1 ring-inset ring-white/10"
                    >
                      <Terminal className="size-3.5 text-accent" aria-hidden="true" />
                      {tool.name}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm leading-6 text-mist">
                Issue a token with the <code className="font-mono text-paper">read</code> and{" "}
                <code className="font-mono text-paper">mcp</code> scopes. Add the{" "}
                <code className="font-mono text-paper">write</code> scope and editor access to let
                the agent create dashboards and add chart widgets.
              </p>
            </div>

            <div className="relative lg:col-span-7">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_30%_20%,rgb(129_140_248/0.18),transparent_70%)] blur-2xl"
              />
              <AgentCard className="relative" />
              <figure className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-ink-2 shadow-frame">
                <div className="relative aspect-[16/8] w-full">
                  <Image
                    src="/screenshots/claude-code.webp"
                    alt="Claude Code shows a bar chart of revenue by product that it built through the Dash MCP server"
                    width={2400}
                    height={1612}
                    sizes="(min-width: 1024px) 660px, 100vw"
                    className="absolute inset-0 h-full w-full object-cover object-left-top"
                  />
                </div>
                <figcaption className="border-t border-line px-4 py-2.5 font-mono text-xs text-mist">
                  Claude Code · chart built through Dash MCP
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="product"
        className="scroll-mt-24 border-t border-line bg-[linear-gradient(180deg,rgb(14_21_36/0.6),transparent_30%)] py-20 sm:py-28"
        aria-labelledby="product-title"
      >
        <div className="container-x">
          <SectionHeading
            eyebrow="Product"
            id="product-title"
            title="Everything a modern analytics workspace needs."
            description="Manage dashboards, data sources, workspaces, and access control from the UI or the REST API. Agents query data and build dashboards over MCP."
          />
          <div className="mt-14">
            <FeatureGrid />
          </div>
        </div>
      </section>

      {/* Data sources */}
      <section
        id="data-sources"
        className="scroll-mt-24 border-t border-line py-20 sm:py-28"
        aria-labelledby="sources-title"
      >
        <div className="container-x">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-4">
              <SectionHeading
                eyebrow="Data sources"
                id="sources-title"
                title="Connect the data you already have."
                description="Paste a connection URI or enter the fields. Dash tests the connection on save and encrypts the credentials at rest."
              />
              <p className="mt-8 text-sm leading-6 text-mist">
                Each adapter is one package in the monorepo. Read how to{" "}
                <Link
                  href="/open-source/#architecture"
                  className="font-medium text-paper underline-offset-4 hover:underline"
                >
                  write a new one
                </Link>
                .
              </p>
            </div>
            <div className="lg:col-span-8">
              <AdapterGrid />
            </div>
          </div>
        </div>
      </section>

      {/* Two ways */}
      <section
        id="run"
        className="scroll-mt-24 border-t border-line py-20 sm:py-28"
        aria-labelledby="run-title"
      >
        <div className="container-x">
          <SectionHeading
            eyebrow="Two ways to run Dash"
            id="run-title"
            title="Self-host it, or let us run it."
            description="The code is the same in both cases. Pick the path that fits your team, and change it later."
            align="center"
          />
          <div className="mt-14">
            <TwoWays />
          </div>
        </div>
      </section>

      {/* Quick start */}
      <section
        id="quick-start"
        className="scroll-mt-24 border-t border-line py-20 sm:py-28"
        aria-labelledby="quick-start-title"
      >
        <div className="container-x">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <SectionHeading
                eyebrow="Quick start"
                id="quick-start-title"
                title="Run it in five commands."
                description="Clone the repository, install the dependencies, and start the dev server. The app, the API, and the MCP server start together."
              />
              <ul className="mt-8 space-y-3">
                {selfHostRequirements.map((requirement) => (
                  <li key={requirement.name} className="flex items-start gap-3 text-[0.95rem]">
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    <span className="text-mist">
                      <span className="font-medium text-paper">{requirement.name}</span> —{" "}
                      {requirement.detail}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <ButtonLink href="/open-source/" variant="secondary" trailingIcon={<ArrowRight />}>
                  Read the self-host guide
                </ButtonLink>
              </div>
            </div>
            <div className="lg:col-span-7">
              <CodeBlock lines={quickStartCommands} title="Terminal" />
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
