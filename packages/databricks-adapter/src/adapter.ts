import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  type DatabricksConnectionConfig,
  QueryValidationError,
  assertIdentifier,
} from "@dash/core";
import {
  assertWorkspaceHost,
  createDatabricksClient,
  databricksOrigin,
  formatHost,
  isLoopbackHost,
  type DatabricksClient,
  type DatabricksQueryResult,
} from "./http.ts";
import {
  compileSelect,
  INTROSPECT_ROW_CAP,
  introspectSql,
  type DatabricksSqlContext,
} from "./sql.ts";

export type { DatabricksClient, DatabricksQueryResult };

const HTTP_PATH = /^\/sql\/1\.0\/(?:warehouses|endpoints)\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})$/;
const TOKEN = /^[A-Za-z0-9._~+/=-]+$/;
const KNOWN_PARAMS = new Set(["catalog", "schema", "endpoint", "apiEndpoint"]);
const CONNECTION_STRING_MAX = 16_384;

export interface ParsedDatabricksConnection {
  host?: string;
  httpPath?: string;
  token?: string;
  catalog?: string;
  schema?: string;
  apiEndpoint?: string;
}

export interface DatabricksSessionOptions {
  host: string;
  warehouseId: string;
  token: string;
  origin: URL;
  catalog?: string;
  schema?: string;
}

export function assertHttpPath(httpPath: string): string {
  const match = HTTP_PATH.exec(httpPath);
  if (!match?.[1]) {
    throw new QueryValidationError(
      "Databricks SQL HTTP path must be /sql/1.0/warehouses/{id} or /sql/1.0/endpoints/{id}",
    );
  }
  return match[1];
}

export function assertToken(token: string | undefined): string {
  if (!token) {
    throw new QueryValidationError("Databricks SQL token is required");
  }
  if (token.length > 4096) {
    throw new QueryValidationError("Databricks SQL token is too long");
  }
  if (!TOKEN.test(token)) {
    throw new QueryValidationError("Databricks SQL token contains unsupported characters");
  }
  return token;
}

function decodeUserinfo(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new QueryValidationError("Databricks SQL connection string has an invalid percent-encoding");
  }
}

