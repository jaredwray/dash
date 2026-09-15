import type { AdapterQuery, AdapterQueryResult, AdapterSchema } from "@dash/core";
import { getAdapter, testAdapter } from "../adapters/registry.ts";
import { getDataSourceConfig } from "./data-sources.ts";

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
  const adapter = await testAdapter(config);
  try {
    return await adapter.testConnection();
  } finally {
    if (config.kind !== "demo") {
      await adapter.close();
    }
  }
}

export async function testConnectionConfig(config: import("@dash/core").ConnectionConfig) {
  const adapter = await testAdapter(config);
  try {
    return await adapter.testConnection();
  } finally {
    if (config.kind !== "demo") {
      await adapter.close();
    }
  }
}
