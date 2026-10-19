import { type ConnectionConfig, type DataAdapter } from "@dash/core";
import { PostgresAdapter } from "@dash/adapter-postgres";
import { demoAdapter } from "./demo.ts";

const cache = new Map<string, { fingerprint: string; adapter: DataAdapter }>();

function fingerprint(config: ConnectionConfig): string {
  return JSON.stringify(config);
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
  const adapter = PostgresAdapter.fromConfig(config);
  cache.set(dataSourceId, { fingerprint: mark, adapter });
  return adapter;
}

export async function testAdapter(
  config: ConnectionConfig,
): Promise<DataAdapter> {
  if (config.kind === "demo") {
    return demoAdapter;
  }
  return PostgresAdapter.fromConfig(config);
}
