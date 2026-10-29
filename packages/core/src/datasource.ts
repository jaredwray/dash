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

export interface MysqlConnectionConfig {
  kind: "mysql";
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

export interface SnowflakeConnectionConfig {
  kind: "snowflake";
  connectionString?: string;
  account?: string;
  user?: string;
  password?: string;
  warehouse?: string;
  database?: string;
  schema?: string;
  role?: string;
  authenticator?: string;
}

export interface MongoConnectionConfig {
  kind: "mongodb";
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** Authentication database. Defaults to `admin` when a user is set without a connection string. */
  authSource?: string;
  tls?: boolean;
}

export interface RedshiftConnectionConfig {
  kind: "redshift";
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** Encrypt the session and verify the server certificate. */
  ssl?: boolean;
}

export interface BigQueryConnectionConfig {
  kind: "bigquery";
  projectId: string;
  /** Default dataset. Unqualified resources are `dataset.table`. */
  dataset?: string;
  /** BigQuery location, such as `US` or `us-central1`. */
  location?: string;
  /**
   * Service account key fields. Omit to use Application Default Credentials.
   * The private key stays inside the encrypted data-source config.
   */
  credentials?: {
    client_email: string;
    private_key: string;
  };
  /**
   * API origin. The local emulator is `http://127.0.0.1:9059`.
   * Non-Google hosts are called without an access token.
   */
  apiEndpoint?: string;
}

export type ConnectionConfig =
  | PostgresConnectionConfig
  | MysqlConnectionConfig
  | DemoConnectionConfig
  | SnowflakeConnectionConfig
  | MongoConnectionConfig
  | BigQueryConnectionConfig
  | RedshiftConnectionConfig;
