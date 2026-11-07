import { describe, expect, it } from "vitest";
import { planSeed, type PlanSource } from "./plan.ts";

function source(id: string, kind: PlanSource["kind"], createdAt: string, extra: Partial<PlanSource> = {}): PlanSource {
  return { id, name: `${kind} ${id}`, kind, createdAt, updatedAt: createdAt, ...extra };
}

describe("planSeed", () => {
  it("puts each domain on the first configured kind of its preference list", () => {
    const plan = planSeed(
      [
        source("pg", "postgres", "2026-01-01T00:00:00Z"),
        source("mongo", "mongodb", "2026-01-02T00:00:00Z"),
        source("bq", "bigquery", "2026-01-03T00:00:00Z"),
      ],
      "standard",
    );
    expect(Object.fromEntries(plan.assignments.map((item) => [item.domain, item.sourceId]))).toEqual({
      app: "pg",
      billing: "pg",
      crm: "pg",
      finance: "bq",
      product: "bq",
      marketing: "bq",
      support: "mongo",
    });
    expect(plan.assignments.find((item) => item.domain === "support")?.namespace).toBe("support_* collections");
    expect(plan.assignments.find((item) => item.domain === "finance")?.namespace).toBe("fernway_finance");
  });

  it("falls back to any writable kind, so one source receives every domain", () => {
    const plan = planSeed([source("mongo", "mongodb", "2026-01-02T00:00:00Z")], "small");
    expect(plan.assignments).toHaveLength(7);
    expect(new Set(plan.assignments.map((item) => item.sourceId))).toEqual(new Set(["mongo"]));
  });

  it("uses the oldest source of a kind and reports the others", () => {
    const plan = planSeed(
      [
        source("new", "postgres", "2026-03-01T00:00:00Z"),
        source("old", "postgres", "2026-01-01T00:00:00Z"),
        source("mysql", "mysql", "2026-01-01T00:00:00Z"),
        source("app", "mongodb", "2026-01-01T00:00:00Z", { refusal: "This is the Dash app database." }),
      ],
      "standard",
    );
    expect(new Set(plan.assignments.map((item) => item.sourceId))).toEqual(new Set(["old"]));
    const status = Object.fromEntries(plan.sources.map((item) => [item.id, item.status]));
    expect(status).toEqual({ old: "target", new: "unused", mysql: "unsupported", app: "refused" });
    expect(plan.sources.find((item) => item.id === "app")?.reason).toBe("This is the Dash app database.");
  });

  it("changes the plan id when a target source, the size, or the assignment changes", () => {
    const sources = [source("pg", "postgres", "2026-01-01T00:00:00Z")];
    const base = planSeed(sources, "standard").planId;
    expect(planSeed(sources, "standard").planId).toBe(base);
    expect(planSeed(sources, "small").planId).not.toBe(base);
    expect(planSeed([{ ...sources[0]!, updatedAt: "2026-02-01T00:00:00Z" }], "standard").planId).not.toBe(base);
    expect(planSeed([...sources, source("mongo", "mongodb", "2026-01-02T00:00:00Z")], "standard").planId).not.toBe(base);
  });

  it("has no assignments when no source has a writer", () => {
    const plan = planSeed([source("mysql", "mysql", "2026-01-01T00:00:00Z")], "standard");
    expect(plan.assignments).toEqual([]);
  });
});
