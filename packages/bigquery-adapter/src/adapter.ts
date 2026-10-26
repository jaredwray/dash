import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type BigQueryConnectionConfig,
  type ConnectionTestResult,
  type DataAdapter,
  QueryValidationError,
  assertIdentifier,
} from "@dash/core";
import { createBigQueryClient, type BigQueryClient, type BigQueryQueryResult } from "./http.ts";
import {
  assertLocation,
  assertProjectId,
  compileSelect,
  introspectSql,
  type BigQuerySqlContext,
} from "./sql.ts";

export type { BigQueryClient, BigQueryQueryResult };

function cell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) {
    return row[key];
  }
  const match = Object.keys(row).find((candidate) => candidate.toLowerCase() === key);
  return match ? row[match] : undefined;
}

function contextFor(config: BigQueryConnectionConfig): BigQuerySqlContext {
  return {
    projectId: assertProjectId(config.projectId),
    ...(config.dataset ? { dataset: assertIdentifier(config.dataset, "dataset") } : {}),
  };
}

export function assertBigQueryConfig(config: BigQueryConnectionConfig): void {
  assertProjectId(config.projectId);
  if (config.dataset) {
    assertIdentifier(config.dataset, "dataset");
  }
  if (config.location) {
    assertLocation(config.location);
  }
  if (config.apiEndpoint !== undefined && config.apiEndpoint.trim() === "") {
    throw new QueryValidationError("BigQuery API endpoint is invalid");
  }
  if (config.credentials) {
    const email = config.credentials.client_email.trim();
    if (!email.includes("@") || email.length > 320) {
      throw new QueryValidationError("BigQuery service account client_email is invalid");
    }
    if (!config.credentials.private_key.includes("PRIVATE KEY")) {
      throw new QueryValidationError("BigQuery service account private_key is invalid");
    }
  }
}

function clientFromConfig(config: BigQueryConnectionConfig): BigQueryClient {
  assertBigQueryConfig(config);
  return createBigQueryClient({
    projectId: config.projectId,
    ...(config.dataset ? { dataset: config.dataset } : {}),
    ...(config.location ? { location: config.location } : {}),
    ...(config.apiEndpoint ? { apiEndpoint: config.apiEndpoint } : {}),
    ...(config.credentials ? { credentials: config.credentials } : {}),
  });
}

export class BigQueryAdapter implements DataAdapter {
  readonly kind = "bigquery" as const;
  #client: BigQueryClient;
  #context: BigQuerySqlContext;

  constructor(client: BigQueryClient, context: BigQuerySqlContext) {
    this.#client = client;
    this.#context = context;
  }

  static fromConfig(config: BigQueryConnectionConfig): BigQueryAdapter {
    return new BigQueryAdapter(clientFromConfig(config), contextFor(config));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.#client.query("SELECT 1 AS ok", [], 10_000);
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: "Connected to BigQuery",
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
    const datasets = this.#context.dataset
      ? [this.#context.dataset]
      : await this.#client.listDatasets();
    const resources = new Map<string, AdapterSchema["resources"][number]>();
    for (const dataset of datasets) {
      const result = await this.#client.query(introspectSql(this.#context.projectId, dataset));
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
          nullable: String(cell(row, "is_nullable")).toUpperCase() !== "NO",
        });
      }
    }
    return { kind: "bigquery", resources: [...resources.values()] };
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    const compiled = compileSelect(input, this.#context);
    const result = await this.#client.query(compiled.text, compiled.params);
    const columns =
      result.fields.length > 0
        ? result.fields.map((field) => ({
            name: field.name,
            type: field.type,
            nullable: field.mode !== "REQUIRED",
          }))
        : result.rows[0]
          ? Object.keys(result.rows[0]).map((name) => ({
              name,
              type: "unknown",
              nullable: true,
            }))
          : [];
    return {
      columns,
      rows: result.rows,
      rowCount: result.rows.length,
      truncated: result.rows.length === compiled.limit,
    };
  }

  async close(): Promise<void> {
    await this.#client.end();
  }
}

export function createBigQueryAdapter(config: BigQueryConnectionConfig): BigQueryAdapter {
  return BigQueryAdapter.fromConfig(config);
}
