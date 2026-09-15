import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DataSourceRecord } from "@dash/core";
import { api } from "~/lib/api";
import { Field, GhostButton, PrimaryButton, Select, TextInput } from "~/components/ui";
import { fetchMe } from "~/lib/session";

export const Route = createFileRoute("/_authed/data-sources")({
  component: DataSourcesPage,
});

function DataSourcesPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const sources = useQuery({
    queryKey: ["data-sources"],
    queryFn: async () => {
      const payload = await api<{ dataSources: DataSourceRecord[] }>("/api/data-sources");
      return payload.dataSources;
    },
  });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"demo" | "postgres">("postgres");
  const [name, setName] = useState("Production Postgres");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("analytics");
  const [user, setUser] = useState("postgres");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const config =
        kind === "demo"
          ? { kind: "demo" as const }
          : {
              kind: "postgres" as const,
              host,
              port: Number(port),
              database,
              user,
              password,
              ssl,
            };
      return api<{ dataSource: DataSourceRecord }>("/api/data-sources", {
        method: "POST",
        body: JSON.stringify({ name, description: "", config }),
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not add data source");
    },
  });

  const isAdmin = me.data?.role === "admin";

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-mist">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold">Data sources</h1>
          <p className="mt-2 max-w-2xl text-sm text-mist">
            Postgres is available now. MySQL, MongoDB, and BigQuery adapters will plug into the
            same contract.
          </p>
        </div>
        {isAdmin ? (
          <PrimaryButton type="button" onClick={() => setOpen(true)}>
            Add source
          </PrimaryButton>
        ) : null}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {(sources.data ?? []).map((source) => (
          <article key={source.id} className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{source.name}</h2>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs uppercase tracking-wide text-mist">
                {source.kind}
              </span>
            </div>
            <p className="mt-2 text-sm text-mist">{source.description || "No description"}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {Object.entries(source.summary).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-mist">{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
            {isAdmin && source.kind !== "demo" ? (
              <GhostButton
                className="mt-4"
                type="button"
                onClick={async () => {
                  await api(`/api/data-sources/${source.id}`, { method: "DELETE" });
                  await queryClient.invalidateQueries({ queryKey: ["data-sources"] });
                }}
              >
                Remove
              </GhostButton>
            ) : null}
          </article>
        ))}
      </div>
      {open ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4">
          <form
            className="w-full max-w-lg space-y-3 rounded-3xl border border-line bg-panel p-6"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <h2 className="text-lg font-semibold">Add data source</h2>
            <Field label="Name">
              <TextInput value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Kind">
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value as "demo" | "postgres")}
              >
                <option value="postgres">PostgreSQL</option>
                <option value="demo">Sample warehouse</option>
              </Select>
            </Field>
            {kind === "postgres" ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Host">
                    <TextInput value={host} onChange={(event) => setHost(event.target.value)} />
                  </Field>
                  <Field label="Port">
                    <TextInput value={port} onChange={(event) => setPort(event.target.value)} />
                  </Field>
                  <Field label="Database">
                    <TextInput
                      value={database}
                      onChange={(event) => setDatabase(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="User">
                  <TextInput value={user} onChange={(event) => setUser(event.target.value)} />
                </Field>
                <Field label="Password">
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-mist">
                  <input
                    type="checkbox"
                    checked={ssl}
                    onChange={(event) => setSsl(event.target.checked)}
                  />
                  Use SSL
                </label>
              </>
            ) : null}
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <GhostButton type="button" onClick={() => setOpen(false)}>
                Cancel
              </GhostButton>
              <PrimaryButton type="submit" disabled={create.isPending}>
                {create.isPending ? "Testing…" : "Save source"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
