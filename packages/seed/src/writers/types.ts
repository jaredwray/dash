import type { SeedableKind } from "../plan.ts";
import type { SeedColumn, SeedDomain, SeedDomainKey } from "../table.ts";

/** The name of the ownership marker table or collection in each namespace. */
export const MANIFEST = "dash_seed_manifest";

/** Text that marks a namespace that the seeder created. */
export const OWNER_NOTE = "Fernway sample data from Dash. Development only. Safe to drop.";

export type NamespaceState = "absent" | "owned" | "foreign";

export interface InspectResult {
  state: NamespaceState;
  /** Objects with a seed name that the seeder does not own. */
  conflicts: string[];
}

export interface WriteOptions {
  signal?: AbortSignal;
  /** Called after each table is written and verified. */
  onTable?: (table: string, rows: number) => void;
  size: string;
  asOf: Date;
}

export interface TableResult {
  table: string;
  rows: number;
}

/** Writes the tables of one domain into one data source. */
export interface SeedWriter {
  readonly kind: SeedableKind;
  /** The schema, dataset, or collection prefix of a domain in this source. */
  namespace(domain: SeedDomainKey): string;
  inspect(domain: Pick<SeedDomain, "key" | "tables">): Promise<InspectResult>;
  /** Replaces the domain. It refuses a namespace that the seeder does not own. */
  replace(domain: SeedDomain, options: WriteOptions): Promise<TableResult[]>;
  /** Drops the domain when the seeder owns it. Returns false when there is nothing to drop. */
  remove(domain: SeedDomainKey): Promise<boolean>;
  close(): Promise<void>;
}

/** The seeder found objects it does not own where it must write. */
export class ForeignNamespaceError extends Error {
  readonly conflicts: string[];

  constructor(target: string, conflicts: string[]) {
    super(`${target} already holds data that Dash did not create: ${conflicts.join(", ")}. Rename or remove it, then seed again.`);
    this.name = "ForeignNamespaceError";
    this.conflicts = conflicts;
  }
}

/** A table that did not hold the expected row count after the write. */
export class RowCountError extends Error {
  constructor(table: string, expected: number, actual: number) {
    super(`${table} holds ${actual} rows after the write, but ${expected} rows were sent`);
    this.name = "RowCountError";
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("Seed run stopped");
  }
}

export function manifestRow(domain: SeedDomain, options: WriteOptions, version: number, seed: string) {
  return {
    seed,
    version,
    domain: domain.key,
    tables: domain.tables.map((table) => table.name),
    size: options.size,
    as_of: options.asOf.toISOString().slice(0, 10),
    written_at: new Date(),
  };
}

export function isNullable(column: SeedColumn): boolean {
  return column.nullable === true;
}
