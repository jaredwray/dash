/**
 * Adapter kinds Dash knows about. Only `postgres` and `demo` ship in the MVP;
 * the rest are reserved so data-source records and the admin UI stay stable
 * as adapters land.
 */
export const DATA_SOURCE_KINDS = [
  "demo",
  "postgres",
  "mysql",
  "mongodb",
  "bigquery",
  "snowflake",
  "redshift",
  "clickhouse",
] as const;

export type DataSourceKind = (typeof DATA_SOURCE_KINDS)[number];

export function isDataSourceKind(value: string): value is DataSourceKind {
  return (DATA_SOURCE_KINDS as readonly string[]).includes(value);
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface AdapterColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface AdapterResource {
  name: string;
  /** Schema, dataset, or database qualifier when the adapter has one. */
  namespace?: string;
  kind: "table" | "view" | "collection";
  columns: AdapterColumn[];
}

export interface AdapterSchema {
  kind: DataSourceKind;
  resources: AdapterResource[];
}

export const FILTER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "like",
  "ilike",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface AdapterFilter {
  column: string;
  op: FilterOperator;
  value: unknown;
}

export interface AdapterOrderBy {
  column: string;
  direction: "asc" | "desc";
}

export interface AdapterQuery {
  /** Table, view, or collection name. May be `schema.table` for SQL adapters. */
  resource: string;
  columns?: string[];
  filters?: AdapterFilter[];
  orderBy?: AdapterOrderBy[];
  limit?: number;
  offset?: number;
}

export interface AdapterQueryResult {
  columns: AdapterColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface DataAdapter {
  readonly kind: DataSourceKind;
  testConnection(): Promise<ConnectionTestResult>;
  introspectSchema(): Promise<AdapterSchema>;
  query(query: AdapterQuery): Promise<AdapterQueryResult>;
  close(): Promise<void>;
}

export type AdapterFactory<TConfig> = (config: TConfig) => DataAdapter;
