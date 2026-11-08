import { createHash } from "node:crypto";
import type { DataSourceKind } from "@dash/core";
import type { SeedSize } from "./model/types.ts";
import { DOMAIN_KEYS, type SeedDomainKey } from "./table.ts";

/** Kinds that have a seed writer in this version. */
export const SEEDABLE_KINDS = ["postgres", "mongodb", "bigquery"] as const;
export type SeedableKind = (typeof SEEDABLE_KINDS)[number];

export function isSeedableKind(kind: string): kind is SeedableKind {
  return (SEEDABLE_KINDS as readonly string[]).includes(kind);
}

export const DOMAIN_LABELS: Record<SeedDomainKey, string> = {
  app: "Product database",
  billing: "Billing",
  crm: "Sales CRM",
  finance: "Finance warehouse",
  product: "Product analytics",
  marketing: "Marketing analytics",
  support: "Customer support",
};

/**
 * Where each domain would live in a real company, best first. Kinds without
 * a writer yet are in the lists, so a new writer needs no change here.
 */
export const DOMAIN_PREFERENCES: Record<SeedDomainKey, readonly DataSourceKind[]> = {
  app: ["postgres", "mysql", "bigquery", "mongodb"],
  billing: ["stripe", "postgres", "bigquery", "mongodb"],
  crm: ["mysql", "postgres", "bigquery", "mongodb"],
  finance: ["redshift", "snowflake", "bigquery", "postgres", "mongodb"],
  product: ["bigquery", "databricks", "postgres", "mongodb"],
  marketing: ["bigquery", "postgres", "mongodb"],
  support: ["mongodb", "postgres", "bigquery"],
};

/** The SQL schema or dataset of a domain. */
export function sqlNamespace(domain: SeedDomainKey): string {
  return `fernway_${domain}`;
}

/** The resource name that Dash queries for a domain table. */
export function resourceName(kind: SeedableKind, domain: SeedDomainKey, table: string): string {
  return kind === "mongodb" ? `${domain}_${table}` : `${sqlNamespace(domain)}.${table}`;
}

/** A short label for where a domain lands in a source. */
export function namespaceLabel(kind: SeedableKind, domain: SeedDomainKey): string {
  return kind === "mongodb" ? `${domain}_* collections` : sqlNamespace(domain);
}

export interface PlanSource {
  id: string;
  name: string;
  kind: DataSourceKind;
  createdAt: string;
  updatedAt: string;
  /** A reason to refuse this source, for example that it is the Dash app database. */
  refusal?: string;
}

export interface PlanAssignment {
  domain: SeedDomainKey;
  label: string;
  sourceId: string;
  sourceName: string;
  kind: SeedableKind;
  namespace: string;
}

export type PlanSourceStatus = "target" | "unused" | "unsupported" | "refused";

export interface PlanSourceSummary {
  id: string;
  name: string;
  kind: DataSourceKind;
  status: PlanSourceStatus;
  reason: string | null;
  domains: SeedDomainKey[];
}

export interface SeedPlan {
  planId: string;
  size: SeedSize;
  assignments: PlanAssignment[];
  sources: PlanSourceSummary[];
}

/**
 * Picks a target source for each domain. Each domain takes the first kind
 * on its preference list that has a usable source. When two sources have
 * that kind, the older one wins.
 */
export function planSeed(sources: PlanSource[], size: SeedSize): SeedPlan {
  const ordered = [...sources].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const usable = ordered.filter((source) => !source.refusal && isSeedableKind(source.kind));
  const assignments: PlanAssignment[] = [];
  for (const domain of DOMAIN_KEYS) {
    for (const kind of DOMAIN_PREFERENCES[domain]) {
      const source = usable.find((item) => item.kind === kind);
      if (!source || !isSeedableKind(source.kind)) continue;
      assignments.push({
        domain,
        label: DOMAIN_LABELS[domain],
        sourceId: source.id,
        sourceName: source.name,
        kind: source.kind,
        namespace: namespaceLabel(source.kind, domain),
      });
      break;
    }
  }
  const summaries: PlanSourceSummary[] = ordered.map((source) => {
    const domains = assignments.filter((item) => item.sourceId === source.id).map((item) => item.domain);
    if (source.refusal) return { id: source.id, name: source.name, kind: source.kind, status: "refused", reason: source.refusal, domains };
    if (!isSeedableKind(source.kind)) {
      return { id: source.id, name: source.name, kind: source.kind, status: "unsupported", reason: "No seed writer for this kind yet.", domains };
    }
    if (domains.length === 0) {
      return { id: source.id, name: source.name, kind: source.kind, status: "unused", reason: "An older source of the same kind receives the data.", domains };
    }
    return { id: source.id, name: source.name, kind: source.kind, status: "target", reason: null, domains };
  });
  const fingerprint = JSON.stringify({
    size,
    assignments: assignments.map((item) => [item.domain, item.sourceId, item.kind]),
    versions: ordered.filter((source) => assignments.some((item) => item.sourceId === source.id)).map((source) => [source.id, source.updatedAt]),
  });
  return {
    planId: createHash("sha256").update(fingerprint).digest("hex").slice(0, 32),
    size,
    assignments,
    sources: summaries,
  };
}
