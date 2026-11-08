import { ArrowRight, Check, GitPullRequest, Scale, ShieldCheck, Unlock } from "lucide-react";
import type { Metadata } from "next";
import { BrowserFrame } from "~/components/browser-frame";
import { ButtonLink } from "~/components/button-link";
import { CodeBlock } from "~/components/code-block";
import { CtaBand } from "~/components/cta-band";
import { GitHubIcon } from "~/components/icons";
import { SectionHeading } from "~/components/section-heading";
import { adapters } from "~/content/adapters";
import { mcpTools } from "~/content/mcp";
import { architecture, openSourceReasons, whatYouGet } from "~/content/open-source";
import { healthEndpoints, quickStartCommands, selfHostRequirements } from "~/content/quickstart";
import { pageMetadata } from "~/lib/metadata";
import { cta, site } from "~/lib/site";

const description =
  "Dash is MIT licensed and free to self-host. Read why it is open source, what you get, and how to run it with Node.js 24 and MongoDB.";

export const metadata: Metadata = pageMetadata({
  title: "Open source",
  description,
  path: "/open-source/",
});

const reasonIcons = [Unlock, Scale, ShieldCheck];

export default function OpenSourcePage() {
  return (
    <>
      <section className="relative overflow-hidden" aria-labelledby="os-title">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_500px_at_10%_-10%,rgb(94_234_212/0.14),transparent_55%),radial-gradient(800px_400px_at_100%_0%,rgb(129_140_248/0.16),transparent_50%)]"
        />
        <div
          aria-hidden="true"
          className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[34rem]"
        />
        <div className="container-x relative pt-20 pb-16 sm:pt-28 sm:pb-20">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <SectionHeading
                as="h1"
                eyebrow={`${site.license} license`}
                id="os-title"
                title="Open source, all the way down."
                description="The code on GitHub is the code that runs Dash Cloud. Clone it, read it, change it, and run it where you want."
              />
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href={cta.selfHost.href} size="lg" icon={<GitHubIcon />}>
                  View on GitHub
                </ButtonLink>
                <ButtonLink
                  href="#quick-start"
                  size="lg"
                  variant="secondary"
                  trailingIcon={<ArrowRight />}
                >
                  Quick start
                </ButtonLink>
              </div>
              <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-line pt-8">
                <div>
                  <dt className="text-sm text-mist">License</dt>
                  <dd className="mt-1 font-display text-2xl font-semibold text-paper">
                    {site.license}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-mist">Adapters</dt>
                  <dd className="mt-1 font-display text-2xl font-semibold text-paper">
                    {adapters.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-mist">MCP tools</dt>
                  <dd className="mt-1 font-display text-2xl font-semibold text-paper">
                    {mcpTools.length}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="relative lg:col-span-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_30%,rgb(94_234_212/0.16),transparent_70%)] blur-2xl"
              />
              <BrowserFrame
                src="/screenshots/dashboards.webp"
                alt="Dashboards list in a Dash workspace with six dashboards and the MCP connection card"
                width={2400}
                height={1500}
                aspect="16 / 10"
                url="localhost:3000/dashboards"
                priority
                className="relative"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="border-t border-line py-20 sm:py-28" aria-labelledby="why-title">
        <div className="container-x">
          <SectionHeading
            eyebrow="Why open source"
            id="why-title"
            title="Trust is easier to earn in the open."
            description="Analytics software touches your most sensitive data. You can read each line that touches it."
          />
          <ul className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
            {openSourceReasons.map((reason, index) => {
              const Icon = reasonIcons[index] ?? Unlock;
              return (
                <li key={reason.id} className="surface rounded-3xl p-7">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/25">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-paper">{reason.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-7 text-mist">{reason.description}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* What you get */}
      <section className="border-t border-line py-20 sm:py-28" aria-labelledby="get-title">
        <div className="container-x grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow="What you get"
              id="get-title"
              title="The full product. Not a community edition."
              description="Each feature of Dash Cloud is in the repository. The MIT license lets you use it, change it, and deploy it for any purpose."
            />
            <div className="mt-8">
              <ButtonLink href={site.licenseUrl} variant="secondary" trailingIcon={<ArrowRight />}>
                Read the license
              </ButtonLink>
            </div>
          </div>
          <ul className="surface grid grid-cols-1 gap-x-8 gap-y-4 rounded-3xl p-7 sm:grid-cols-2 sm:p-9 lg:col-span-7">
            {whatYouGet.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[0.97rem] text-mist-2">
                <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Self-host */}
      <section
        id="quick-start"
        className="scroll-mt-24 border-t border-line py-20 sm:py-28"
        aria-labelledby="self-host-title"
      >
        <div className="container-x">
          <SectionHeading
            eyebrow="Self-host"
            id="self-host-title"
            title="Up in five commands."
            description="Dash needs Node.js 24 and MongoDB. The repository includes a Dockerfile for container deployments."
          />
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <CodeBlock lines={quickStartCommands} />
              <p className="mt-4 text-sm leading-6 text-mist">
                Open <code className="font-mono text-paper">.env</code> and set the MongoDB
                connection string before you start the server.
              </p>
            </div>
            <div className="space-y-5 lg:col-span-5">
              <div className="surface rounded-3xl p-7">
                <h3 className="text-sm font-semibold text-paper">Requirements</h3>
                <ul className="mt-4 space-y-4">
                  {selfHostRequirements.map((requirement) => (
                    <li key={requirement.name}>
                      <p className="font-medium text-paper">{requirement.name}</p>
                      <p className="text-sm leading-6 text-mist">{requirement.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="surface rounded-3xl p-7">
                <h3 className="text-sm font-semibold text-paper">Health endpoints</h3>
                <p className="mt-2 text-sm leading-6 text-mist">
                  Point your load balancer or uptime monitor at either endpoint.
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {healthEndpoints.map((endpoint) => (
                    <li key={endpoint}>
                      <code className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 font-mono text-sm text-accent ring-1 ring-inset ring-white/10">
                        GET {endpoint}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section
        id="architecture"
        className="scroll-mt-24 border-t border-line py-20 sm:py-28"
        aria-labelledby="arch-title"
      >
        <div className="container-x">
          <SectionHeading
            eyebrow="Architecture"
            id="arch-title"
            title="One monorepo. One package per concern."
            description="The web app serves the UI, the REST API, and the MCP server from one process. Adapters plug in through a shared contract."
          />

          <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
              {architecture.map((node, index) => (
                <li key={node.id} className="surface rounded-2xl p-6">
                  <p className="flex items-center justify-between">
                    <code className="font-mono text-sm text-accent">{node.name}</code>
                    <span className="font-mono text-xs text-mist/60">0{index + 1}</span>
                  </p>
                  <p className="mt-3 text-[0.95rem] leading-7 text-mist">{node.description}</p>
                </li>
              ))}
            </ol>

            <div className="surface flex flex-col rounded-3xl p-7 lg:col-span-5">
              <h3 className="text-sm font-semibold text-paper">Adapter packages</h3>
              <p className="mt-2 text-sm leading-6 text-mist">
                Each data source lives in its own package. Add one, and the UI and MCP pick it up.
              </p>
              <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {adapters.map((adapter) => (
                  <li key={adapter.id}>
                    <code className="block rounded-lg bg-ink/60 px-3 py-2 font-mono text-[0.78rem] text-mist-2 ring-1 ring-inset ring-white/[0.07]">
                      @dash/adapter-{adapter.id}
                    </code>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-accent/[0.07] p-4 ring-1 ring-inset ring-accent/20">
                <GitPullRequest className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                <p className="text-sm leading-6 text-mist-2">
                  Want to add one? Read{" "}
                  <a
                    href={site.contributing}
                    className="font-medium text-paper underline-offset-4 hover:underline"
                  >
                    CONTRIBUTING.md
                  </a>{" "}
                  and open a pull request.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Clone it. Run it. Make it yours."
        description="Dash is free to self-host under the MIT license. When you want someone else to run it, Dash Cloud is one click away."
      />
    </>
  );
}
