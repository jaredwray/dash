import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  type SnowflakeConnectionConfig,
} from "@dash/core";
import { createConnection } from "snowflake-sdk";
import type { Binds, Connection, ConnectionOptions } from "snowflake-sdk";
import { INTROSPECT_SQL, compileSelect } from "./sql.ts";

export interface SqlQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string }>;
}

export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<SqlQueryResult>;
  end(): Promise<void>;
}

function firstPathSegments(pathname: string): string[] {
  return pathname.replace(/^\/+/, "").split("/").filter(Boolean);
}

export function parseSnowflakeConnectionString(
  connectionString: string,
): Partial<SnowflakeConnectionConfig> {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid Snowflake connection string");
  }
  if (url.protocol !== "snowflake:") {
    throw new Error("Snowflake connection string must use the snowflake:// scheme");
  }
  const path = firstPathSegments(url.pathname);
  return {
    account: url.hostname || undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: path[0] ?? url.searchParams.get("database") ?? undefined,
    schema: path[1] ?? url.searchParams.get("schema") ?? undefined,
    warehouse: url.searchParams.get("warehouse") ?? undefined,
    role: url.searchParams.get("role") ?? undefined,
    authenticator: url.searchParams.get("authenticator") ?? undefined,
  };
}

export function toConnectionOptions(
  config: SnowflakeConnectionConfig,
): ConnectionOptions {
  const parsed = config.connectionString
    ? parseSnowflakeConnectionString(config.connectionString)
    : {};
  const account = parsed.account ?? config.account;
  const username = parsed.user ?? config.user;
  if (!account || !username) {
    throw new Error("Snowflake account and user are required");
  }
  return {
    account,
    username,
    password: parsed.password ?? config.password,
    warehouse: parsed.warehouse ?? config.warehouse,
    database: parsed.database ?? config.database,
    schema: parsed.schema ?? config.schema,
    role: parsed.role ?? config.role,
    authenticator: parsed.authenticator ?? config.authenticator,
    application: "Dash",
  };
}

function toBinds(values: unknown[] | undefined): Binds | undefined {
  if (!values) {
    return undefined;
  }
  return values.map((value) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  });
}

function clientFromConfig(config: SnowflakeConnectionConfig): SqlClient {
  let inner: SqlClient | undefined;
  return {
    async query(text, values) {
      if (!inner) {
        inner = wrapConnection(createConnection(toConnectionOptions(config)));
      }
      return inner.query(text, values);
    },
    async end() {
      if (inner) {
        await inner.end();
      }
    },
  };
}

function wrapConnection(connection: Connection): SqlClient {
  let connected = false;
  return {
    async query(text, values) {
      if (!connected) {
        await connection.connectAsync();
        connected = true;
      }
      return await new Promise((resolve, reject) => {
        connection.execute({
          sqlText: text,
          binds: toBinds(values),
          rowMode: "object",
          complete: (err, stmt, rows) => {
            if (err) {
              reject(err);
              return;
            }
            resolve({
              rows: (rows ?? []) as Record<string, unknown>[],
              fields: stmt.getColumns()?.map((column) => ({ name: column.getName() })),
            });
          },
        });
      });
    },
    async end() {
      if (!connected) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        connection.destroy((err) => {
          if (err) {
            reject(err);
            return;
          }
          connected = false;
          resolve();
        });
      });
    },
  };
}

function cell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) {
    return row[key];
  }
  return row[key.toUpperCase()];
}

export class SnowflakeAdapter implements DataAdapter {
  readonly kind = "snowflake" as const;
  #client: SqlClient;

  constructor(client: SqlClient) {
    this.#client = client;
  }

  static fromConfig(config: SnowflakeConnectionConfig): SnowflakeAdapter {
    return new SnowflakeAdapter(clientFromConfig(config));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.#client.query('SELECT 1 AS "ok"');
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: "Connected to Snowflake",
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  async introspectSchema(): Promise<AdapterSchema> {
    const result = await this.#client.query(INTROSPECT_SQL);
    const resources = new Map<string, AdapterSchema["resources"][number]>();
    for (const row of result.rows) {
      const namespace = String(cell(row, "namespace"));
      const name = String(cell(row, "name"));
      const key = `${namespace}.${name}`;
      let resource = resources.get(key);
      if (!resource) {
        const tableType = String(cell(row, "table_type") ?? "BASE TABLE");
        resource = {
          name,
          namespace,
          kind: tableType.toUpperCase().includes("VIEW") ? "view" : "table",
          columns: [],
        };
        resources.set(key, resource);
      }
      resource.columns.push({
        name: String(cell(row, "column_name")),
        type: String(cell(row, "data_type")),
        nullable: String(cell(row, "is_nullable")).toUpperCase() === "YES",
      });
    }
    return { kind: "snowflake", resources: [...resources.values()] };
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    const compiled = compileSelect(input);
    const result = await this.#client.query(compiled.text, compiled.values);
    const columns =
      result.fields?.map((field) => ({
        name: field.name,
        type: "unknown",
        nullable: true,
      })) ??
      (result.rows[0]
        ? Object.keys(result.rows[0]).map((name) => ({
            name,
            type: "unknown",
            nullable: true,
          }))
        : []);
    return {
      columns,
      rows: result.rows,
      rowCount: result.rows.length,
      truncated: result.rows.length === (input.limit ?? 1000),
    };
  }

  async close(): Promise<void> {
    await this.#client.end();
  }
}

export function createSnowflakeAdapter(
  config: SnowflakeConnectionConfig,
): SnowflakeAdapter {
  return SnowflakeAdapter.fromConfig(config);
}
