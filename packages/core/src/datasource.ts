import type { DataSourceKind } from "./adapter.ts";

export interface DataSourceRecord {
  id: string;
  name: string;
  kind: DataSourceKind;
  description: string;
  /** Public, non-secret connection hints for the UI. */
  summary: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PostgresConnectionConfig {
  kind: "postgres";
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
}

export interface DemoConnectionConfig {
  kind: "demo";
}

export type ConnectionConfig = PostgresConnectionConfig | DemoConnectionConfig;
