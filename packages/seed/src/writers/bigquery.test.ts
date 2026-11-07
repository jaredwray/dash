import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BigQueryAdapter, createBigQueryClient } from "@dash/adapter-bigquery";
import { generateDataset } from "../generate.ts";
import { NOT_READY, bigQueryConfig } from "../test-clusters.ts";
import { BigQuerySeedWriter } from "./bigquery.ts";
import { ForeignNamespaceError } from "./types.ts";

const AS_OF = new Date("2026-11-01T00:00:00.000Z");
const dataset = generateDataset({ asOf: AS_OF, size: "small" });
// The emulator keeps every loaded row and job in memory. The writer logic
// does not depend on the row count, so each table keeps its first 200 rows.
const trimmed = (key: string) => {
  const domain = dataset.domains.find((item) => item.key === key)!;
  return { ...domain, tables: domain.tables.map((table) => ({ ...table, rows: table.rows.slice(0, 200) })) };
};
const options = { size: "small", asOf: AS_OF };
const config = bigQueryConfig();
// The emulator holds one project, so the datasets have their real names.
// The adapter tests read only the `analytics` dataset.
const admin = createBigQueryClient({ projectId: config.projectId, apiEndpoint: config.apiEndpoint });
let writer: BigQuerySeedWriter;

beforeAll(async () => {
  try {
    await admin.listDatasets();
  } catch (error) {
    throw new Error(NOT_READY("BigQuery"), { cause: error });
  }
  writer = new BigQuerySeedWriter(config);
  for (const key of ["marketing", "finance"] as const) {
    await admin.deleteDataset(`fernway_${key}`);
  }
});

afterAll(async () => {
  await writer?.close();
  for (const key of ["marketing", "finance"] as const) {
    await admin.deleteDataset(`fernway_${key}`).catch(() => undefined);
  }
  await admin.end();
});

describe("BigQuerySeedWriter", () => {
  const marketing = trimmed("marketing");

  it("writes a domain into its dataset, and Dash reads a mart through the adapter", async () => {
    expect(await writer.inspect(marketing)).toEqual({ state: "absent", conflicts: [] });
    const results = await writer.replace(marketing, options);
    expect(results).toEqual(marketing.tables.map((table) => ({ table: table.name, rows: table.rows.length })));
    expect((await writer.inspect(marketing)).state).toBe("owned");

    const adapter = BigQueryAdapter.fromConfig(config);
    try {
      const funnel = marketing.tables.find((table) => table.name === "mart_funnel_monthly")!;
      const result = await adapter.query({
        resource: "fernway_marketing.mart_funnel_monthly",
        columns: ["month", "signups"],
        orderBy: [{ column: "month", direction: "desc" }],
        limit: 1,
      });
      expect(result.rows).toEqual([{ month: funnel.rows.at(-1)!.month, signups: funnel.rows.at(-1)!.signups }]);
    } finally {
      await adapter.close();
    }
  });

  it("replaces an owned domain without duplicate rows, and keeps a table that someone added", async () => {
    await admin.query(`CREATE TABLE \`${config.projectId}.fernway_marketing.budget_notes\` (note STRING)`);
    await writer.replace(marketing, options);
    const counted = await admin.query(`SELECT COUNT(*) AS n FROM \`${config.projectId}.fernway_marketing.campaigns\``);
    expect(Number(counted.rows[0]?.n)).toBe(marketing.tables.find((table) => table.name === "campaigns")!.rows.length);
    expect(await admin.listTables("fernway_marketing")).toContain("budget_notes");
    await admin.deleteTable("fernway_marketing", "budget_notes");
  });

  it("refuses a dataset that it did not create and leaves it in place", async () => {
    await admin.createDataset("fernway_finance", { description: "Team budget" });
    const finance = trimmed("finance");
    expect(await writer.inspect(finance)).toEqual({ state: "foreign", conflicts: ["fernway_finance"] });
    await expect(writer.replace(finance, options)).rejects.toBeInstanceOf(ForeignNamespaceError);
    await expect(writer.remove("finance")).rejects.toBeInstanceOf(ForeignNamespaceError);
    expect(await admin.getDataset("fernway_finance")).not.toBeNull();
    expect(await admin.listTables("fernway_finance")).toEqual([]);
  });

  it("removes only the datasets that it owns", async () => {
    expect(await writer.remove("marketing")).toBe(true);
    expect(await writer.remove("marketing")).toBe(false);
    expect(await admin.getDataset("fernway_marketing")).toBeNull();
  });
});
