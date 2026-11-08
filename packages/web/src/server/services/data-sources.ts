import { bigQueryEndpoint, isGoogleApiHost } from "@dash/adapter-bigquery";
import { databricksPublicSummary } from "@dash/adapter-databricks";
import { redshiftPublicSummary } from "@dash/adapter-redshift";
import { stripePublicSummary } from "@dash/adapter-stripe";
import { mongoUsesTls, parseMongoConnectionString } from "@dash/adapter-mongodb";
import { parseMysqlConnectionString } from "@dash/adapter-mysql";
import {
  type ConnectionConfig,
  type DataSourceKind,
  type DataSourceRecord,
} from "@dash/core";
import { assertUserExists, getSecret } from "../auth.ts";
import { decryptJson, encryptJson, randomId } from "../crypto.ts";
import { dataSources, nowIso, type DataSourceDoc } from "../db.ts";

function databaseFromMongoUri(uri: string): string {
  try {
    return parseMongoConnectionString(uri).database ?? "";
  } catch {
    return "";
  }
}

function summarize(config: ConnectionConfig): DataSourceRecord["summary"] {
  if (config.kind === "snowflake") {
    return {
      account: config.account ?? (config.connectionString ? "(connection string)" : ""),
      warehouse: config.warehouse ?? "",
      database: config.database ?? "",
      schema: config.schema ?? "",
      role: config.role ?? "",
    };
  }
  if (config.kind === "databricks") {
    return databricksPublicSummary(config);
  }
  if (config.kind === "bigquery") {
    let endpoint = "bigquery.googleapis.com";
    let auth = config.credentials ? "service-account" : "adc";
    if (config.apiEndpoint) {
      try {
        const url = bigQueryEndpoint(config.apiEndpoint);
        endpoint = url.host;
        if (!config.credentials) {
          auth = isGoogleApiHost(url) ? "adc" : "anonymous";
        }
      } catch {
        endpoint = "";
        if (!config.credentials) {
          auth = "";
        }
      }
    }
    return {
      project: config.projectId,
      dataset: config.dataset ?? "",
      location: config.location ?? "",
      endpoint,
      auth,
    };
  }
  if (config.kind === "mysql") {
    const usingUri = Boolean(config.connectionString) && !config.host;
    if (usingUri && config.connectionString) {
      try {
        const parsed = parseMysqlConnectionString(config.connectionString);
        const summary: DataSourceRecord["summary"] = {
          host: parsed.host ?? "(connection string)",
          database: parsed.database ?? "",
          user: parsed.user ?? "",
          ssl: Boolean(config.ssl || parsed.ssl),
        };
        if (parsed.port != null) {
          summary.port = parsed.port;
        }
        return summary;
      } catch {
        return {
          host: "(connection string)",
          database: "",
          user: "",
          ssl: Boolean(config.ssl),
        };
      }
    }
    return {
      host: config.host ?? "",
      port: config.port ?? 3306,
      database: config.database ?? "",
      user: config.user ?? "",
      ssl: Boolean(config.ssl),
    };
  }
  if (config.kind === "redshift") {
    return redshiftPublicSummary(config);
  }
  if (config.kind === "stripe") {
    return stripePublicSummary(config);
  }
  if (config.kind === "mongodb") {
    const usingUri = Boolean(config.connectionString) && !config.host;
    const summary: DataSourceRecord["summary"] = {
      host: config.host ?? (usingUri ? "(connection string)" : ""),
      database: config.database || (config.connectionString ? databaseFromMongoUri(config.connectionString) : ""),
      user: config.user ?? "",
      tls: mongoUsesTls(config),
    };
    if (config.port != null) {
      summary.port = config.port;
    } else if (!usingUri) {
      summary.port = 27017;
    }
    return summary;
  }
  return {
    host: config.host ?? (config.connectionString ? "(connection string)" : ""),
    port: config.port ?? 5432,
    database: config.database ?? "",
    user: config.user ?? "",
    ssl: Boolean(config.ssl),
  };
}

function toRecord(row: DataSourceDoc): DataSourceRecord {
  const config = decryptJson<ConnectionConfig>(row.configEncrypted, getSecret());
  return {
    id: row._id,
    name: row.name,
    kind: row.kind as DataSourceKind,
    description: row.description,
    summary: summarize(config),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

export async function listDataSources(): Promise<DataSourceRecord[]> {
  const rows = await (await dataSources()).find({}).sort({ createdAt: -1 }).toArray();
  return rows.map(toRecord);
}

export async function getDataSource(id: string): Promise<DataSourceRecord | undefined> {
  const row = await (await dataSources()).findOne({ _id: id });
  return row ? toRecord(row) : undefined;
}

export async function getDataSourceConfig(id: string): Promise<ConnectionConfig | undefined> {
  const row = await (await dataSources()).findOne({ _id: id });
  if (!row) {
    return undefined;
  }
  return decryptJson<ConnectionConfig>(row.configEncrypted, getSecret());
}

export async function createDataSource(input: {
  name: string;
  description: string;
  config: ConnectionConfig;
  createdBy: string;
}): Promise<DataSourceRecord> {
  await assertUserExists(input.createdBy);
  const id = randomId();
  const createdAt = nowIso();
  await (
    await dataSources()
  ).insertOne({
    _id: id,
    name: input.name,
    kind: input.config.kind,
    description: input.description,
    configEncrypted: encryptJson(input.config, getSecret()),
    createdBy: input.createdBy,
    createdAt,
    updatedAt: createdAt,
  });
  return (await getDataSource(id))!;
}

export async function updateDataSource(
  id: string,
  patch: {
    name?: string;
    description?: string;
    config?: ConnectionConfig;
  },
): Promise<DataSourceRecord | undefined> {
  const row = await (await dataSources()).findOne({ _id: id });
  if (!row) {
    return undefined;
  }
  const config = patch.config ?? decryptJson<ConnectionConfig>(row.configEncrypted, getSecret());
  const name = patch.name ?? row.name;
  const description = patch.description ?? row.description;
  const updatedAt = nowIso();
  await (
    await dataSources()
  ).updateOne(
    { _id: id },
    {
      $set: {
        name,
        kind: config.kind,
        description,
        configEncrypted: encryptJson(config, getSecret()),
        updatedAt,
      },
    },
  );
  return getDataSource(id);
}

export async function deleteDataSource(id: string): Promise<boolean> {
  const result = await (await dataSources()).deleteOne({ _id: id });
  return result.deletedCount === 1;
}
