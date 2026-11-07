import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "@dash/adapter-postgres";
import { generateDataset } from "../generate.ts";
import { NOT_READY, POSTGRES_ADMIN_DATABASE, postgresConfig, uniqueName } from "../test-clusters.ts";
import { PostgresSeedWriter } from "./postgres.ts";
import { ForeignNamespaceError } from "./types.ts";

const AS_OF = new Date("2026-11-01T00:00:00.000Z");
const dataset = generateDataset({ asOf: AS_OF, size: "small" });
const options = { size: "small", asOf: AS_OF };
// A fresh database per run, because adapter tests list every schema in `dash`.
const database = uniqueName("dash_seed");
const admin = new pg.Client({ ...postgresConfig(POSTGRES_ADMIN_DATABASE) });
let writer: PostgresSeedWriter;
let target: pg.Client;

async function schemas(): Promise<string[]> {
  const result = await target.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'fernway_%' ORDER BY 1");
  return result.rows.map((row) => String(row.schema_name));
}

beforeAll(async () => {
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(NOT_READY("PostgreSQL"), { cause: error });
  }
  await admin.query(`CREATE DATABASE ${database}`);
  writer = new PostgresSeedWriter(postgresConfig(database));
  target = new pg.Client(postgresConfig(database));
  await target.connect();
});

afterAll(async () => {
  await writer?.close();
  await target?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.end();
});

describe("PostgresSeedWriter", () => {
  it("writes every domain, and Dash reads a mart through the adapter", async () => {
    for (const domain of dataset.domains) {
      expect(await writer.inspect(domain)).toEqual({ state: "absent", conflicts: [] });
      const results = await writer.replace(domain, options);
      expect(results).toEqual(domain.tables.map((table) => ({ table: table.name, rows: table.rows.length })));
      expect((await writer.inspect(domain)).state).toBe("owned");
    }
    expect(await schemas()).toEqual(dataset.domains.map((domain) => `fernway_${domain.key}`).sort());

    const adapter = PostgresAdapter.fromConfig(postgresConfig(database));
    try {
      const kpis = dataset.domains.find((domain) => domain.key === "finance")!.tables.find((table) => table.name === "kpi_monthly")!;
      const result = await adapter.query({
        resource: "fernway_finance.kpi_monthly",
        columns: ["month", "arr_usd"],
        orderBy: [{ column: "month", direction: "desc" }],
        limit: 1,
      });
      expect(result.rows).toEqual([{ month: kpis.rows.at(-1)!.month, arr_usd: Number(kpis.rows.at(-1)!.arr_usd).toFixed(2) }]);
      const schema = await adapter.introspectSchema();
      expect(schema.resources.some((resource) => resource.namespace === "fernway_support" && resource.name === "tickets")).toBe(true);
    } finally {
      await adapter.close();
    }
  });

  it("replaces an owned domain without duplicate rows", async () => {
    const crm = dataset.domains.find((domain) => domain.key === "crm")!;
    await writer.replace(crm, options);
    const count = await target.query("SELECT count(*)::int AS n FROM fernway_crm.opportunities");
    expect(count.rows[0]?.n).toBe(crm.tables.find((table) => table.name === "opportunities")!.rows.length);
  });

  it("refuses a schema that it did not create and leaves it unchanged", async () => {
    await writer.remove("marketing");
    await target.query("CREATE SCHEMA fernway_marketing");
    await target.query("CREATE TABLE fernway_marketing.budget (id int)");
    await target.query("INSERT INTO fernway_marketing.budget VALUES (1)");
    const marketing = dataset.domains.find((domain) => domain.key === "marketing")!;
    expect(await writer.inspect(marketing)).toEqual({ state: "foreign", conflicts: ["fernway_marketing"] });
    await expect(writer.replace(marketing, options)).rejects.toBeInstanceOf(ForeignNamespaceError);
    await expect(writer.remove("marketing")).rejects.toBeInstanceOf(ForeignNamespaceError);
    const kept = await target.query("SELECT id FROM fernway_marketing.budget");
    expect(kept.rows).toEqual([{ id: 1 }]);
  });

  it("removes only the schemas that it owns", async () => {
    for (const domain of dataset.domains) {
      if (domain.key !== "marketing") expect(await writer.remove(domain.key)).toBe(true);
    }
    expect(await writer.remove("app")).toBe(false);
    expect(await schemas()).toEqual(["fernway_marketing"]);
  });
});
