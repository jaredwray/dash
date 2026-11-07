import type { BigQueryConnectionConfig } from "@dash/core";
import {
  BigQueryUploadUnsupportedError,
  assertBigQueryConfig,
  bigQueryEndpoint,
  createBigQueryClient,
  isGoogleApiHost,
  type BigQueryAdminClient,
  type BigQueryTableField,
} from "@dash/adapter-bigquery";
import { SEED_NAME, SEED_VERSION } from "../company.ts";
import { sqlNamespace } from "../plan.ts";
import { IDENTIFIER, type SeedColumn, type SeedDomain, type SeedDomainKey, type SeedTable } from "../table.ts";
import {
  ForeignNamespaceError,
  MANIFEST,
  OWNER_NOTE,
  RowCountError,
  manifestRow,
  throwIfAborted,
  type InspectResult,
  type SeedWriter,
  type TableResult,
  type WriteOptions,
} from "./types.ts";

const INSERT_BATCH = 500;

function fieldType(column: SeedColumn): string {
  switch (column.type) {
    case "string":
    case "json":
      return "STRING";
    case "integer":
      return "INT64";
    case "decimal":
      return "FLOAT64";
    case "boolean":
      return "BOOL";
    case "date":
      return "DATE";
    case "timestamp":
      return "TIMESTAMP";
  }
}

export function bigQuerySchema(table: Pick<SeedTable, "columns">): BigQueryTableField[] {
  return table.columns.map((column) => ({
    name: column.name,
    type: fieldType(column),
    mode: column.nullable ? "NULLABLE" : "REQUIRED",
    description: column.description,
  }));
}

/** A row in the JSON form that load jobs and streaming inserts accept. */
export function toBigQueryRow(table: Pick<SeedTable, "columns">, row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const column of table.columns) {
    const raw = row[column.name];
    if (raw === null || raw === undefined) {
      result[column.name] = null;
    } else if (column.type === "json") {
      result[column.name] = JSON.stringify(raw);
    } else if (raw instanceof Date) {
      result[column.name] = raw.toISOString();
    } else {
      result[column.name] = raw;
    }
  }
  return result;
}

const MANIFEST_TABLE: Pick<SeedTable, "columns"> = {
  columns: [
    { name: "seed", type: "string", description: "Seed name." },
    { name: "version", type: "integer", description: "Seed version." },
    { name: "domain", type: "string", description: "Domain key." },
    { name: "tables", type: "json", description: "Tables that the seeder owns." },
    { name: "size", type: "string", description: "Dataset size." },
    { name: "as_of", type: "date", description: "First day after the data ends." },
    { name: "written_at", type: "timestamp", description: "Write time." },
  ],
};

export class BigQuerySeedWriter implements SeedWriter {
  readonly kind = "bigquery" as const;
  readonly #client: BigQueryAdminClient;
  readonly #projectId: string;
  readonly #googleApi: boolean;
  #streaming = false;

  constructor(config: BigQueryConnectionConfig) {
    assertBigQueryConfig(config);
    this.#projectId = config.projectId;
    this.#googleApi = isGoogleApiHost(bigQueryEndpoint(config.apiEndpoint));
    // No default dataset: the seeder names each dataset.
    this.#client = createBigQueryClient({
      projectId: config.projectId,
      ...(config.location ? { location: config.location } : {}),
      ...(config.apiEndpoint ? { apiEndpoint: config.apiEndpoint } : {}),
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  }

  namespace(domain: SeedDomainKey): string {
    return sqlNamespace(domain);
  }

