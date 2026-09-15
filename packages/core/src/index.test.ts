import { describe, expect, it } from "vitest";
import {
  API_TOKEN_PREFIX,
  CHART_TYPES,
  DATA_SOURCE_KINDS,
  isApiTokenFormat,
  isApiTokenScope,
  isChartType,
  isDataSourceKind,
  publicTokenPrefix,
} from "./index.ts";

describe("data source kinds", () => {
  it("includes the MVP adapters and reserved future kinds", () => {
    expect(DATA_SOURCE_KINDS).toContain("postgres");
    expect(DATA_SOURCE_KINDS).toContain("demo");
    expect(DATA_SOURCE_KINDS).toContain("mysql");
    expect(DATA_SOURCE_KINDS).toContain("mongodb");
    expect(DATA_SOURCE_KINDS).toContain("bigquery");
    expect(isDataSourceKind("postgres")).toBe(true);
    expect(isDataSourceKind("oracle")).toBe(false);
  });
});

describe("chart types", () => {
  it("accepts the supported ECharts-backed types", () => {
    for (const type of CHART_TYPES) {
      expect(isChartType(type)).toBe(true);
    }
    expect(isChartType("sankey")).toBe(false);
  });
});

describe("API tokens", () => {
  it("validates the dash_live_ prefix and body", () => {
    expect(isApiTokenFormat(`${API_TOKEN_PREFIX}${"a".repeat(32)}`)).toBe(true);
    expect(isApiTokenFormat("dash_test_abc")).toBe(false);
    expect(isApiTokenFormat(`${API_TOKEN_PREFIX}short`)).toBe(false);
    expect(isApiTokenFormat(`${API_TOKEN_PREFIX}${"a".repeat(32)}!`)).toBe(false);
  });

  it("exposes a display prefix without the secret tail", () => {
    const token = `${API_TOKEN_PREFIX}abcdefgh${"x".repeat(24)}`;
    expect(publicTokenPrefix(token)).toBe(`${API_TOKEN_PREFIX}abcdefgh`);
    expect(publicTokenPrefix(token).length).toBeLessThan(token.length);
  });

  it("accepts known scopes only", () => {
    expect(isApiTokenScope("read")).toBe(true);
    expect(isApiTokenScope("write")).toBe(true);
    expect(isApiTokenScope("mcp")).toBe(true);
    expect(isApiTokenScope("admin")).toBe(false);
  });
});
