import { aggregateKpi, formatKpi } from "~/lib/kpi";
import type { KpiSpec } from "@dash/core";

export function KpiCard({
  title,
  rows,
  spec,
}: {
  title: string;
  rows: Record<string, unknown>[];
  spec: KpiSpec;
}) {
  const value = aggregateKpi(rows, spec);
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-mist">{title}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">
        {formatKpi(value, spec.format)}
      </div>
    </div>
  );
}