function firstText(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

export function parseDatabricksConnectionString(connectionString: string): ParsedDatabricksConnection {
  const raw = connectionString.trim();
  if (!raw) {
    throw new QueryValidationError("Databricks SQL connection string is required");
  }
  if (raw.length > CONNECTION_STRING_MAX) {
    throw new QueryValidationError("Databricks SQL connection string is too long");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new QueryValidationError("Invalid Databricks SQL connection string");
  }
  if (url.protocol !== "databricks:") {
    throw new QueryValidationError("Databricks SQL connection string must use the databricks:// scheme");
  }
  const username = url.username ? decodeUserinfo(url.username) : "";
  if (username && username !== "token") {
    throw new QueryValidationError("Databricks SQL connection string user must be token");
  }
  for (const key of url.searchParams.keys()) {
    if (!KNOWN_PARAMS.has(key)) {
      throw new QueryValidationError(`Unsupported Databricks SQL connection parameter: ${key}`);
    }
  }
  if (url.searchParams.has("endpoint") && url.searchParams.has("apiEndpoint")) {
    throw new QueryValidationError("Databricks SQL connection string has both endpoint and apiEndpoint");
  }
  const endpointParam = (
    url.searchParams.get("endpoint") ?? url.searchParams.get("apiEndpoint")
  )?.trim();
  const host = url.hostname ? assertWorkspaceHost(url.hostname) : undefined;
  let apiEndpoint = endpointParam || undefined;
  if (!apiEndpoint && host && url.port) {
    const protocol = isLoopbackHost(host) ? "http" : "https";
    apiEndpoint = `${protocol}://${formatHost(host)}:${url.port}`;
  }
  return {
    host,
    httpPath: url.pathname && url.pathname !== "/" ? url.pathname : undefined,
    token: url.password ? decodeUserinfo(url.password) : undefined,
    catalog: url.searchParams.get("catalog")?.trim() || undefined,
    schema: url.searchParams.get("schema")?.trim() || undefined,
    apiEndpoint,
  };
}

export function toConnectionOptions(config: DatabricksConnectionConfig): DatabricksSessionOptions {
  const parsed = config.connectionString
    ? parseDatabricksConnectionString(config.connectionString)
    : {};
  const host = assertWorkspaceHost(firstText(config.host, parsed.host) ?? "");
  const warehouseId = assertHttpPath(firstText(config.httpPath, parsed.httpPath) ?? "");
  const token = assertToken(firstText(config.token, parsed.token));
  const catalogValue = firstText(config.catalog, parsed.catalog);
  const schemaValue = firstText(config.schema, parsed.schema);
  const catalog = catalogValue ? assertIdentifier(catalogValue, "catalog") : undefined;
  const schema = schemaValue ? assertIdentifier(schemaValue, "schema") : undefined;
  const origin = databricksOrigin(firstText(config.apiEndpoint, parsed.apiEndpoint), host);
  return {
    host,
    warehouseId,
    token,
    origin,
    ...(catalog ? { catalog } : {}),
    ...(schema ? { schema } : {}),
  };
}

function blankSummary(): Record<string, string> {
  return { host: "", warehouse: "", catalog: "", schema: "", endpoint: "" };
}

function safeHost(value: string | undefined): string {
  if (!value) {
    return "";
  }
  try {
    return assertWorkspaceHost(value);
  } catch {
    return "";
  }
}

function safeWarehouse(value: string | undefined): string {
  if (!value) {
    return "";
  }
  try {
    return assertHttpPath(value);
  } catch {
    return "";
  }
}

function safeIdent(value: string | undefined, label: string): string {
  if (!value) {
    return "";
  }
  try {
    return assertIdentifier(value, label);
  } catch {
    return "";
  }
}

function partialSummary(config: DatabricksConnectionConfig): Record<string, string> {
  let parsed: ParsedDatabricksConnection = {};
  if (config.connectionString) {
    try {
      parsed = parseDatabricksConnectionString(config.connectionString);
    } catch {
      parsed = {};
    }
  }
  const host = safeHost(firstText(config.host, parsed.host));
  let endpoint = host;
  try {
    endpoint = databricksOrigin(firstText(config.apiEndpoint, parsed.apiEndpoint), host).host;
  } catch {
    endpoint = host;
  }
  return {
    host,
    warehouse: safeWarehouse(firstText(config.httpPath, parsed.httpPath)),
    catalog: safeIdent(firstText(config.catalog, parsed.catalog), "catalog"),
    schema: safeIdent(firstText(config.schema, parsed.schema), "schema"),
    endpoint,
  };
}

export function databricksPublicSummary(
  config: DatabricksConnectionConfig,
): Record<string, string> {
  try {
    const options = toConnectionOptions(config);
    return {
      host: options.host,
      warehouse: options.warehouseId,
      catalog: options.catalog ?? "",
      schema: options.schema ?? "",
      endpoint: options.origin.host,
    };
  } catch {
    try {
      return partialSummary(config);
    } catch {
      return blankSummary();
    }
  }
}

function contextFor(options: DatabricksSessionOptions): DatabricksSqlContext | undefined {
  if (!options.catalog) {
    return undefined;
  }
  return {
    catalog: options.catalog,
    ...(options.schema ? { schema: options.schema } : {}),
  };
}

const CANONICAL_TYPES: Record<string, string> = {
  INTEGER: "INT",
  INT4: "INT",
  INT8: "BIGINT",
  BIGINT: "BIGINT",
  SMALLINT: "SMALLINT",
  TINYINT: "TINYINT",
  VARCHAR: "STRING",
  TEXT: "STRING",
  STRING: "STRING",
  BPCHAR: "STRING",
  DOUBLE: "DOUBLE",
  FLOAT8: "DOUBLE",
  FLOAT4: "FLOAT",
  FLOAT: "FLOAT",
  REAL: "FLOAT",
  BOOLEAN: "BOOLEAN",
  BOOL: "BOOLEAN",
  DECIMAL: "DECIMAL",
  NUMERIC: "DECIMAL",
  DATE: "DATE",
  TIMESTAMP: "TIMESTAMP",
};

function cell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) {
    return row[key];
  }
  const match = Object.keys(row).find((candidate) => candidate.toLowerCase() === key);
  return match ? row[match] : undefined;
}

