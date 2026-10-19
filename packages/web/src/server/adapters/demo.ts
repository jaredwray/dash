import {
  type AdapterColumn,
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  normalizeAdapterQuery,
} from "@dash/core";

const REGIONS = [
  "North America",
  "Europe",
  "Asia Pacific",
  "Latin America",
] as const;

const PRODUCTS = [
  { sku: "DASH-PRO", name: "Dash Pro", category: "Platform", price: 129 },
  { sku: "DASH-TEAM", name: "Dash Team", category: "Platform", price: 349 },
  { sku: "INSIGHT", name: "Insight Pack", category: "Analytics", price: 89 },
  { sku: "PULSE", name: "Pulse Alerts", category: "Analytics", price: 49 },
  { sku: "CONNECT", name: "Connect Hub", category: "Services", price: 199 },
  { sku: "GOVERN", name: "Govern", category: "Services", price: 259 },
] as const;

function monthKey(index: number): string {
  const date = new Date(Date.UTC(2024, 9, 1));
  date.setUTCMonth(date.getUTCMonth() + index);
  return date.toISOString().slice(0, 7);
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 999) * 10_000;
  return x - Math.floor(x);
}

function buildTables(): Record<string, Record<string, unknown>[]> {
  const monthlyRevenue: Record<string, unknown>[] = [];
  for (let month = 0; month < 24; month += 1) {
    for (const [regionIndex, region] of REGIONS.entries()) {
      const growth = 1 + month * 0.045;
      const season = 1 + Math.sin((month / 12) * Math.PI * 2) * 0.12;
      const base = 48_000 + regionIndex * 9_000;
      const revenue = Math.round(
        base * growth * season * (0.86 + seeded(month * 10 + regionIndex) * 0.28),
      );
      monthlyRevenue.push({
        month: monthKey(month),
        region,
        revenue,
        orders: Math.round(revenue / (180 + regionIndex * 12)),
      });
    }
  }

  const productSales: Record<string, unknown>[] = [];
  for (const [index, product] of PRODUCTS.entries()) {
    const units = 420 + Math.round(seeded(index + 3) * 680);
    productSales.push({
      sku: product.sku,
      name: product.name,
      category: product.category,
      price: product.price,
      units,
      revenue: units * product.price,
    });
  }

  const signups: Record<string, unknown>[] = [];
  for (let month = 0; month < 24; month += 1) {
    const acquired = 180 + month * 14 + Math.round(seeded(month + 50) * 40);
    const churned = 40 + Math.round(seeded(month + 90) * 22);
    signups.push({
      month: monthKey(month),
      signups: acquired,
      churned,
      net: acquired - churned,
    });
  }

  return {
    monthly_revenue: monthlyRevenue,
    product_sales: productSales,
    monthly_signups: signups,
  };
}

const TABLES = buildTables();

const COLUMNS: Record<string, AdapterColumn[]> = {
  monthly_revenue: [
    { name: "month", type: "text", nullable: false },
    { name: "region", type: "text", nullable: false },
    { name: "revenue", type: "integer", nullable: false },
    { name: "orders", type: "integer", nullable: false },
  ],
  product_sales: [
    { name: "sku", type: "text", nullable: false },
    { name: "name", type: "text", nullable: false },
    { name: "category", type: "text", nullable: false },
    { name: "price", type: "integer", nullable: false },
    { name: "units", type: "integer", nullable: false },
    { name: "revenue", type: "integer", nullable: false },
  ],
  monthly_signups: [
    { name: "month", type: "text", nullable: false },
    { name: "signups", type: "integer", nullable: false },
    { name: "churned", type: "integer", nullable: false },
    { name: "net", type: "integer", nullable: false },
  ],
};

function matches(row: Record<string, unknown>, query: AdapterQuery): boolean {
  for (const filter of query.filters ?? []) {
    const actual = row[filter.column];
    const expected = filter.value;
    switch (filter.op) {
      case "eq":
        if (actual !== expected) return false;
        break;
      case "neq":
        if (actual === expected) return false;
        break;
      case "gt":
        if (!(Number(actual) > Number(expected))) return false;
        break;
      case "gte":
        if (!(Number(actual) >= Number(expected))) return false;
        break;
      case "lt":
        if (!(Number(actual) < Number(expected))) return false;
        break;
      case "lte":
        if (!(Number(actual) <= Number(expected))) return false;
        break;
      case "in":
        if (!Array.isArray(expected) || !expected.includes(actual)) return false;
        break;
      case "like":
      case "ilike": {
        const pattern = String(expected).replaceAll("%", ".*");
        const flags = filter.op === "ilike" ? "i" : "";
        if (!new RegExp(`^${pattern}$`, flags).test(String(actual))) return false;
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

export class DemoAdapter implements DataAdapter {
  readonly kind = "demo" as const;

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, latencyMs: 1, message: "Demo warehouse is ready" };
  }

  async introspectSchema(): Promise<AdapterSchema> {
    return {
      kind: "demo",
      resources: Object.entries(COLUMNS).map(([name, columns]) => ({
        name,
        kind: "table" as const,
        columns,
      })),
    };
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    const query = normalizeAdapterQuery(input);
    const table = TABLES[query.resource];
    if (!table) {
      throw new Error(`Unknown demo resource: ${query.resource}`);
    }
    let rows = table.filter((row) => matches(row, query));
    if (query.orderBy && query.orderBy.length > 0) {
      rows = [...rows].sort((left, right) => {
        for (const order of query.orderBy ?? []) {
          const a = left[order.column];
          const b = right[order.column];
          if (a === b) continue;
          const cmp = a! < b! ? -1 : 1;
          return order.direction === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }
    const sliced = rows.slice(query.offset, (query.offset ?? 0) + (query.limit ?? 1000));
    const columns = COLUMNS[query.resource] ?? [];
    const projected =
      query.columns && query.columns.length > 0
        ? sliced.map((row) => {
            const next: Record<string, unknown> = {};
            for (const column of query.columns ?? []) {
              next[column] = row[column];
            }
            return next;
          })
        : sliced;
    return {
      columns:
        query.columns && query.columns.length > 0
          ? columns.filter((column) => query.columns?.includes(column.name))
          : columns,
      rows: projected,
      rowCount: projected.length,
      truncated: (query.offset ?? 0) + projected.length < rows.length,
    };
  }

  async close(): Promise<void> {
    // in-memory
  }
}

export const demoAdapter = new DemoAdapter();
