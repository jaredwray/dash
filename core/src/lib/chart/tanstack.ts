import type { ChartSpec } from "@dash/core";
import {
  areaY,
  barX,
  barY,
  colorLegend,
  d3Curve,
  defineChart,
  dot,
  group,
  lineY,
  stack,
  stackRowsY,
  type ChartValue,
  type DomChartDefinition,
} from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { curveMonotoneX } from "d3-shape";

const PALETTE = [
  "#5eead4",
  "#818cf8",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#38bdf8",
  "#fb7185",
  "#c4b5fd",
] as const;

const theme = {
  foreground: "#eef3fb",
  muted: "#93a0b8",
  grid: "rgba(255,255,255,0.06)",
  background: "transparent",
  palette: PALETTE,
};

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

interface SeriesPoint {
  label: string;
  value: number;
  series: string;
}

interface ScatterPoint {
  x: number;
  y: number;
  series: string;
}

interface Slice {
  name: string;
  value: number;
}

function finite(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function firstField(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value || fallback;
}

function measureKeys(spec: ChartSpec): string[] {
  if (Array.isArray(spec.encode.y)) {
    return spec.encode.y.length > 0 ? spec.encode.y : ["y"];
  }
  return spec.encode.y ? [spec.encode.y] : ["y"];
}

function seriesPoints(spec: ChartSpec, rows: Record<string, unknown>[]): SeriesPoint[] {
  const xKey = spec.encode.x ?? "x";
  const measures = measureKeys(spec);
  if (spec.encode.color) {
    const measure = measures[0] ?? "y";
    return rows.map((row) => ({
      label: String(row[xKey] ?? ""),
      value: finite(row[measure]),
      series: String(row[spec.encode.color!] ?? ""),
    }));
  }
  return rows.flatMap((row) =>
    measures.map((measure) => ({
      label: String(row[xKey] ?? ""),
      value: finite(row[measure]),
      series: measure,
    })),
  );
}

function seriesCount(points: readonly { series: string }[]): number {
  return new Set(points.map((point) => point.series)).size;
}

function curveFor(spec: ChartSpec) {
  return spec.smooth ? d3Curve(curveMonotoneX) : undefined;
}

function linearScale() {
  return {
    scale: scaleLinear,
    nice: true,
    grid: true,
    axis: {
      ticks: { format: (value: number) => compact.format(value) },
    },
  };
}

function categoryBand() {
  return {
    scale: () => scaleBand<string>().padding(0.18),
    axis: { tickLabels: { thin: true } },
  };
}

function categoryPoint() {
  return {
    scale: () => scalePoint<string>().padding(0.4),
    axis: { tickLabels: { thin: true } },
  };
}

function legend(count: number) {
  return count > 1 ? { color: { legend: colorLegend() } } : {};
}

function barLayout(spec: ChartSpec, count: number) {
  if (spec.stacked) {
    return stack();
  }
  if (count > 1) {
    return group({ padding: 0.12 });
  }
  return undefined;
}

function publish(definition: DomChartDefinition): DomChartDefinition<Record<string, unknown>, ChartValue, ChartValue> {
  return definition as DomChartDefinition<Record<string, unknown>, ChartValue, ChartValue>;
}

function lineChart(spec: ChartSpec, points: SeriesPoint[]) {
  const curve = curveFor(spec);
  const shared = {
    scales: {
      x: categoryPoint(),
      y: linearScale(),
    },
    theme,
    tooltip,
    focus: "group-x" as const,
    svgAnimation: true,
    ...legend(seriesCount(points)),
  };
  if (spec.stacked) {
    const stacked = stackRowsY(points, { x: "label", y: "value", z: "series" });
    return defineChart({
      ...shared,
      marks: [lineY(stacked, { x: "x", y: "y2", z: "z", strokeWidth: 2, curve })],
    });
  }
  return defineChart({
    ...shared,
    marks: [lineY(points, { x: "label", y: "value", z: "series", strokeWidth: 2, curve })],
  });
}

function areaChart(spec: ChartSpec, points: SeriesPoint[]) {
  const curve = curveFor(spec);
  const shared = {
    scales: {
      x: categoryPoint(),
      y: linearScale(),
    },
    theme,
    tooltip,
    focus: "group-x" as const,
    svgAnimation: true,
    ...legend(seriesCount(points)),
  };
  if (spec.stacked) {
    return defineChart({
      ...shared,
      marks: [
        areaY(points, {
          x: "label",
          y: "value",
          z: "series",
          fillOpacity: 0.92,
          curve,
          layout: stack(),
        }),
      ],
    });
  }
  return defineChart({
    ...shared,
    marks: [
      areaY(points, {
        x: "label",
        y1: 0,
        y2: "value",
        z: "series",
        fillOpacity: 0.22,
        curve,
      }),
      lineY(points, {
        x: "label",
        y: "value",
        z: "series",
        strokeWidth: 2,
        curve,
      }),
    ],
  });
}

function columnChart(spec: ChartSpec, points: SeriesPoint[]) {
  const count = seriesCount(points);
  return defineChart({
    marks: [
      barY(points, {
        x: "label",
        y: "value",
        z: "series",
        layout: barLayout(spec, count),
        inset: 1,
        radius: 2,
      }),
    ],
    scales: {
      x: categoryBand(),
      y: linearScale(),
    },
    theme,
    tooltip,
    focus: "group-x",
    svgAnimation: true,
    ...legend(count),
  });
}

function barChart(spec: ChartSpec, points: SeriesPoint[]) {
  const count = seriesCount(points);
  return defineChart({
    marks: [
      barX(points, {
        x: "value",
        y: "label",
        z: "series",
        layout: barLayout(spec, count),
        inset: 1,
        radius: 2,
      }),
    ],
    scales: {
      x: linearScale(),
      y: categoryBand(),
    },
    theme,
    tooltip,
    focus: "group-y",
    svgAnimation: true,
    ...legend(count),
  });
}

function scatterChart(spec: ChartSpec, rows: Record<string, unknown>[]) {
  const xKey = spec.encode.x ?? "x";
  const measure = measureKeys(spec)[0] ?? "y";
  const numeric = rows.every((row) => asNumber(row[xKey]) !== null && asNumber(row[measure]) !== null);
  if (numeric) {
    const points: ScatterPoint[] = rows.map((row) => ({
      x: asNumber(row[xKey]) ?? 0,
      y: asNumber(row[measure]) ?? 0,
      series: spec.encode.color ? String(row[spec.encode.color] ?? "") : measure,
    }));
    return defineChart({
      marks: [dot(points, { x: "x", y: "y", z: "series", r: 4.5 })],
      scales: {
        x: linearScale(),
        y: linearScale(),
      },
      theme,
      tooltip,
      focus: "nearest",
      svgAnimation: true,
      ...legend(seriesCount(points)),
    });
  }
  const points = seriesPoints(spec, rows);
  return defineChart({
    marks: [dot(points, { x: "label", y: "value", z: "series", r: 4.5 })],
    scales: {
      x: categoryPoint(),
      y: linearScale(),
    },
    theme,
    tooltip,
    focus: "nearest",
    svgAnimation: true,
    ...legend(seriesCount(points)),
  });
}

function slicesFor(spec: ChartSpec, rows: Record<string, unknown>[]): Slice[] {
  const nameKey = spec.encode.name ?? spec.encode.x ?? "name";
  const valueKey = firstField(spec.encode.value ?? spec.encode.y, "value");
  return rows.map((row) => ({
    name: String(row[nameKey] ?? ""),
    value: Math.max(0, finite(row[valueKey])),
  }));
}

function pieChart(spec: ChartSpec, rows: Record<string, unknown>[]) {
  const slices = slicesFor(spec, rows);
  const arcs = pie(slices, { value: "value", gapAngle: 0.015 });
  return defineChart({
    marks: [
      polar({
        radiusRatio: 0.92,
        scales: { angle: null, radius: null },
        marks: [
          radialArc(arcs, {
            innerRadius: spec.type === "donut" ? ({ radius }) => radius * 0.58 : 0,
            color: "name",
            key: "name",
            stroke: "#121a2b",
            strokeWidth: 2,
          }),
        ],
      }),
    ],
    scales: { x: null, y: null },
    theme,
    tooltip,
    svgAnimation: true,
    ...legend(new Set(slices.map((slice) => slice.name)).size),
  });
}

/**
 * Compile a stored ChartSpec into a TanStack Charts definition.
 * Dashboard documents stay ChartSpec JSON; only the renderer changes.
 */
export function toChartDefinition(
  spec: ChartSpec,
  rows: Record<string, unknown>[],
): DomChartDefinition<Record<string, unknown>, ChartValue, ChartValue> {
  if (spec.type === "pie" || spec.type === "donut") {
    return publish(pieChart(spec, rows));
  }
  if (spec.type === "scatter") {
    return publish(scatterChart(spec, rows));
  }
  const points = seriesPoints(spec, rows);
  if (spec.type === "bar") {
    return publish(barChart(spec, points));
  }
  if (spec.type === "column") {
    return publish(columnChart(spec, points));
  }
  if (spec.type === "area") {
    return publish(areaChart(spec, points));
  }
  return publish(lineChart(spec, points));
}
