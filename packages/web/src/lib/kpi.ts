import type { KpiSpec } from "@dash/core";

export function aggregateKpi(
  rows: Record<string, unknown>[],
  spec: KpiSpec,
): number {
  if (spec.aggregation === "count") {
    return rows.length;
  }
  const values = rows.map((row) => Number(row[spec.column] ?? 0));
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  switch (spec.aggregation) {
    case "sum":
      return sum;
    case "avg":
      return sum / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return sum;
  }
}

export function formatKpi(value: number, format: KpiSpec["format"]): string {
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (format === "percent") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}
