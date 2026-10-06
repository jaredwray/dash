import {
  createChartScene,
  type ChartValue,
  type SceneNode,
  type StaticChartDefinition,
} from "@tanstack/charts";
import { describe, expect, it } from "vitest";
import { toChartDefinition } from "./tanstack.ts";

function sceneFor(
  spec: Parameters<typeof toChartDefinition>[0],
  rows: Record<string, unknown>[],
) {
  const definition = toChartDefinition(spec, rows) as StaticChartDefinition<
    Record<string, unknown>,
    ChartValue,
    ChartValue
  >;
  return createChartScene(definition, { width: 640, height: 360 });
}

function nodesOf(nodes: readonly SceneNode[], kind: SceneNode["kind"]): SceneNode[] {
  const found: SceneNode[] = [];
  const walk = (items: readonly SceneNode[]) => {
    for (const node of items) {
      if (node.kind === kind) {
        found.push(node);
      }
      if ("children" in node && node.children) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return found;
}

describe("TanStack chart conversion", () => {
  const regional = [
    { month: "2026-01", region: "EU", revenue: 10 },
    { month: "2026-01", region: "US", revenue: 12 },
    { month: "2026-02", region: "EU", revenue: 14 },
    { month: "2026-02", region: "US", revenue: 16 },
  ];

  it("stacks area series from a color encoding", () => {
    const scene = sceneFor(
      {
        type: "area",
        encode: { x: "month", y: "revenue", color: "region" },
        stacked: true,
        smooth: true,
      },
      regional,
    );
    expect([...scene.colors.domain].sort()).toEqual(["EU", "US"]);
    expect(scene.scales.x?.domain).toEqual(["2026-01", "2026-02"]);
    const top = (group: string, month: string) => {
      const values = scene.points
        .filter((point) => point.group === group && point.xValue === month)
        .map((point) => Number(point.y2Value ?? point.yValue));
      return Math.max(...values);
    };
    expect(top("EU", "2026-01")).toBe(10);
    expect(top("US", "2026-01")).toBe(22);

    const curveRows = [
      { month: "2026-01", region: "EU", revenue: 10 },
      { month: "2026-02", region: "EU", revenue: 30 },
      { month: "2026-03", region: "EU", revenue: 12 },
    ];
    const smooth = sceneFor(
      { type: "area", encode: { x: "month", y: "revenue", color: "region" }, stacked: true, smooth: true },
      curveRows,
    );
    const straight = sceneFor(
      { type: "area", encode: { x: "month", y: "revenue", color: "region" }, stacked: true },
      curveRows,
    );
    const smoothPath = nodesOf(smooth.nodes, "area").find((node) => node.kind === "area")?.path ?? "";
    expect(smoothPath).toMatch(/C/);
    expect(nodesOf(straight.nodes, "area").some((node) => node.kind === "area" && node.path?.includes("C"))).toBe(
      false,
    );
  });

  it("keeps wide line measures as separate series", () => {
    const scene = sceneFor(
      {
        type: "line",
        encode: { x: "month", y: ["signups", "churned"] },
        smooth: true,
      },
      [
        { month: "2026-01", signups: 40, churned: 8 },
        { month: "2026-02", signups: 50, churned: 11 },
      ],
    );
    expect([...scene.colors.domain].sort()).toEqual(["churned", "signups"]);
    const churned = scene.points.find(
      (point) => point.group === "churned" && point.xValue === "2026-01",
    );
    expect(churned?.yValue).toBe(8);
  });

  it("stacks line series on the cumulative boundary", () => {
    const scene = sceneFor(
      {
        type: "line",
        encode: { x: "month", y: "revenue", color: "region" },
        stacked: true,
      },
      regional,
    );
    const us = scene.points.find((point) => point.group === "US" && point.xValue === "2026-01");
    expect(us?.yValue).toBe(22);
  });

  it("draws horizontal bars in category order", () => {
    const scene = sceneFor(
      { type: "bar", encode: { x: "name", y: "units" } },
      [
        { name: "Dash Pro", units: 800 },
        { name: "Pulse", units: 120 },
      ],
    );
    expect(scene.scales.y?.domain).toEqual(["Dash Pro", "Pulse"]);
    expect(scene.points.map((point) => point.xValue)).toEqual([800, 120]);
  });

  it("places unstacked columns side by side", () => {
    const scene = sceneFor(
      {
        type: "column",
        encode: { x: "quarter", y: "revenue", color: "product" },
      },
      [
        { quarter: "Q1", product: "Core", revenue: 10 },
        { quarter: "Q1", product: "Services", revenue: 6 },
      ],
    );
    const xs = scene.points.filter((point) => point.xValue === "Q1").map((point) => point.x);
    expect(new Set(xs).size).toBe(2);
  });

  it("builds a donut from name and value encodings", () => {
    const scene = sceneFor(
      { type: "donut", encode: { name: "name", value: "revenue" } },
      [
        { name: "Dash Pro", revenue: 30 },
        { name: "Pulse", revenue: -4 },
        { name: "Govern", revenue: 10 },
      ],
    );
    expect([...scene.colors.domain].sort()).toEqual(["Dash Pro", "Govern", "Pulse"]);
    expect(nodesOf(scene.nodes, "area").length).toBeGreaterThan(0);
    expect(scene.scales.x?.type).toBe("none");
    expect(scene.scales.y?.type).toBe("none");
  });

  it("plots numeric scatter positions", () => {
    const scene = sceneFor(
      { type: "scatter", encode: { x: "orders", y: "revenue", color: "region" } },
      [
        { orders: 4, revenue: 10, region: "EU" },
        { orders: 9, revenue: 22, region: "US" },
      ],
    );
    expect(scene.points.map((point) => [point.xValue, point.yValue, point.group])).toEqual([
      [4, 10, "EU"],
      [9, 22, "US"],
    ]);
  });
});
