import type { ChartSpec } from "@dash/core";
import type { EChartsOption } from "echarts";

const PALETTE = [
  "#5eead4",
  "#818cf8",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#38bdf8",
  "#fb7185",
  "#c4b5fd",
];

function numbers(rows: Record<string, unknown>[], key: string): number[] {
  return rows.map((row) => Number(row[key] ?? 0));
}

function labels(rows: Record<string, unknown>[], key: string): string[] {
  return rows.map((row) => String(row[key] ?? ""));
}

export function toEchartsOption(
  spec: ChartSpec,
  rows: Record<string, unknown>[],
): EChartsOption {
  const text = "#c5d0e0";
  const muted = "#8b97ab";
  const base = {
    color: PALETTE,
    textStyle: { color: text, fontFamily: "Outfit, sans-serif" },
    tooltip: {
      trigger: spec.type === "pie" || spec.type === "donut" ? "item" : "axis",
      backgroundColor: "#121a2b",
      borderColor: "rgba(255,255,255,0.08)",
      textStyle: { color: text },
    },
    legend: {
      top: 0,
      textStyle: { color: muted },
    },
    grid: { left: 48, right: 16, top: 36, bottom: 32 },
  } satisfies EChartsOption;

  if (spec.type === "pie" || spec.type === "donut") {
    const nameKey = spec.encode.name ?? spec.encode.x ?? "name";
    const valueKey = spec.encode.value ?? spec.encode.y;
    const valueField = Array.isArray(valueKey) ? valueKey[0] : valueKey;
    return {
      ...base,
      series: [
        {
          type: "pie",
          radius: spec.type === "donut" ? ["54%", "76%"] : ["0%", "72%"],
          itemStyle: { borderColor: "#070b14", borderWidth: 2 },
          label: { color: text },
          data: rows.map((row) => ({
            name: String(row[nameKey] ?? ""),
            value: Number(row[valueField ?? "value"] ?? 0),
          })),
        },
      ],
    };
  }

  const xKey = spec.encode.x ?? "x";
  const yKeys = Array.isArray(spec.encode.y)
    ? spec.encode.y
    : spec.encode.y
      ? [spec.encode.y]
      : ["y"];
  const categories = [...new Set(labels(rows, xKey))];
  const seriesNames = spec.encode.color
    ? [...new Set(labels(rows, spec.encode.color))]
    : yKeys;

  const series = seriesNames.map((name, index) => {
    const data = categories.map((category) => {
      const matches = rows.filter((row) => String(row[xKey]) === category);
      if (spec.encode.color) {
        const hit = matches.find((row) => String(row[spec.encode.color!]) === name);
        return Number(hit?.[yKeys[0] ?? "y"] ?? 0);
      }
      const yKey = yKeys[index] ?? yKeys[0] ?? "y";
      return Number(matches[0]?.[yKey] ?? 0);
    });
    const type =
      spec.type === "column" || spec.type === "bar"
        ? ("bar" as const)
        : spec.type === "scatter"
          ? ("scatter" as const)
          : ("line" as const);
    return {
      name,
      type,
      stack: spec.stacked ? "total" : undefined,
      smooth: spec.smooth,
      symbol: spec.type === "scatter" ? "circle" : "none",
      areaStyle:
        spec.type === "area"
          ? { opacity: 0.22 }
          : undefined,
      data,
    };
  });

  return {
    ...base,
    xAxis: {
      type: spec.type === "bar" ? "value" : "category",
      data: spec.type === "bar" ? undefined : categories,
      axisLabel: { color: muted },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
    },
    yAxis: {
      type: spec.type === "bar" ? "category" : "value",
      data: spec.type === "bar" ? categories : undefined,
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
    },
    series:
      spec.type === "bar"
        ? series.map((item) => ({
            ...item,
            data: item.data,
          }))
        : series,
  };
}

export function emptyChartOption(): EChartsOption {
  return {
    title: {
      text: "No rows",
      left: "center",
      top: "middle",
      textStyle: { color: "#8b97ab", fontWeight: 500, fontSize: 14 },
    },
  };
}

export { numbers };
