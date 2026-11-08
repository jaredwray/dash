import { type ConnectionConfig, type DataAdapter } from "@dash/core";
import { BigQueryAdapter } from "@dash/adapter-bigquery";
import { DatabricksAdapter } from "@dash/adapter-databricks";
import { MongoAdapter } from "@dash/adapter-mongodb";
import { MysqlAdapter } from "@dash/adapter-mysql";
import { PostgresAdapter } from "@dash/adapter-postgres";
import { RedshiftAdapter } from "@dash/adapter-redshift";
import { StripeAdapter } from "@dash/adapter-stripe";
import { SnowflakeAdapter } from "@dash/adapter-snowflake";
import { ServerClosingError, isServerClosing, onServerClose } from "../shutdown.ts";

const cache = new Map<string, { fingerprint: string; adapter: DataAdapter }>();

function fingerprint(config: ConnectionConfig): string {
  return JSON.stringify(config);
}

function createAdapter(config: ConnectionConfig): DataAdapter {
  if (isServerClosing()) {
    throw new ServerClosingError();
  }
  switch (config.kind) {
    case "snowflake":
      return SnowflakeAdapter.fromConfig(config);
    case "postgres":
      return PostgresAdapter.fromConfig(config);
    case "mysql":
      return MysqlAdapter.fromConfig(config);
    case "redshift":
      return RedshiftAdapter.fromConfig(config);
    case "stripe":
      return StripeAdapter.fromConfig(config);
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

/**
 * Close each cached adapter and empty the cache. Adapter pools keep sockets
 * open, and an open socket stops Node from exiting after the HTTP server stops.
 */
export async function closeAdapters(): Promise<void> {
  const open = [...cache.values()];
  cache.clear();
  const results = await Promise.allSettled(open.map(({ adapter }) => adapter.close()));
  const reasons = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (reasons.length > 0) {
    throw new AggregateError(reasons, "Failed to close data source adapters");
  }
}

onServerClose(closeAdapters);

export async function testAdapter(
  config: ConnectionConfig,
): Promise<DataAdapter> {
  return createAdapter(config);
}
