/**
 * Engine-neutral table definitions. Writers map each logical type to the
 * type of their engine.
 *
 * Values in rows:
 * - `string`: string
 * - `integer`: number with no fraction, inside the 32-bit range
 * - `decimal`: number, rounded to `scale` digits
 * - `boolean`: boolean
 * - `date`: `YYYY-MM-DD` string
 * - `timestamp`: Date
 * - `json`: plain object or array
 *
 * Any value can be null when the column is nullable.
 */
export type SeedColumnType = "string" | "integer" | "decimal" | "boolean" | "date" | "timestamp" | "json";

export interface SeedColumn {
  name: string;
  type: SeedColumnType;
  description: string;
  nullable?: boolean;
  /** Fraction digits for a decimal column. The default is 2. */
  scale?: number;
}

export type SeedRow = Record<string, unknown>;

export interface SeedTable {
  name: string;
  description: string;
  columns: SeedColumn[];
  primaryKey?: string[];
  indexes?: string[][];
  rows: SeedRow[];
}

export const DOMAIN_KEYS = ["app", "billing", "crm", "finance", "product", "marketing", "support"] as const;
export type SeedDomainKey = (typeof DOMAIN_KEYS)[number];

export interface SeedDomain {
  key: SeedDomainKey;
  label: string;
  description: string;
  tables: SeedTable[];
}

/** Identifiers that every adapter accepts without quoting problems. */
export const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function column(
  name: string,
  type: SeedColumnType,
  description: string,
  options: { nullable?: boolean; scale?: number } = {},
): SeedColumn {
  return { name, type, description, ...options };
}

export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function ratio(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Cents to a two-digit dollar amount. */
export function dollars(cents: number): number {
  return Math.round(cents) / 100;
}