  /** A quoted table path. The project id passed assertBigQueryConfig. */
  #table(dataset: string, table: string): string {
    if (!IDENTIFIER.test(dataset) || !IDENTIFIER.test(table)) throw new Error(`Unsafe BigQuery name: ${dataset}.${table}`);
    return `\`${this.#projectId}.${dataset}.${table}\``;
  }

  /**
   * Reads the manifest of a dataset. A table that has a seed name but is not
   * in the manifest is a conflict. Other tables are left alone.
   */
  async #ownership(dataset: string, names: readonly string[]): Promise<InspectResult & { tables: string[] }> {
    const found = await this.#client.getDataset(dataset);
    if (!found) return { state: "absent", conflicts: [], tables: [] };
    if (!(await this.#client.getTable(dataset, MANIFEST))) return { state: "foreign", conflicts: [dataset], tables: [] };
    // Read the manifest row. Emulators do not always keep table descriptions.
    const owner = await this.#client.query(`SELECT seed, tables FROM ${this.#table(dataset, MANIFEST)} LIMIT 1`, [], 30_000);
    if (owner.rows[0]?.seed !== SEED_NAME) return { state: "foreign", conflicts: [dataset], tables: [] };
    let tables: string[] = [];
    try {
      const parsed: unknown = JSON.parse(String(owner.rows[0]?.tables ?? "[]"));
      if (Array.isArray(parsed)) tables = parsed.map(String);
    } catch {
      tables = [];
    }
    const conflicts = (await this.#client.listTables(dataset))
      .filter((name) => names.includes(name) && !tables.includes(name))
      .map((name) => `${dataset}.${name}`);
    return conflicts.length > 0 ? { state: "foreign", conflicts, tables } : { state: "owned", conflicts: [], tables };
  }

  async inspect(domain: Pick<SeedDomain, "key" | "tables">): Promise<InspectResult> {
    const { state, conflicts } = await this.#ownership(sqlNamespace(domain.key), domain.tables.map((table) => table.name));
    return { state, conflicts };
  }

  async #write(dataset: string, table: Pick<SeedTable, "name" | "description" | "columns">, rows: Record<string, unknown>[], signal?: AbortSignal): Promise<void> {
    const schema = bigQuerySchema(table);
    const converted = rows.map((row) => toBigQueryRow(table, row));
    if (!this.#streaming) {
      try {
        await this.#client.loadRows(dataset, table.name, { schema, description: table.description, rows: converted });
        return;
      } catch (error) {
        if (this.#googleApi || !(error instanceof BigQueryUploadUnsupportedError)) throw error;
        // A local emulator without upload support: use streaming inserts from now on.
        this.#streaming = true;
      }
    }
    await this.#client.deleteTable(dataset, table.name);
    await this.#client.createTable(dataset, table.name, { schema, description: table.description });
    for (let start = 0; start < converted.length; start += INSERT_BATCH) {
      throwIfAborted(signal);
      await this.#client.insertRows(dataset, table.name, converted.slice(start, start + INSERT_BATCH), `${table.name}_${start}`);
    }
  }

  async replace(domain: SeedDomain, options: WriteOptions): Promise<TableResult[]> {
    const dataset = sqlNamespace(domain.key);
    const names = domain.tables.map((table) => table.name);
    const state = await this.#ownership(dataset, names);
    if (state.state === "foreign") throw new ForeignNamespaceError(`Dataset ${dataset}`, state.conflicts);
    if (state.state === "absent") {
      await this.#client.createDataset(dataset, { description: `${OWNER_NOTE} ${domain.label}.` });
    }
    const manifest = manifestRow(domain, options, SEED_VERSION, SEED_NAME);
    const manifestTable = { name: MANIFEST, description: OWNER_NOTE, columns: MANIFEST_TABLE.columns };
    // Claim the old and new tables first, so a failed run can be retried or removed.
    await this.#write(dataset, manifestTable, [{ ...manifest, tables: [...new Set([...state.tables, ...names])] }]);

    const results: TableResult[] = [];
    for (const table of domain.tables) {
      throwIfAborted(options.signal);
      await this.#write(dataset, table, table.rows, options.signal);
      const counted = await this.#client.query(`SELECT COUNT(*) AS n FROM ${this.#table(dataset, table.name)}`, [], 60_000);
      const actual = Number(counted.rows[0]?.n ?? -1);
      if (actual !== table.rows.length) throw new RowCountError(`${dataset}.${table.name}`, table.rows.length, actual);
      results.push({ table: table.name, rows: actual });
      options.onTable?.(table.name, actual);
    }
    // Drop tables that an earlier seed version wrote and this one does not.
    for (const name of state.tables.filter((table) => !names.includes(table))) {
      await this.#client.deleteTable(dataset, name);
    }
    await this.#write(dataset, manifestTable, [manifest]);
    return results;
  }

  async remove(domain: SeedDomainKey): Promise<boolean> {
    const dataset = sqlNamespace(domain);
    const state = await this.#ownership(dataset, []);
    if (state.state === "absent") return false;
    if (state.state === "foreign") throw new ForeignNamespaceError(`Dataset ${dataset}`, state.conflicts);
    for (const name of [...state.tables, MANIFEST]) {
      await this.#client.deleteTable(dataset, name);
    }
    // Drop the dataset only when nothing else is in it.
    if ((await this.#client.listTables(dataset)).length === 0) {
      await this.#client.deleteDataset(dataset);
    }
    return true;
  }

  async close(): Promise<void> {
    await this.#client.end();
  }
}
