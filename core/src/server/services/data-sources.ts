import {
  type ConnectionConfig,
  type DataSourceKind,
  type DataSourceRecord,
} from "@dash/core";
import { decryptJson, encryptJson, randomId } from "../crypto.ts";
import { all, get, nowIso, run } from "../db.ts";
import { getSecret } from "../auth.ts";

interface DataSourceRow {
  id: string;
  name: string;
  kind: DataSourceKind;
  description: string;
  config_encrypted: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function summarize(config: ConnectionConfig): DataSourceRecord["summary"] {
  if (config.kind === "demo") {
    return { warehouse: "built-in sample data" };
  }
  return {
    host: config.host ?? (config.connectionString ? "(connection string)" : ""),
    port: config.port ?? 5432,
    database: config.database ?? "",
    user: config.user ?? "",
    ssl: Boolean(config.ssl),
  };
}

function toRecord(row: DataSourceRow): DataSourceRecord {
  const config = decryptJson<ConnectionConfig>(row.config_encrypted, getSecret());
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    summary: summarize(config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function listDataSources(): DataSourceRecord[] {
  return all<DataSourceRow>(
    "SELECT * FROM data_sources ORDER BY created_at DESC",
  ).map(toRecord);
}

export function getDataSource(id: string): DataSourceRecord | undefined {
  const row = get<DataSourceRow>("SELECT * FROM data_sources WHERE id = ?", [id]);
  return row ? toRecord(row) : undefined;
}

export function getDataSourceConfig(id: string): ConnectionConfig | undefined {
  const row = get<DataSourceRow>("SELECT * FROM data_sources WHERE id = ?", [id]);
  if (!row) {
    return undefined;
  }
  return decryptJson<ConnectionConfig>(row.config_encrypted, getSecret());
}

export function createDataSource(input: {
  name: string;
  description: string;
  config: ConnectionConfig;
  createdBy: string;
}): DataSourceRecord {
  const id = randomId();
  const createdAt = nowIso();
  run(
    `INSERT INTO data_sources (id, name, kind, description, config_encrypted, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.config.kind,
      input.description,
      encryptJson(input.config, getSecret()),
      input.createdBy,
      createdAt,
      createdAt,
    ],
  );
  return getDataSource(id)!;
}

export function updateDataSource(
  id: string,
  patch: {
    name?: string;
    description?: string;
    config?: ConnectionConfig;
  },
): DataSourceRecord | undefined {
  const row = get<DataSourceRow>("SELECT * FROM data_sources WHERE id = ?", [id]);
  if (!row) {
    return undefined;
  }
  const config = patch.config ?? decryptJson<ConnectionConfig>(row.config_encrypted, getSecret());
  const name = patch.name ?? row.name;
  const description = patch.description ?? row.description;
  const updatedAt = nowIso();
  run(
    `UPDATE data_sources
     SET name = ?, kind = ?, description = ?, config_encrypted = ?, updated_at = ?
     WHERE id = ?`,
    [name, config.kind, description, encryptJson(config, getSecret()), updatedAt, id],
  );
  return getDataSource(id);
}

export function deleteDataSource(id: string): boolean {
  const row = get<DataSourceRow>("SELECT id FROM data_sources WHERE id = ?", [id]);
  if (!row) {
    return false;
  }
  run("DELETE FROM data_sources WHERE id = ?", [id]);
  return true;
}
