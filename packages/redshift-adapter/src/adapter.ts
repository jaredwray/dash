import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  QueryValidationError,
  type RedshiftConnectionConfig,
  normalizeAdapterQuery,
} from "@dash/core";
import pg from "pg";
import { type RedshiftTlsMode, redshiftSession } from "./connection.ts";
import { INTROSPECT_SQL, compileSelect } from "./sql.ts";

const QUERY_TIMEOUT_MS = 60_000;
const MAX_PAGE = 10_000;
const INTROSPECT_CAP = 10_000;

const TYPE_NAMES: Record<number, string> = {
  16: "boolean",
  20: "bigint",
  21: "smallint",
  23: "integer",
  25: "text",
  700: "real",
  701: "double precision",
  1043: "character varying",
  1082: "date",
  1114: "timestamp",
  1184: "timestamptz",
  1700: "numeric",
  2950: "uuid",
};

export interface SqlQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string; dataTypeID?: number }>;
}

export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<SqlQueryResult>;
  end(): Promise<void>;
}

function tlsOptions(mode: RedshiftTlsMode): pg.PoolConfig["ssl"] {
  if (mode === "off") {
    return undefined;
  }
  const secure = { rejectUnauthorized: true, minVersion: "TLSv1.2" as const };
  if (mode === "verify-full") {
    return secure;
  }
  // require and verify-ca check the certificate chain and skip the host name,
  // so a CNAME or VPC endpoint can still present the Amazon certificate.
  return { ...secure, checkServerIdentity: () => undefined };
}

function typeParsers(): pg.CustomTypesConfig {
  const overrides = new pg.TypeOverrides();
  const keepText = (value: string) => value;
  for (const oid of [
    pg.types.builtins.DATE,
    pg.types.builtins.TIME,
    pg.types.builtins.TIMETZ,
    pg.types.builtins.TIMESTAMP,
    pg.types.builtins.TIMESTAMPTZ,
    pg.types.builtins.INTERVAL,
  ]) {
    overrides.setTypeParser(oid, keepText);
  }
  return {
    getTypeParser: (oid, format) => overrides.getTypeParser(oid, format),
  };
}

function toPoolConfig(config: RedshiftConnectionConfig): pg.PoolConfig {
  const session = redshiftSession(config);
  return {
    host: session.host,
    port: session.port,
    database: session.database,
    user: session.user,
    ...(session.password !== undefined ? { password: session.password } : {}),
    ssl: tlsOptions(session.tls),
    max: 5,
    connectionTimeoutMillis: 10_000,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    types: typeParsers(),
  };
}

function columnType(dataTypeID?: number): string {
  if (dataTypeID === undefined) {
    return "unknown";
  }
  return TYPE_NAMES[dataTypeID] ?? "unknown";
}

function assertBind(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    value instanceof Date ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new QueryValidationError(
    "Redshift filter values must be scalar values, dates, or binary data",
  );
}

function wrapPool(pool: pg.Pool): SqlClient {
  return {
    async query(text, values) {
      const binds = (values ?? []).map(assertBind);
      const result = await pool.query(text, binds);
      return { rows: result.rows as Record<string, unknown>[], fields: result.fields };
    },
    async end() {
      await pool.end();
    },
  };
}

export class RedshiftAdapter implements DataAdapter {
  readonly kind = "redshift" as const;
  #client: SqlClient;

  constructor(client: SqlClient) {
    this.#client = client;
  }

  static fromConfig(config: RedshiftConnectionConfig): RedshiftAdapter {
    const pool = new pg.Pool(toPoolConfig(config));
    // Idle clients emit error. Without a listener Node crashes the process.
    pool.on("error", () => undefined);
    return new RedshiftAdapter(wrapPool(pool));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.#client.query("SELECT 1 AS ok");
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: "Connected to Amazon Redshift",
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
    if (result.rows.length > INTROSPECT_CAP) {
      throw new Error("Redshift schema introspection exceeded 10000 columns");
    }
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
    return { kind: "redshift", resources: [...resources.values()] };
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    const normalized = normalizeAdapterQuery(input);
    const limit = normalized.limit ?? MAX_PAGE;
    const lookAhead = limit < MAX_PAGE;
    const compiled = compileSelect({
      ...input,
      limit: lookAhead ? limit + 1 : limit,
      offset: normalized.offset,
    });
    const result = await this.#client.query(compiled.text, compiled.values);
    const extra = lookAhead && result.rows.length > limit;
    const rows = extra ? result.rows.slice(0, limit) : result.rows;
    const columns =
      result.fields?.map((field) => ({
        name: field.name,
        type: columnType(field.dataTypeID),
        nullable: true,
      })) ??
      (rows[0]
        ? Object.keys(rows[0]).map((name) => ({
            name,
            type: "unknown",
            nullable: true,
          }))
        : []);
    return {
      columns,
      rows,
      rowCount: rows.length,
      truncated: extra || (!lookAhead && rows.length === limit),
    };
  }

  async close(): Promise<void> {
    await this.#client.end();
  }
}

export function createRedshiftAdapter(config: RedshiftConnectionConfig): RedshiftAdapter {
  return RedshiftAdapter.fromConfig(config);
}
