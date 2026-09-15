import { describe, expect, it } from "vitest";
import { aggregateKpi, formatKpi } from "../lib/kpi.ts";
import { toEchartsOption } from "../lib/chart/echarts.ts";

describe("KPI aggregation", () => {
  const rows = [{ revenue: 10 }, { revenue: 30 }, { revenue: 20 }];

  it("sums, averages, and formats currency", () => {
    expect(aggregateKpi(rows, { aggregation: "sum", column: "revenue" })).toBe(60);
    expect(aggregateKpi(rows, { aggregation: "avg", column: "revenue" })).toBe(20);
    expect(aggregateKpi(rows, { aggregation: "max", column: "revenue" })).toBe(30);
    expect(formatKpi(1200, "currency")).toContain("1,200");
  });
});

describe("ECharts conversion", () => {
  it("builds grouped series from a color encoding", () => {
    const option = toEchartsOption(
      {
        type: "area",
        encode: { x: "month", y: "revenue", color: "region" },
        stacked: true,
        smooth: true,
      },
      [
        { month: "2026-01", region: "EU", revenue: 10 },
        { month: "2026-01", region: "US", revenue: 12 },
        { month: "2026-02", region: "EU", revenue: 14 },
        { month: "2026-02", region: "US", revenue: 16 },
      ],
    );
    const series = option.series as Array<{ name: string; data: number[] }>;
    expect(series.map((item) => item.name).sort()).toEqual(["EU", "US"]);
    expect(series[0]?.data).toHaveLength(2);
  });
});
