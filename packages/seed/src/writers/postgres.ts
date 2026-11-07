import type { PostgresConnectionConfig } from "@dash/core";
import { postgresPoolConfig } from "@dash/adapter-postgres";
import pg from "pg";
import { SEED_NAME, SEED_VERSION } from "../company.ts";
import { sqlNamespace } from "../plan.ts";
import { IDENTIFIER, type SeedColumn, type SeedDomain, type SeedDomainKey, type SeedTable } from "../table.ts";
import {
  ForeignNamespaceError,
  MANIFEST,
  OWNER_NOTE,
  RowCountError,
  isNullable,
  manifestRow,
  throwIfAborted,
  type InspectResult,
  type SeedWriter,
  type TableResult,
  type WriteOptions,
} from "./types.ts";

/** Postgres accepts 65,535 bind parameters in one statement. */
const MAX_PARAMETERS = 60_000;

export function quote(identifier: string): string {
  if (!IDENTIFIER.test(identifier)) throw new Error(`Unsafe identifier: ${identifier}`);
  return `"${identifier}"`;
}

function literal(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function sqlType(column: SeedColumn): string {
  switch (column.type) {
    case "string":
      return "text";
    case "integer":
      return "integer";
    case "decimal":
      return `numeric(18, ${column.scale ?? 2})`;
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "timestamp":
      return "timestamptz";
    case "json":
      return "jsonb";
  }
}

function value(column: SeedColumn, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  // pg turns a JS array into a Postgres array, so JSON goes in as text.
  if (column.type === "json") return JSON.stringify(raw);
  return raw;
}

type Queryable = Pick<pg.PoolClient, "query">;

async function inspectWith(client: Queryable, schema: string): Promise<InspectResult> {
  const present = await client.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = $1", [schema]);
  if (present.rowCount === 0) return { state: "absent", conflicts: [] };
  const manifest = await client.query("SELECT to_regclass($1) AS name", [`${quote(schema)}.${quote(MANIFEST)}`]);
  if (!manifest.rows[0]?.name) return { state: "foreign", conflicts: [schema] };
  const owner = await client.query(`SELECT seed FROM ${quote(schema)}.${quote(MANIFEST)} LIMIT 1`);
  return owner.rows[0]?.seed === SEED_NAME ? { state: "owned", conflicts: [] } : { state: "foreign", conflicts: [schema] };
}

async function createTable(client: Queryable, schema: string, table: SeedTable): Promise<void> {
  const target = `${quote(schema)}.${quote(table.name)}`;
  const columns = table.columns.map((column) => `${quote(column.name)} ${sqlType(column)}${isNullable(column) ? "" : " NOT NULL"}`);
  await client.query(`CREATE TABLE ${target} (${columns.join(", ")})`);
  await client.query(`COMMENT ON TABLE ${target} IS ${literal(table.description)}`);
  for (const column of table.columns) {
    await client.query(`COMMENT ON COLUMN ${target}.${quote(column.name)} IS ${literal(column.description)}`);
  }
}

async function insertRows(client: Queryable, schema: string, table: SeedTable, signal: AbortSignal | undefined): Promise<void> {
  const target = `${quote(schema)}.${quote(table.name)}`;
  const names = table.columns.map((column) => quote(column.name)).join(", ");
  const width = table.columns.length;
  const batch = Math.max(1, Math.min(2000, Math.floor(MAX_PARAMETERS / width)));
  for (let start = 0; start < table.rows.length; start += batch) {
    throwIfAborted(signal);
    const rows = table.rows.slice(start, start + batch);
    const values: unknown[] = [];
    const tuples = rows.map((row, rowIndex) => {
      const slots = table.columns.map((column, columnIndex) => {
        values.push(value(column, row[column.name]));
        return `$${rowIndex * width + columnIndex + 1}`;
      });
      return `(${slots.join(", ")})`;
    });
    await client.query(`INSERT INTO ${target} (${names}) VALUES ${tuples.join(", ")}`, values);
  }
}

export class PostgresSeedWriter implements SeedWriter {
  readonly kind = "postgres" as const;
  readonly #pool: pg.Pool;

  constructor(config: PostgresConnectionConfig) {
    this.#pool = new pg.Pool({ ...postgresPoolConfig(config), max: 2, application_name: "dash-seed" });
  }

  namespace(domain: SeedDomainKey): string {
    return sqlNamespace(domain);
  }

  async inspect(domain: Pick<SeedDomain, "key">): Promise<InspectResult> {
    return inspectWith(this.#pool, sqlNamespace(domain.key));
  }

  async replace(domain: SeedDomain, options: WriteOptions): Promise<TableResult[]> {
    const schema = sqlNamespace(domain.key);
    const client = await this.#pool.connect();
    const results: TableResult[] = [];
    try {
      await client.query("BEGIN");
      // Two runs at once must not both see an absent schema.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`dash-seed:${schema}`]);
      const state = await inspectWith(client, schema);
      if (state.state === "foreign") throw new ForeignNamespaceError(`Schema ${schema}`, state.conflicts);
      if (state.state === "owned") await client.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
      await client.query(`CREATE SCHEMA ${quote(schema)}`);
      await client.query(`COMMENT ON SCHEMA ${quote(schema)} IS ${literal(`${OWNER_NOTE} ${domain.label}.`)}`);
      for (const table of domain.tables) {
        throwIfAborted(options.signal);
        await createTable(client, schema, table);
        await insertRows(client, schema, table, options.signal);
        const target = `${quote(schema)}.${quote(table.name)}`;
        if (table.primaryKey?.length) {
          await client.query(`ALTER TABLE ${target} ADD PRIMARY KEY (${table.primaryKey.map(quote).join(", ")})`);
        }
        for (const [index, columns] of (table.indexes ?? []).entries()) {
          await client.query(`CREATE INDEX ${quote(`${table.name}_idx_${index + 1}`)} ON ${target} (${columns.map(quote).join(", ")})`);
        }
        const count = await client.query(`SELECT count(*)::int AS n FROM ${target}`);
        const actual = Number(count.rows[0]?.n ?? -1);
        if (actual !== table.rows.length) throw new RowCountError(`${schema}.${table.name}`, table.rows.length, actual);
        results.push({ table: table.name, rows: actual });
        options.onTable?.(table.name, actual);
      }
      const manifest = manifestRow(domain, options, SEED_VERSION, SEED_NAME);
      await client.query(
        `CREATE TABLE ${quote(schema)}.${quote(MANIFEST)} (seed text NOT NULL, version integer NOT NULL, domain text NOT NULL, tables jsonb NOT NULL, size text NOT NULL, as_of date NOT NULL, written_at timestamptz NOT NULL)`,
      );
      await client.query(`COMMENT ON TABLE ${quote(schema)}.${quote(MANIFEST)} IS ${literal(OWNER_NOTE)}`);
      await client.query(
        `INSERT INTO ${quote(schema)}.${quote(MANIFEST)} (seed, version, domain, tables, size, as_of, written_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [manifest.seed, manifest.version, manifest.domain, JSON.stringify(manifest.tables), manifest.size, manifest.as_of, manifest.written_at],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await this.#pool.query(`ANALYZE ${domain.tables.map((table) => `${quote(schema)}.${quote(table.name)}`).join(", ")}`).catch(() => undefined);
    return results;
  }

  async remove(domain: SeedDomainKey): Promise<boolean> {
    const schema = sqlNamespace(domain);
    const state = await this.inspect({ key: domain });
    if (state.state === "absent") return false;
    if (state.state === "foreign") throw new ForeignNamespaceError(`Schema ${schema}`, state.conflicts);
    await this.#pool.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
    return true;
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