function textCell(row: Record<string, unknown>, key: string): string | undefined {
  const value = cell(row, key);
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value;
}

function canonicalType(raw: string): string {
  const base = raw.trim().toUpperCase().replace(/\(.*/, "").trim();
  return CANONICAL_TYPES[base] ?? raw;
}

function isView(tableType: string): boolean {
  const normalized = tableType.trim().toUpperCase();
  return normalized === "VIEW" || normalized.endsWith(" VIEW");
}

export class DatabricksAdapter implements DataAdapter {
  readonly kind = "databricks" as const;
  #client: DatabricksClient;
  #context: DatabricksSqlContext | undefined;

  constructor(client: DatabricksClient, context: DatabricksSqlContext | undefined) {
    this.#client = client;
    this.#context = context;
  }

  static fromConfig(config: DatabricksConnectionConfig): DatabricksAdapter {
    const options = toConnectionOptions(config);
    return new DatabricksAdapter(createDatabricksClient(options), contextFor(options));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.#client.query("SELECT 1 AS ok", [], 10_000);
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: "Connected to Databricks SQL",
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
    if (!this.#context) {
      throw new QueryValidationError("Databricks SQL catalog is required to introspect");
    }
    const result = await this.#client.query(introspectSql(this.#context.catalog, this.#context.schema));
    if (result.rows.length > INTROSPECT_ROW_CAP) {
      throw new QueryValidationError(
        "Databricks SQL introspection returned too many columns; set a schema on the connection",
      );
    }
    const resources = new Map<string, AdapterSchema["resources"][number]>();
    for (const row of result.rows) {
      const namespace = textCell(row, "namespace");
      const name = textCell(row, "name");
      const columnName = textCell(row, "column_name");
      if (!namespace || !name || !columnName) {
        continue;
      }
      const key = `${namespace}.${name}`;
      let resource = resources.get(key);
      if (!resource) {
        const tableType = textCell(row, "table_type") ?? "BASE TABLE";
        resource = {
          name,
          namespace,
          kind: isView(tableType) ? "view" : "table",
          columns: [],
        };
        resources.set(key, resource);
      }
      const nullableFlag = cell(row, "is_nullable");
      resource.columns.push({
        name: columnName,
        type: canonicalType(textCell(row, "data_type") ?? "STRING"),
        nullable: String(nullableFlag ?? "YES").toUpperCase() !== "NO",
      });
    }
    return { kind: "databricks", resources: [...resources.values()] };
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    if (!this.#context) {
      throw new QueryValidationError("Databricks SQL catalog is required");
    }
    const compiled = compileSelect(input, this.#context);
    const result = await this.#client.query(compiled.text, compiled.params);
    const rows = result.rows.slice(0, compiled.limit);
    const truncated = compiled.lookAhead
      ? result.rows.length > compiled.limit
      : rows.length === compiled.limit;
    const columns =
      result.fields.length > 0
        ? result.fields.map((field) => ({
            name: field.name,
            type: field.type,
            nullable: field.nullable,
          }))
        : rows[0]
          ? Object.keys(rows[0]).map((name) => ({
              name,
              type: "unknown",
              nullable: true,
            }))
          : [];
    return {
      columns,
      rows,
      rowCount: rows.length,
      truncated,
    };
  }

  async close(): Promise<void> {
    await this.#client.end();
  }
}

export function createDatabricksAdapter(config: DatabricksConnectionConfig): DatabricksAdapter {
  return DatabricksAdapter.fromConfig(config);
}
