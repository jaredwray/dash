import { describe, expect, it } from "vitest";
import { aggregateKpi, formatKpi } from "./kpi.ts";

describe("KPI aggregation", () => {
  const rows = [{ revenue: 10 }, { revenue: 30 }, { revenue: 20 }];

  it("sums, averages, and formats currency", () => {
    expect(aggregateKpi(rows, { aggregation: "sum", column: "revenue" })).toBe(60);
    expect(aggregateKpi(rows, { aggregation: "avg", column: "revenue" })).toBe(20);
    expect(aggregateKpi(rows, { aggregation: "max", column: "revenue" })).toBe(30);
    expect(formatKpi(1200, "currency")).toContain("1,200");
  });
});
