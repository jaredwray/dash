import { type ConnectionConfig, type DataAdapter } from "@dash/core";
import { BigQueryAdapter } from "@dash/adapter-bigquery";
import { DatabricksAdapter } from "@dash/adapter-databricks";
import { MongoAdapter } from "@dash/adapter-mongodb";
import { PostgresAdapter } from "@dash/adapter-postgres";
import { SnowflakeAdapter } from "@dash/adapter-snowflake";
import { demoAdapter } from "./demo.ts";

const cache = new Map<string, { fingerprint: string; adapter: DataAdapter }>();

function fingerprint(config: ConnectionConfig): string {
  return JSON.stringify(config);
}

function createAdapter(config: ConnectionConfig): DataAdapter {
  switch (config.kind) {
    case "demo":
      return demoAdapter;
    case "snowflake":
      return SnowflakeAdapter.fromConfig(config);
    case "postgres":
      return PostgresAdapter.fromConfig(config);
    case "mongodb":
      return MongoAdapter.fromConfig(config);
    case "bigquery":
      return BigQueryAdapter.fromConfig(config);
    case "databricks":
      return DatabricksAdapter.fromConfig(config);
  }
}

export function getAdapter(
  dataSourceId: string,
  config: ConnectionConfig,
): DataAdapter {
  if (config.kind === "demo") {
    return demoAdapter;
  }
  const existing = cache.get(dataSourceId);
  const mark = fingerprint(config);
  if (existing && existing.fingerprint === mark) {
    return existing.adapter;
  }
  void existing?.adapter.close().catch(() => undefined);
  const adapter = createAdapter(config);
  cache.set(dataSourceId, { fingerprint: mark, adapter });
  return adapter;
}

export async function testAdapter(
  config: ConnectionConfig,
): Promise<DataAdapter> {
  return createAdapter(config);
}
