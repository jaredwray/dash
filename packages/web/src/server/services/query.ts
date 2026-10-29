import type {
  AdapterQuery,
  AdapterQueryResult,
  AdapterSchema,
  ConnectionConfig,
  ConnectionTestResult,
  DataAdapter,
} from "@dash/core";
import { getAdapter, testAdapter } from "../adapters/registry.ts";
import { getDataSourceConfig } from "./data-sources.ts";

function failedTest(cause: unknown): ConnectionTestResult {
  return {
    ok: false,
    latencyMs: 0,
    message: cause instanceof Error ? cause.message : "Connection failed",
  };
}

async function openAndTest(config: ConnectionConfig): Promise<ConnectionTestResult> {
  let adapter: DataAdapter;
  try {
    adapter = await testAdapter(config);
  } catch (cause) {
    return failedTest(cause);
  }
  try {
    return await adapter.testConnection();
  } finally {
    if (config.kind !== "demo") {
      await adapter.close();
    }
  }
}

export async function queryDataSource(
  dataSourceId: string,
  query: AdapterQuery,
): Promise<AdapterQueryResult> {
  const config = getDataSourceConfig(dataSourceId);
  if (!config) {
    throw new Error("Data source not found");
  }
  const adapter = getAdapter(dataSourceId, config);
  return adapter.query(query);
}

export async function schemaForDataSource(
  dataSourceId: string,
): Promise<AdapterSchema> {
  const config = getDataSourceConfig(dataSourceId);
  if (!config) {
    throw new Error("Data source not found");
  }
  const adapter = getAdapter(dataSourceId, config);
  return adapter.introspectSchema();
}

export async function testDataSourceConnection(dataSourceId: string) {
  const config = getDataSourceConfig(dataSourceId);
  if (!config) {
    throw new Error("Data source not found");
  }
  return openAndTest(config);
}

export async function testConnectionConfig(config: ConnectionConfig) {
  return openAndTest(config);
}
