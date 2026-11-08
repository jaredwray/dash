import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoAdapter } from "@dash/adapter-mongodb";
import { resolveMongoTarget } from "@dash/adapter-mongodb";
import { generateDataset } from "../generate.ts";
import { NOT_READY, mongoConfig, uniqueName } from "../test-clusters.ts";
import { MongoSeedWriter } from "./mongodb.ts";
import { ForeignNamespaceError, MANIFEST } from "./types.ts";

const AS_OF = new Date("2026-11-01T00:00:00.000Z");
const dataset = generateDataset({ asOf: AS_OF, size: "small" });
const options = { size: "small", asOf: AS_OF };
// A fresh database per run. The adapter tests use the `dash` database.
const database = uniqueName("dash_seed");
const config = mongoConfig(database);
const target = resolveMongoTarget(config);
const client = new MongoClient(target.uri, target.options);
let writer: MongoSeedWriter;

async function collections(): Promise<string[]> {
  const list = await client.db(database).listCollections({}, { nameOnly: true }).toArray();
  return list.map((item) => item.name).sort();
}

beforeAll(async () => {
  try {
    await client.connect();
    await client.db(database).command({ ping: 1 });
  } catch (error) {
    throw new Error(NOT_READY("MongoDB"), { cause: error });
  }
  writer = new MongoSeedWriter(config);
});

afterAll(async () => {
  await writer?.close();
  await client.db(database).dropDatabase().catch(() => undefined);
  await client.close();
});

describe("MongoSeedWriter", () => {
  const support = dataset.domains.find((domain) => domain.key === "support")!;
  const finance = dataset.domains.find((domain) => domain.key === "finance")!;

  it("writes a domain as prefixed collections, and Dash reads them through the adapter", async () => {
    expect(await writer.inspect(support)).toEqual({ state: "absent", conflicts: [] });
    const results = await writer.replace(support, options);
    expect(results).toEqual(support.tables.map((table) => ({ table: table.name, rows: table.rows.length })));
    await writer.replace(finance, options);
    expect(await collections()).toEqual(
      [MANIFEST, ...support.tables.map((table) => `support_${table.name}`), ...finance.tables.map((table) => `finance_${table.name}`)].sort(),
    );

    const tickets = support.tables.find((table) => table.name === "tickets")!;
    const nested = await client.db(database).collection("support_tickets").findOne({ _id: tickets.rows[0]!.ticket_id as never });
    expect(Array.isArray(nested?.messages)).toBe(true);
    expect(nested?.created_at).toBeInstanceOf(Date);

    const adapter = MongoAdapter.fromConfig(config);
    try {
      const open = await adapter.query({
        resource: "support_tickets",
        columns: ["ticket_id", "status"],
        filters: [{ column: "status", op: "in", value: ["new", "open", "pending"] }],
        limit: 10_000,
      });
      expect(open.rows.length).toBe(tickets.rows.filter((row) => ["new", "open", "pending"].includes(String(row.status))).length);
      const kpis = finance.tables.find((table) => table.name === "kpi_monthly")!;
      const latest = await adapter.query({ resource: "finance_kpi_monthly", columns: ["month", "arr_usd"], orderBy: [{ column: "month", direction: "desc" }], limit: 1 });
      expect(latest.rows).toEqual([{ month: kpis.rows.at(-1)!.month, arr_usd: kpis.rows.at(-1)!.arr_usd }]);
    } finally {
      await adapter.close();
    }
  });

  it("replaces an owned domain without duplicate documents", async () => {
    await writer.replace(support, options);
    const count = await client.db(database).collection("support_tickets").countDocuments();
    expect(count).toBe(support.tables.find((table) => table.name === "tickets")!.rows.length);
    expect((await collections()).some((name) => name.endsWith("__dash_seed_tmp"))).toBe(false);
  });

  it("refuses a collection that it did not create and leaves it unchanged", async () => {
    const crm = dataset.domains.find((domain) => domain.key === "crm")!;
    await client.db(database).collection("crm_leads").insertOne({ _id: "keep" as never, note: "customer data" });
    expect(await writer.inspect(crm)).toEqual({ state: "foreign", conflicts: ["crm_leads"] });
    await expect(writer.replace(crm, options)).rejects.toBeInstanceOf(ForeignNamespaceError);
    expect(await client.db(database).collection("crm_leads").find().toArray()).toEqual([{ _id: "keep", note: "customer data" }]);
  });

  it("removes only the collections that it owns", async () => {
    expect(await writer.remove("support")).toBe(true);
    expect(await writer.remove("finance")).toBe(true);
    expect(await writer.remove("crm")).toBe(false);
    expect(await collections()).toEqual(["crm_leads"]);
  });
});
