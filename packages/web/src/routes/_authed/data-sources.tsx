import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Dashboard, DataSourceRecord } from "@dash/core";
import { api } from "~/lib/api";
import { parseBigQueryUri } from "~/lib/bigquery-uri";
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

function serviceAccountCredentials(raw: string):
  | { client_email: string; private_key: string }
  | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Service account JSON is invalid");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Service account JSON must include client_email and private_key");
  }
  const record = parsed as { client_email?: unknown; private_key?: unknown };
  if (typeof record.client_email !== "string" || typeof record.private_key !== "string") {
    throw new Error("Service account JSON must include client_email and private_key");
  }
  return { client_email: record.client_email, private_key: record.private_key };
}

export const Route = createFileRoute("/_authed/data-sources")({
  component: DataSourcesPage,
});

type SourceKind =
  | "postgres"
  | "mysql"
  | "snowflake"
  | "mongodb"
  | "bigquery"
  | "databricks"
  | "redshift";

const URI_PLACEHOLDER: Record<SourceKind, string> = {
  postgres: "postgres://user:password@localhost:5432/analytics",
  mysql: "mysql://user:password@localhost:3306/analytics",
  redshift: "redshift://user:password@cluster.redshift.amazonaws.com:5439/analytics?sslmode=require",
  snowflake: "snowflake://user:password@account/database/schema?warehouse=COMPUTE_WH",
  mongodb: "mongodb://user:password@host:27017/analytics?authSource=admin",
  bigquery: "bigquery://project/dataset?location=US&endpoint=http://127.0.0.1:9059",
  databricks:
    "databricks://token:dapi000@adb-000.0.azuredatabricks.net/sql/1.0/warehouses/abc?catalog=main&schema=default",
};

function sslFromRedshiftUri(value: string): boolean | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    const ssl = url.searchParams.get("ssl")?.toLowerCase();
    const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslmode === "disable" || ssl === "false" || ssl === "0") {
      return false;
    }
    if (
      sslmode === "require" ||
      sslmode === "verify-ca" ||
      sslmode === "verify-full" ||
      ssl === "true" ||
      ssl === "1"
    ) {
      return true;
    }
    return true;
  } catch {
    return undefined;
  }
}

function ConnectionUriField({
  kind,
  value,
  onChange,
}: {
  kind: SourceKind;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Connection URI">
      <TextArea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={URI_PLACEHOLDER[kind]}
        required
        rows={3}
        spellCheck={false}
        autoComplete="off"
        className="min-h-16 font-mono"
      />
    </Field>
  );
}

