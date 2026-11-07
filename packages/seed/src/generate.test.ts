import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { splitResourceName } from "@dash/core";
import { generateDataset } from "./generate.ts";
import { DOMAIN_KEYS, IDENTIFIER, type SeedDomain, type SeedTable } from "./table.ts";

const AS_OF = new Date("2026-11-01T00:00:00.000Z");
const small = generateDataset({ asOf: AS_OF, size: "small" });

function table(dataset: { domains: SeedDomain[] }, domain: string, name: string): SeedTable {
  const found = dataset.domains.find((item) => item.key === domain)?.tables.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${domain}.${name}`);
  return found;
}

function digest(dataset: { domains: SeedDomain[] }): string {
  return createHash("sha256")
    .update(JSON.stringify(dataset.domains, (_key, value: unknown) => (value instanceof Map ? [...value] : value)))
    .digest("hex");
}

const cents = (value: unknown) => Math.round(Number(value) * 100);

describe("generateDataset", () => {
  it("gives the same dataset for the same seed, date, and size, and a new one for a new seed", () => {
    const again = generateDataset({ asOf: AS_OF, size: "small" });
    const other = generateDataset({ asOf: AS_OF, size: "small", seed: "another-company" });
    expect(digest(again)).toBe(digest(small));
    expect(digest(other)).not.toBe(digest(small));
  });

  it("has every domain, with tables that match their column contract", () => {
    expect(small.domains.map((domain) => domain.key)).toEqual([...DOMAIN_KEYS]);
    for (const domain of small.domains) {
      for (const seedTable of domain.tables) {
        const where = `${domain.key}.${seedTable.name}`;
        expect(IDENTIFIER.test(seedTable.name), where).toBe(true);
        // Every adapter must accept the resource name that a widget sends.
        expect(() => splitResourceName(`fernway_${domain.key}.${seedTable.name}`)).not.toThrow();
        expect(seedTable.rows.length, where).toBeGreaterThan(0);
        const names = seedTable.columns.map((column) => column.name);
        expect(new Set(names).size, where).toBe(names.length);
        for (const name of names) expect(IDENTIFIER.test(name), `${where}.${name}`).toBe(true);
        const keys = new Set<string>();
        for (const row of seedTable.rows) {
          expect(Object.keys(row).sort(), where).toEqual([...names].sort());
          for (const column of seedTable.columns) {
            const value = row[column.name];
            if (value === null || value === undefined) {
              expect(column.nullable, `${where}.${column.name} is null but not nullable`).toBe(true);
              continue;
            }
            if (column.type === "integer") {
              expect(Number.isInteger(value) && Math.abs(value as number) < 2 ** 31, `${where}.${column.name}`).toBe(true);
            }
            if (column.type === "date") expect(value, `${where}.${column.name}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            if (column.type === "timestamp") expect(value, `${where}.${column.name}`).toBeInstanceOf(Date);
          }
          if (seedTable.primaryKey) {
            const key = seedTable.primaryKey.map((column) => String(row[column])).join("|");
            expect(keys.has(key), `${where} duplicate key ${key}`).toBe(false);
            keys.add(key);
          }
        }
      }
    }
  });

  it("keeps each mart under the default query limit of 1,000 rows at standard size", () => {
    const standard = generateDataset({ asOf: AS_OF, size: "standard" });
    for (const domain of standard.domains) {
      for (const seedTable of domain.tables) {
        if (seedTable.name.startsWith("mart_") || ["kpi_monthly", "mrr_movements_monthly", "arr_by_segment_monthly", "headcount_monthly"].includes(seedTable.name)) {
          expect(seedTable.rows.length, `${domain.key}.${seedTable.name}`).toBeLessThan(1000);
        }
      }
    }
  });

  it("reconciles finance MRR with the subscription events in the product database", () => {
    const events = table(small, "app", "subscription_events").rows;
    const kpis = table(small, "finance", "kpi_monthly").rows;
    const movements = table(small, "finance", "mrr_movements_monthly").rows;
    for (const kpi of kpis) {
      const end = new Date(`${String(kpi.month_start)}T00:00:00.000Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      const fromEvents = events
        .filter((event) => (event.occurred_at as Date).getTime() < end.getTime())
        .reduce((sum, event) => sum + cents(event.mrr_delta_usd), 0);
      expect(cents(kpi.mrr_usd), String(kpi.month)).toBe(fromEvents);
      const moved = movements.filter((row) => row.month === kpi.month).reduce((sum, row) => sum + cents(row.mrr_usd), 0);
      expect(moved, String(kpi.month)).toBe(cents(kpi.net_new_mrr_usd));
    }
  });

  it("reconciles billing collections with charges and invoices", () => {
    const charges = table(small, "billing", "charges").rows;
    const invoices = table(small, "billing", "invoices").rows;
    const collections = table(small, "billing", "mart_collections_monthly").rows;
    for (const row of collections) {
      const collected = charges
        .filter((charge) => charge.status === "succeeded" && (charge.created_at as Date).toISOString().startsWith(String(row.month)))
        .reduce((sum, charge) => sum + cents(charge.amount_usd), 0);
      expect(cents(row.collected_usd), String(row.month)).toBe(collected);
    }
    const paidByInvoice = new Map<string, number>();
    for (const charge of charges) {
      if (charge.status === "succeeded") paidByInvoice.set(String(charge.invoice_id), (paidByInvoice.get(String(charge.invoice_id)) ?? 0) + Number(charge.amount));
    }
    for (const invoice of invoices) {
      expect(paidByInvoice.get(String(invoice.invoice_id)) ?? 0, String(invoice.invoice_id)).toBe(invoice.amount_paid);
    }
  });

  it("resolves every account, user, and campaign reference across sources", () => {
    const accounts = new Set(table(small, "app", "accounts").rows.map((row) => row.account_id));
    const users = new Set(table(small, "app", "users").rows.map((row) => row.user_id));
    const campaigns = new Set(table(small, "marketing", "campaigns").rows.map((row) => row.campaign_id));
    const references: [string, string, string, Set<unknown>][] = [
      ["app", "users", "account_id", accounts],
      ["app", "subscriptions", "account_id", accounts],
      ["billing", "customers", "account_id", accounts],
      ["billing", "invoices", "account_id", accounts],
      ["crm", "opportunities", "account_id", accounts],
      ["crm", "leads", "converted_account_id", accounts],
      ["crm", "leads", "campaign_id", campaigns],
      ["product", "monthly_account_usage", "account_id", accounts],
      ["product", "events", "account_id", accounts],
      ["product", "events", "user_id", users],
      ["support", "tickets", "account_id", accounts],
      ["support", "nps_responses", "user_id", users],
    ];
    for (const [domain, name, column, keys] of references) {
      for (const row of table(small, domain, name).rows) {
        if (row[column] === null) continue;
        expect(keys.has(row[column]), `${domain}.${name}.${column} = ${String(row[column])}`).toBe(true);
      }
    }
  });

  it("keeps monthly marketing marts equal to the daily rows for full months", () => {
    const daily = table(small, "marketing", "web_sessions_daily").rows;
    const spend = table(small, "marketing", "ad_spend_daily").rows;
    const monthly = table(small, "marketing", "mart_channel_performance_monthly").rows;
    const firstDay = daily.map((row) => String(row.date)).sort()[0]!;
    const fullMonths = [...new Set(daily.map((row) => String(row.date).slice(0, 7)))].filter((month) => `${month}-01` >= firstDay);
    expect(fullMonths.length).toBeGreaterThan(1);
    for (const month of fullMonths) {
      for (const row of monthly.filter((item) => item.month === month)) {
        const sessions = daily.filter((item) => String(item.date).startsWith(month) && item.channel === row.channel).reduce((sum, item) => sum + Number(item.sessions), 0);
        const dollars = spend.filter((item) => String(item.date).startsWith(month) && item.channel === row.channel).reduce((sum, item) => sum + cents(item.spend_usd), 0);
        expect(sessions, `${month} ${String(row.channel)} sessions`).toBe(row.sessions);
        expect(dollars, `${month} ${String(row.channel)} spend`).toBe(cents(row.spend_usd));
      }
    }
  });

  it("uses only reserved .example domains for customer email addresses", () => {
    const emails = [
      ...table(small, "app", "users").rows.map((row) => row.email),
      ...table(small, "billing", "customers").rows.map((row) => row.email),
      ...table(small, "crm", "leads").rows.map((row) => row.email),
    ];
    for (const email of emails) expect(String(email)).toMatch(/^[a-z0-9.]+@[a-z0-9.-]+\.example$/);
  });
});
