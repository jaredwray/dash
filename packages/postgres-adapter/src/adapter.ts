import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  type PostgresConnectionConfig,
} from "@dash/core";
import pg from "pg";
import { INTROSPECT_SQL, compileSelect } from "./sql.ts";

export interface SqlQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string; dataTypeID?: number }>;
}

export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<SqlQueryResult>;
  end(): Promise<void>;
}

function toPoolConfig(config: PostgresConnectionConfig): pg.PoolConfig {
  if (config.connectionString) {
    return {
      connectionString: config.connectionString,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    };
  }
  return {
    host: config.host,
    port: config.port ?? 5432,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  };
}

function wrapPool(pool: pg.Pool): SqlClient {
  return {
    async query(text, values) {
      const result = await pool.query(text, values);
      return { rows: result.rows as Record<string, unknown>[], fields: result.fields };
    },
    async end() {
      await pool.end();
    },
  };
}

export class PostgresAdapter implements DataAdapter {
  readonly kind = "postgres" as const;
  #client: SqlClient;

  constructor(client: SqlClient) {
    this.#client = client;
  }

  static fromConfig(config: PostgresConnectionConfig): PostgresAdapter {
    const pool = new pg.Pool(toPoolConfig(config));
    return new PostgresAdapter(wrapPool(pool));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.#client.query("SELECT 1 AS ok");
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: "Connected to PostgreSQL",
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
    const resources = new Map<
      string,
      AdapterSchema["resources"][number]
    >();
    for (const row of result.rows) {
      const namespace = String(row.namespace);
      const name = String(row.name);
      const key = `${namespace}.${name}`;
      let resource = resources.get(key);
      if (!resource) {
        const tableType = String(row.table_type ?? "BASE TABLE");
        resource = {
          name,
          namespace,
          kind: tableType.includes("VIEW") ? "view" : "table",
          columns: [],
        };
        resources.set(key, resource);
      }
      resource.columns.push({
        name: String(row.column_name),
        type: String(row.data_type),
        nullable: String(row.is_nullable).toUpperCase() === "YES",
      });
    }
    return { kind: "postgres", resources: [...resources.values()] };
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

export function createPostgresAdapter(
  config: PostgresConnectionConfig,
): PostgresAdapter {
  return PostgresAdapter.fromConfig(config);
}
