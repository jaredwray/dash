import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  type MysqlConnectionConfig,
} from "@dash/core";
import { createPool, type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";
import { INTROSPECT_SQL, compileSelect } from "./sql.ts";

export interface SqlQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string }>;
}

export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<SqlQueryResult>;
  end(): Promise<void>;
}

export interface ParsedMysqlUri {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
}

const MAX_URI_LENGTH = 2048;

function sslFromSearch(params: URLSearchParams): boolean | undefined {
  const raw = params.get("ssl") ?? params.get("ssl-mode") ?? params.get("sslMode");
  if (raw == null || raw === "") {
    return undefined;
  }
  const normalized = raw.trim().toUpperCase();
  if (
    normalized === "FALSE" ||
    normalized === "0" ||
    normalized === "DISABLED" ||
    normalized === "DISABLE"
  ) {
    return false;
  }
  if (
    normalized === "TRUE" ||
    normalized === "1" ||
    normalized === "REQUIRED" ||
    normalized === "PREFERRED" ||
    normalized === "VERIFY_CA" ||
    normalized === "VERIFY_IDENTITY"
  ) {
    return true;
  }
  throw new Error("Invalid MySQL SSL option");
}

export function parseMysqlConnectionString(connectionString: string): ParsedMysqlUri {
  if (!connectionString || connectionString.length > MAX_URI_LENGTH) {
    throw new Error("MySQL connection string is invalid");
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid MySQL connection string");
  }
  if (url.protocol !== "mysql:") {
    throw new Error("MySQL connection string must use the mysql:// scheme");
  }
  const pathname = url.pathname.replace(/^\//, "");
  if (pathname.includes("/")) {
    throw new Error("MySQL connection string can include one database");
  }
  let database: string | undefined;
  if (pathname) {
    try {
      database = decodeURIComponent(pathname);
    } catch {
      throw new Error("MySQL database name is invalid");
    }
  }
  const port = url.port ? Number(url.port) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("MySQL port is invalid");
  }
  return {
    host: url.hostname || undefined,
    port,
    database: database || undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ssl: sslFromSearch(url.searchParams),
  };
}

function usesSsl(config: MysqlConnectionConfig, parsed?: ParsedMysqlUri): boolean {
  return Boolean(config.ssl || parsed?.ssl);
}

type MysqlPoolOptions = Omit<PoolOptions, "ssl"> & {
  ssl?: true | PoolOptions["ssl"];
};

function toPoolConfig(config: MysqlConnectionConfig): MysqlPoolOptions {
  const parsed = config.connectionString
    ? parseMysqlConnectionString(config.connectionString)
    : undefined;
  return {
    host: parsed?.host ?? config.host,
    port: parsed?.port ?? config.port ?? 3306,
    database: parsed?.database ?? config.database,
    user: parsed?.user ?? config.user,
    password: parsed?.password ?? config.password,
    connectionLimit: 5,
    connectTimeout: 10_000,
    waitForConnections: true,
    dateStrings: true,
    supportBigNumbers: true,
    flags: ["-LOCAL_FILES"],
    ssl: usesSsl(config, parsed) ? true : undefined,
  };
}

function createMysqlPool(options: MysqlPoolOptions): Pool {
  const { ssl, ...rest } = options;
  return createPool({
    ...rest,
    ssl:
      ssl === true
        ? { minVersion: "TLSv1.2", verifyIdentity: true }
        : ssl,
  });
}

function wrapPool(pool: Pool): SqlClient {
  return {
    async query(text, values) {
      const [rows, fields] = await pool.query<RowDataPacket[]>(text, values);
      return {
        rows: rows as Record<string, unknown>[],
        fields: Array.isArray(fields)
          ? fields.map((field) => ({ name: field.name }))
          : undefined,
      };
    },
    async end() {
      await pool.end();
    },
  };
}

export class MysqlAdapter implements DataAdapter {
  readonly kind = "mysql" as const;
  #client: SqlClient;

  constructor(client: SqlClient) {
    this.#client = client;
  }

  static fromConfig(config: MysqlConnectionConfig): MysqlAdapter {
    return new MysqlAdapter(wrapPool(createMysqlPool(toPoolConfig(config))));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.#client.query("SELECT 1 AS ok");
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: "Connected to MySQL",
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
    return { kind: "mysql", resources: [...resources.values()] };
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

export function createMysqlAdapter(config: MysqlConnectionConfig): MysqlAdapter {
  return MysqlAdapter.fromConfig(config);
}