function ConnectionModeToggle({
  usingUri,
  onChange,
}: {
  usingUri: boolean;
  onChange: (usingUri: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="text-sm text-accent hover:underline"
      onClick={() => onChange(!usingUri)}
    >
      {usingUri ? "Enter fields instead" : "Paste a connection URI instead"}
    </button>
  );
}

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
  tls: false,
  authSource: "admin",
  connectionString: "",
  useConnectionString: true,
  account: "",
  warehouse: "",
  schema: "PUBLIC",
  role: "",
  projectId: "",
  bqDataset: "",
  location: "",
  apiEndpoint: "",
  serviceAccountJson: "",
  httpPath: "",
  token: "",
  catalog: "",
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
        form.kind === "bigquery"
          ? {
              kind: "bigquery" as const,
              ...(form.useConnectionString
                ? parseBigQueryUri(form.connectionString)
                : {
                    projectId: form.projectId.trim(),
                    dataset: form.bqDataset.trim() || undefined,
                    location: form.location.trim() || undefined,
                    apiEndpoint: form.apiEndpoint.trim() || undefined,
                  }),
              credentials: serviceAccountCredentials(form.serviceAccountJson),
            }
          : form.kind === "snowflake"
            ? form.useConnectionString
              ? {
                  kind: "snowflake" as const,
                  connectionString: form.connectionString.trim(),
                }
              : {
                  kind: "snowflake" as const,
                  account: form.account,
                  user: form.user,
                  password: form.password,
                  warehouse: form.warehouse,
                  database: form.database,
                  schema: form.schema,
                  role: form.role || undefined,
                }
            : form.kind === "mongodb"
              ? form.useConnectionString
                ? {
                    kind: "mongodb" as const,
                    connectionString: form.connectionString.trim(),
                    database: form.database.trim() || undefined,
                    tls: form.tls,
                  }
                : {
                    kind: "mongodb" as const,
                    host: form.host,
                    port: Number(form.port),
                    database: form.database,
                    user: form.user || undefined,
                    password: form.password || undefined,
                    authSource: form.user ? form.authSource || "admin" : undefined,
                    tls: form.tls,
                  }
              : form.kind === "mysql"
                ? form.useConnectionString
                  ? {
                      kind: "mysql" as const,
                      connectionString: form.connectionString.trim(),
                      ssl: form.ssl,
                    }
                  : {
                      kind: "mysql" as const,
                      host: form.host,
                      port: Number(form.port),
                      database: form.database,
                      user: form.user,
                      password: form.password,
                      ssl: form.ssl,
                    }
                : form.kind === "redshift"
                  ? form.useConnectionString
                    ? {
                        kind: "redshift" as const,
                        connectionString: form.connectionString.trim(),
                        ssl: form.ssl,
                      }
                    : {
                        kind: "redshift" as const,
                        host: form.host,
                        port: Number(form.port),
                        database: form.database,
                        user: form.user,
                        password: form.password,
                        ssl: form.ssl,
                      }
                  : form.kind === "databricks"
                    ? form.useConnectionString
                      ? {
                          kind: "databricks" as const,
                          connectionString: form.connectionString.trim(),
                        }
                      : {
                          kind: "databricks" as const,
                          host: form.host.trim(),
                          httpPath: form.httpPath.trim(),
                          token: form.token,
                          catalog: form.catalog.trim(),
                          schema: form.schema.trim() || undefined,
                          apiEndpoint: form.apiEndpoint.trim() || undefined,
                        }
                : form.useConnectionString
                  ? {
                      kind: "postgres" as const,
                      connectionString: form.connectionString.trim(),
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
            Paste a connection URI, or enter the fields. Postgres, MySQL, Snowflake, MongoDB,
            BigQuery, Databricks SQL, and Redshift are tested on save.
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
            Add a PostgreSQL, MySQL, Snowflake, MongoDB, BigQuery, Databricks SQL, or Redshift connection to start querying.
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
            className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl border border-line bg-panel p-6"
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
                onChange={(event) => {
                  const kind = event.target.value as SourceKind;
                  const enteringDatabricks = kind === "databricks" && form.kind !== "databricks";
                  setForm({
                    ...form,
                    kind,
                    connectionString: "",
                    ssl: kind === "redshift",
                    port:
                      kind === "mongodb"
                        ? "27017"
                        : kind === "postgres"
                          ? "5432"
                          : kind === "mysql"
                            ? "3306"
                            : kind === "redshift"
                              ? "5439"
                              : form.port,
                    user: kind === "postgres" ? "postgres" : form.user === "postgres" ? "" : form.user,
                    schema:
                      kind === "snowflake"
                        ? form.schema || "PUBLIC"
                        : enteringDatabricks
                          ? form.schema === "public" || form.schema === "PUBLIC" || !form.schema
                            ? "default"
                            : form.schema
                          : form.schema,
                    host: enteringDatabricks && form.host.trim() === "localhost" ? "" : form.host,
                    apiEndpoint: kind === form.kind ? form.apiEndpoint : "",
                    authSource: form.authSource || "admin",
                    useConnectionString: true,
                  });
                }}
              >
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="redshift">Amazon Redshift</option>
                <option value="snowflake">Snowflake</option>
                <option value="mongodb">MongoDB</option>
                <option value="bigquery">Google BigQuery</option>
                <option value="databricks">Databricks SQL</option>
              </Select>
            </Field>
            {form.kind === "postgres" || form.kind === "mysql" || form.kind === "redshift" ? (
              <>
                {form.useConnectionString ? (
                  <ConnectionUriField
                    kind={form.kind}
                    value={form.connectionString}
                    onChange={(connectionString) => {
                      if (form.kind !== "redshift") {
                        setForm({ ...form, connectionString });
                        return;
                      }
                      const ssl = sslFromRedshiftUri(connectionString);
                      setForm({
                        ...form,
                        connectionString,
                        ...(ssl === undefined ? {} : { ssl }),
                      });
                    }}
                  />
                ) : null}
                <ConnectionModeToggle
                  usingUri={form.useConnectionString}
                  onChange={(useConnectionString) => setForm({ ...form, useConnectionString })}
                />
                {form.useConnectionString ? null : (
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
                  {form.kind === "redshift"
                    ? "Require SSL and verify the server certificate"
                    : "Use SSL"}
                </label>
              </>
            ) : form.kind === "snowflake" ? (
              <>
                {form.useConnectionString ? (
                  <ConnectionUriField
                    kind="snowflake"
                    value={form.connectionString}
                    onChange={(connectionString) => setForm({ ...form, connectionString })}
                  />
                ) : null}
                <ConnectionModeToggle
                  usingUri={form.useConnectionString}
                  onChange={(useConnectionString) => setForm({ ...form, useConnectionString })}
                />
                {form.useConnectionString ? null : (
                  <>
                    <Field label="Account">
                      <TextInput
                        value={form.account}
                        onChange={(event) => setForm({ ...form, account: event.target.value })}
                        placeholder="xy12345.us-east-1"
                        required
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Warehouse">
                        <TextInput
                          value={form.warehouse}
                          onChange={(event) =>
                            setForm({ ...form, warehouse: event.target.value })
                          }
                          placeholder="COMPUTE_WH"
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
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Schema">
                        <TextInput
                          value={form.schema}
                          onChange={(event) =>
                            setForm({ ...form, schema: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Role">
                        <TextInput
                          value={form.role}
                          onChange={(event) => setForm({ ...form, role: event.target.value })}
                          placeholder="Optional"
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
              </>
            ) : form.kind === "mongodb" ? (
              <>
                {form.useConnectionString ? (
                  <>
                    <ConnectionUriField
                      kind="mongodb"
                      value={form.connectionString}
                      onChange={(connectionString) => setForm({ ...form, connectionString })}
                    />
                    <Field label="Database">
                      <TextInput
                        value={form.database}
                        onChange={(event) =>
                          setForm({ ...form, database: event.target.value })
                        }
                        placeholder="Required when the URI has no database"
                      />
                    </Field>
                  </>
                ) : null}
                <ConnectionModeToggle
                  usingUri={form.useConnectionString}
                  onChange={(useConnectionString) => setForm({ ...form, useConnectionString })}
                />
                {form.useConnectionString ? null : (
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
                        placeholder="Optional"
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
                    <Field label="Auth database">
                      <TextInput
                        value={form.authSource}
                        onChange={(event) =>
                          setForm({ ...form, authSource: event.target.value })
                        }
                        placeholder="admin"
                      />
                    </Field>
                  </>
                )}
                <label className="flex items-center gap-2 text-sm text-mist">
                  <input
                    type="checkbox"
                    checked={form.tls}
                    onChange={(event) => setForm({ ...form, tls: event.target.checked })}
                  />
                  Use TLS
                </label>
              </>
            ) : form.kind === "bigquery" ? (
              <>
                {form.useConnectionString ? (
                  <ConnectionUriField
                    kind="bigquery"
                    value={form.connectionString}
                    onChange={(connectionString) => setForm({ ...form, connectionString })}
                  />
                ) : (
                  <>
                    <Field label="Project ID">
                      <TextInput
                        value={form.projectId}
                        onChange={(event) => setForm({ ...form, projectId: event.target.value })}
                        placeholder="my-gcp-project"
                        required
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Dataset">
                        <TextInput
                          value={form.bqDataset}
                          onChange={(event) => setForm({ ...form, bqDataset: event.target.value })}
                          placeholder="analytics"
                        />
                      </Field>
                      <Field label="Location">
                        <TextInput
                          value={form.location}
                          onChange={(event) => setForm({ ...form, location: event.target.value })}
                          placeholder="US"
                        />
                      </Field>
                    </div>
                    <Field label="API endpoint">
                      <TextInput
                        value={form.apiEndpoint}
                        onChange={(event) => setForm({ ...form, apiEndpoint: event.target.value })}
                        placeholder="http://127.0.0.1:9059 for the local emulator"
                      />
                    </Field>
                  </>
                )}
                <ConnectionModeToggle
                  usingUri={form.useConnectionString}
                  onChange={(useConnectionString) => setForm({ ...form, useConnectionString })}
                />
                <Field label="Service account JSON">
                  <TextArea
                    value={form.serviceAccountJson}
                    onChange={(event) =>
                      setForm({ ...form, serviceAccountJson: event.target.value })
                    }
                    placeholder="Optional. Leave empty for the emulator or Application Default Credentials."
                  />
                </Field>
              </>
            ) : form.kind === "databricks" ? (
              <>
                {form.useConnectionString ? (
                  <ConnectionUriField
                    kind="databricks"
                    value={form.connectionString}
                    onChange={(connectionString) => setForm({ ...form, connectionString })}
                  />
                ) : (
                  <>
                    <Field label="Host">
                      <TextInput
                        value={form.host}
                        onChange={(event) => setForm({ ...form, host: event.target.value })}
                        placeholder="adb-000.0.azuredatabricks.net"
                        required
                      />
                    </Field>
                    <Field label="HTTP path">
                      <TextInput
                        value={form.httpPath}
                        onChange={(event) => setForm({ ...form, httpPath: event.target.value })}
                        placeholder="/sql/1.0/warehouses/abc"
                        required
                        spellCheck={false}
                        autoComplete="off"
                        className="font-mono"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Catalog">
                        <TextInput
                          value={form.catalog}
                          onChange={(event) => setForm({ ...form, catalog: event.target.value })}
                          placeholder="main"
                          required
                        />
                      </Field>
                      <Field label="Schema">
                        <TextInput
                          value={form.schema}
                          onChange={(event) => setForm({ ...form, schema: event.target.value })}
                          placeholder="default, or analytics on the local cluster"
                        />
                      </Field>
                    </div>
                    <Field label="API endpoint">
                      <TextInput
                        value={form.apiEndpoint}
                        onChange={(event) => setForm({ ...form, apiEndpoint: event.target.value })}
                        placeholder="http://127.0.0.1:14439"
                      />
                      <p className="text-xs text-mist">
                        Leave this empty for a Databricks workspace. For the local cluster, set the host to
                        127.0.0.1 and the schema to analytics.
                      </p>
                    </Field>
                    <Field label="Access token">
                      <TextInput
                        type="password"
                        value={form.token}
                        onChange={(event) => setForm({ ...form, token: event.target.value })}
                        required
                        autoComplete="off"
                      />
                    </Field>
                  </>
                )}
                <ConnectionModeToggle
                  usingUri={form.useConnectionString}
                  onChange={(useConnectionString) => setForm({ ...form, useConnectionString })}
                />
              </>
            ) : null}
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <GhostButton type="button" onClick={() => setOpen(false)}>
                Cancel
              </GhostButton>
              <PrimaryButton type="submit" disabled={create.isPending || !form.name.trim()}>
                {create.isPending ? "Testing connection…" : "Add data source"}
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
