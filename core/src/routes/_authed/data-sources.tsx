import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Dashboard, DataSourceRecord } from "@dash/core";
import { api } from "~/lib/api";
import {
  DangerButton,
  Field,
  GhostButton,
  PrimaryButton,
  Select,
  TextArea,
  TextInput,
} from "~/components/ui";
import { fetchMe } from "~/lib/session";

export const Route = createFileRoute("/_authed/data-sources")({
  component: DataSourcesPage,
});

type SourceKind = "demo" | "postgres";

const emptyForm = {
  name: "",
  description: "",
  kind: "postgres" as SourceKind,
  host: "localhost",
  port: "5432",
  database: "",
  user: "postgres",
  password: "",
  ssl: false,
  connectionString: "",
  useConnectionString: false,
};

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
  const dashboards = useQuery({
    queryKey: ["dashboards"],
    queryFn: async () => {
      const payload = await api<{ dashboards: Dashboard[] }>("/api/dashboards");
      return payload.dashboards;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DataSourceRecord | null>(null);

  const isAdmin = me.data?.role === "admin";

  const create = useMutation({
    mutationFn: async () => {
      const config =
        form.kind === "demo"
          ? { kind: "demo" as const }
          : form.useConnectionString
            ? {
                kind: "postgres" as const,
                connectionString: form.connectionString,
                ssl: form.ssl,
              }
            : {
                kind: "postgres" as const,
                host: form.host,
                port: Number(form.port),
                database: form.database,
                user: form.user,
                password: form.password,
                ssl: form.ssl,
              };
      return api<{ dataSource: DataSourceRecord }>("/api/data-sources", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          config,
        }),
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyForm);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not add data source");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api(`/api/data-sources/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });

  function usageCount(sourceId: string): number {
    return (dashboards.data ?? []).reduce(
      (count, dashboard) =>
        count + dashboard.widgets.filter((widget) => widget.dataSourceId === sourceId).length,
      0,
    );
  }

  function openAdd() {
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-mist">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold">Data sources</h1>
          <p className="mt-2 max-w-2xl text-sm text-mist">
            Add a warehouse for dashboards and MCP, or remove one that is no longer needed.
            Postgres is tested on save. Use Sample warehouse when you do not have a database yet.
          </p>
        </div>
        {isAdmin ? (
          <PrimaryButton type="button" onClick={openAdd}>
            Add data source
          </PrimaryButton>
        ) : (
          <p className="text-sm text-mist">Only administrators can add or remove sources.</p>
        )}
      </div>

      {sources.isLoading ? (
        <p className="mt-8 text-mist">Loading data sources…</p>
      ) : (sources.data?.length ?? 0) === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="text-paper">No data sources yet.</p>
          <p className="mt-2 text-sm text-mist">
            Add a sample warehouse or a PostgreSQL connection to start querying.
          </p>
          {isAdmin ? (
            <PrimaryButton className="mt-4" type="button" onClick={openAdd}>
              Add data source
            </PrimaryButton>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {(sources.data ?? []).map((source) => {
            const widgets = usageCount(source.id);
            return (
              <article key={source.id} className="flex flex-col rounded-2xl border border-line bg-panel p-5">
                <div className="flex items-center justify-between gap-3">
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
                      <dd className="truncate">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-mist">
                  {widgets === 0
                    ? "Not used on any dashboard"
                    : `Used by ${widgets} widget${widgets === 1 ? "" : "s"}`}
                </p>
                {isAdmin ? (
                  <DangerButton
                    className="mt-4 self-start"
                    type="button"
                    onClick={() => setPendingDelete(source)}
                  >
                    Remove
                  </DangerButton>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

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
              <TextInput
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Production analytics"
                required
              />
            </Field>
            <Field label="Description">
              <TextArea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What this warehouse is for"
              />
            </Field>
            <Field label="Kind">
              <Select
                value={form.kind}
                onChange={(event) =>
                  setForm({ ...form, kind: event.target.value as SourceKind })
                }
              >
                <option value="postgres">PostgreSQL</option>
                <option value="demo">Sample warehouse</option>
              </Select>
            </Field>
            {form.kind === "postgres" ? (
              <>
                <label className="flex items-center gap-2 text-sm text-mist">
                  <input
                    type="checkbox"
                    checked={form.useConnectionString}
                    onChange={(event) =>
                      setForm({ ...form, useConnectionString: event.target.checked })
                    }
                  />
                  Use a connection string
                </label>
                {form.useConnectionString ? (
                  <Field label="Connection string">
                    <TextInput
                      value={form.connectionString}
                      onChange={(event) =>
                        setForm({ ...form, connectionString: event.target.value })
                      }
                      placeholder="postgres://user:pass@host:5432/analytics"
                      required
                    />
                  </Field>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Host">
                        <TextInput
                          value={form.host}
                          onChange={(event) => setForm({ ...form, host: event.target.value })}
                          required
                        />
                      </Field>
                      <Field label="Port">
                        <TextInput
                          value={form.port}
                          onChange={(event) => setForm({ ...form, port: event.target.value })}
                          required
                        />
                      </Field>
                      <Field label="Database">
                        <TextInput
                          value={form.database}
                          onChange={(event) =>
                            setForm({ ...form, database: event.target.value })
                          }
                          required
                        />
                      </Field>
                    </div>
                    <Field label="User">
                      <TextInput
                        value={form.user}
                        onChange={(event) => setForm({ ...form, user: event.target.value })}
                        required
                      />
                    </Field>
                    <Field label="Password">
                      <TextInput
                        type="password"
                        value={form.password}
                        onChange={(event) =>
                          setForm({ ...form, password: event.target.value })
                        }
                      />
                    </Field>
                  </>
                )}
                <label className="flex items-center gap-2 text-sm text-mist">
                  <input
                    type="checkbox"
                    checked={form.ssl}
                    onChange={(event) => setForm({ ...form, ssl: event.target.checked })}
                  />
                  Use SSL
                </label>
              </>
            ) : (
              <p className="text-sm text-mist">
                Sample warehouse uses built-in product analytics. No database required.
              </p>
            )}
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <GhostButton type="button" onClick={() => setOpen(false)}>
                Cancel
              </GhostButton>
              <PrimaryButton type="submit" disabled={create.isPending || !form.name.trim()}>
                {create.isPending
                  ? form.kind === "postgres"
                    ? "Testing connection…"
                    : "Saving…"
                  : "Add data source"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
            <h2 className="text-lg font-semibold">Remove data source</h2>
            <p className="mt-2 text-sm text-mist">
              Remove <span className="text-paper">{pendingDelete.name}</span>? Dashboards that
              query it will fail until you point those widgets at another source.
              {usageCount(pendingDelete.id) > 0
                ? ` ${usageCount(pendingDelete.id)} widget(s) currently use it.`
                : ""}
            </p>
            {remove.isError ? (
              <p className="mt-3 text-sm text-rose-300">
                {remove.error instanceof Error ? remove.error.message : "Remove failed"}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <GhostButton type="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </GhostButton>
              <DangerButton
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(pendingDelete.id)}
              >
                {remove.isPending ? "Removing…" : "Remove source"}
              </DangerButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
