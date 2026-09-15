import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="text-sm font-semibold tracking-[0.2em] uppercase text-accent">Dash</div>
        <div className="flex gap-3">
          <Link to="/login" className="rounded-xl px-4 py-2 text-sm text-mist hover:text-paper">
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink"
          >
            Create workspace
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col justify-center py-16">
        <p className="text-sm uppercase tracking-[0.22em] text-accent-2">AI-first analytics</p>
        <h1 className="mt-4 max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight md:text-6xl">
          The modern workspace for charts, tables, and dashboards you can generate.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-mist">
          Connect warehouses, compose dashboard pages, and let agents build with Dash MCP.
          Start with the sample warehouse or attach Postgres.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-ink"
          >
            Open the demo
            <ArrowRight size={16} />
          </Link>
          <a
            href="https://github.com/jaredwray/dash"
            className="rounded-xl border border-line px-5 py-3 text-sm text-paper"
          >
            View the repo
          </a>
        </div>
        <dl className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            ["Beautiful charts", "Apache ECharts with a Dash theme, driven by a JSON spec agents can write."],
            ["One TypeScript codebase", "TanStack Start serves the UX, REST API, and MCP from the same app."],
            ["Adapter-ready", "A typed DataAdapter contract. Postgres ships now; MySQL, Mongo, BigQuery next."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-line bg-panel/80 p-5">
              <dt className="font-medium">{title}</dt>
              <dd className="mt-2 text-sm text-mist">{body}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
