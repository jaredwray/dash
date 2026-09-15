import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { ChartSpec } from "@dash/core";
import { emptyChartOption, toEchartsOption } from "~/lib/chart/echarts";

export function Chart({
  spec,
  rows,
  height = 280,
}: {
  spec: ChartSpec;
  rows: Record<string, unknown>[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chart.setOption(rows.length === 0 ? emptyChartOption() : toEchartsOption(spec, rows));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [spec, rows]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}
