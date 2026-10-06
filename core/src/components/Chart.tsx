import { useMemo } from "react";
import { Chart as TanStackChart } from "@tanstack/charts/react";
import type { ChartSpec } from "@dash/core";
import { toChartDefinition } from "~/lib/chart/tanstack";

export function Chart({
  spec,
  rows,
  height = 280,
  label,
}: {
  spec: ChartSpec;
  rows: Record<string, unknown>[];
  height?: number;
  label?: string;
}) {
  const definition = useMemo(
    () => (rows.length === 0 ? null : toChartDefinition(spec, rows)),
    [spec, rows],
  );
  const ariaLabel = label || spec.title || "Chart";

  if (!definition) {
    return (
      <div
        className="grid place-items-center text-sm text-mist"
        style={{ height, width: "100%" }}
        role="img"
        aria-label={ariaLabel}
      >
        No rows
      </div>
    );
  }

  return (
    <TanStackChart
      definition={definition}
      height={height}
      ariaLabel={ariaLabel}
      className="dash-chart"
    />
  );
}
