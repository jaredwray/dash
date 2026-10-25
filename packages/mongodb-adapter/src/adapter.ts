import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  type MongoConnectionConfig,
  QueryValidationError,
} from "@dash/core";
import {
  MongoClient,
  type Document,
  type Filter,
  type MongoClientOptions,
  type Sort,
} from "mongodb";
import { compileFind, inferColumns } from "./query.ts";

const SAMPLE_DOCUMENTS = 50;
const MAX_COLLECTIONS = 200;
const HOST_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const DATABASE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export interface MongoTarget {
  uri: string;
  database: string;
  options: MongoClientOptions;
}

function assertDatabase(name: string): string {
  if (!DATABASE_NAME.test(name)) {
    throw new Error("MongoDB database name is invalid");
  }
  return name;
}

function assertHost(host: string): string {
  if (host.length > 253 || !HOST_NAME.test(host) || host.includes("..")) {
    throw new Error("MongoDB host is invalid");
  }
  return host;
}

function assertPort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MongoDB port is invalid");
  }
  return port;
}

function assertCredential(value: string, label: string): string {
  if (value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`MongoDB ${label} is invalid`);
  }
  return value;
}

export function parseMongoConnectionString(connectionString: string): { database?: string } {
  if (
    !/^mongodb(?:\+srv)?:\/\/\S+$/i.test(connectionString) ||
    connectionString.length > 2048
  ) {
    throw new Error("MongoDB connection string must use the mongodb:// or mongodb+srv:// scheme");
  }
  const normalized = connectionString
    .replace(/^mongodb\+srv:\/\//i, "https://")
    .replace(/^mongodb:\/\//i, "http://");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Invalid MongoDB connection string");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) {
    return {};
  }
  if (database.includes("/")) {
    throw new Error("MongoDB database name is invalid");
  }
  return { database: assertDatabase(database) };
}

function secretsFrom(config: MongoConnectionConfig): string[] {
  const secrets = [config.password, config.connectionString].filter(
    (value): value is string => typeof value === "string" && value.length >= 3,
  );
  if (!config.connectionString) {
    return secrets;
  }
  try {
    const normalized = config.connectionString
      .replace(/^mongodb\+srv:\/\//i, "https://")
      .replace(/^mongodb:\/\//i, "http://");
    const password = decodeURIComponent(new URL(normalized).password);
    if (password.length >= 3) {
      secrets.push(password);
    }
  } catch {
    // The connection string is already in the list when it is long enough.
  }
  return secrets;
}

/**
 * Resolves a connection without putting discrete credentials into the URI.
 * Host and port are validated so they cannot change the URI path or userinfo.
 */
export function resolveMongoTarget(config: MongoConnectionConfig): MongoTarget {
  const options: MongoClientOptions = {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    appName: "dash",
  };
  if (config.tls) {
    options.tls = true;
  }

  if (config.connectionString) {
    const parsed = parseMongoConnectionString(config.connectionString);
    const database = config.database ? assertDatabase(config.database) : parsed.database;
    if (!database) {
      throw new Error("MongoDB database name is required");
    }
    if (config.authSource) {
      options.authSource = assertDatabase(config.authSource);
    }
    return { uri: config.connectionString, database, options };
  }

  if (!config.host) {
    throw new Error("MongoDB host is required");
  }
  const host = assertHost(config.host);
  const port = assertPort(config.port ?? 27017);
  if (!config.database) {
    throw new Error("MongoDB database name is required");
  }
  const database = assertDatabase(config.database);
  if (config.user) {
    options.auth = {
      username: assertCredential(config.user, "user"),
      password: assertCredential(config.password ?? "", "password"),
    };
    options.authSource = assertDatabase(config.authSource ?? "admin");
  }
  return { uri: `mongodb://${host}:${port}`, database, options };
}

export function scrubSecrets(message: string, secrets: readonly string[]): string {
  const unique = [...new Set(secrets.filter((secret) => secret.length >= 3))];
  unique.sort((left, right) => right.length - left.length);
  let text = message;
  for (const secret of unique) {
    text = text.split(secret).join("[redacted]");
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret && encoded.length >= 3) {
      text = text.split(encoded).join("[redacted]");
    }
  }
  return text.slice(0, 500);
}

function plainRecord(): Record<string, unknown> {
  return {};
}

function assignPlain(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toPlain(entry));
  }
  if (typeof value === "object") {
    const kind = (value as { _bsontype?: unknown })._bsontype;
    const text = (value as { toString?: () => string }).toString;
    if (kind === "ObjectId") {
      const hex = (value as { toHexString?: () => string }).toHexString;
      if (typeof hex === "function") {
        return hex.call(value);
      }
    }
    if (
      kind === "Decimal128" ||
      kind === "Long" ||
      kind === "Int32" ||
      kind === "Double" ||
      kind === "Timestamp"
    ) {
      const rendered = typeof text === "function" ? text.call(value) : String(value);
      const numeric = Number(rendered);
      return Number.isFinite(numeric) ? numeric : rendered;
    }
    if (typeof kind === "string" && kind !== "Object" && typeof text === "function") {
      const rendered = text.call(value);
      if (rendered !== "[object Object]") {
        return rendered;
      }
    }
    const output = plainRecord();
    for (const key of Object.keys(value as Record<string, unknown>)) {
      assignPlain(output, key, toPlain((value as Record<string, unknown>)[key]));
    }
    return output;
  }
  return String(value);
}

function columnsFor(
  rows: Record<string, unknown>[],
  requested: string[] | undefined,
): AdapterQueryResult["columns"] {
  const names =
    requested && requested.length > 0
      ? requested
      : rows.reduce<string[]>((collected, row) => {
          for (const key of Object.keys(row)) {
            if (!collected.includes(key)) {
              collected.push(key);
            }
          }
          return collected;
        }, []);
  return names.map((name) => ({ name, type: "unknown", nullable: true }));
}

export class MongoAdapter implements DataAdapter {
  readonly kind = "mongodb" as const;
  #client: MongoClient;
  #database: string;
  #secrets: readonly string[];

  constructor(client: MongoClient, database: string, secrets: readonly string[] = []) {
    this.#client = client;
    this.#database = database;
    this.#secrets = secrets;
  }

  static fromConfig(config: MongoConnectionConfig): MongoAdapter {
    const target = resolveMongoTarget(config);
    return new MongoAdapter(new MongoClient(target.uri, target.options), target.database, secretsFrom(config));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.#client.db(this.#database).command({ ping: 1 });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: "Connected to MongoDB",
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: scrubSecrets(
          error instanceof Error ? error.message : "Connection failed",
          this.#secrets,
        ),
      };
    }
  }

  async introspectSchema(): Promise<AdapterSchema> {
    try {
      const database = this.#client.db(this.#database);
      const listed = await database.listCollections({}, { nameOnly: false }).toArray();
      const selected = listed
        .filter((entry) => !entry.name.startsWith("system."))
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, MAX_COLLECTIONS);
      const resources: AdapterSchema["resources"] = [];
      for (const entry of selected) {
        const documents = await database
          .collection(entry.name)
          .find({}, { limit: SAMPLE_DOCUMENTS })
          .toArray();
        resources.push({
          name: entry.name,
          namespace: this.#database,
          kind: entry.type === "view" ? "view" : "collection",
          columns: inferColumns(documents as Record<string, unknown>[]),
        });
      }
      return { kind: "mongodb", resources };
    } catch (error) {
      throw this.#publicError(error);
    }
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    const compiled = compileFind(input, this.#database);
    try {
      const documents = await this.#client
        .db(this.#database)
        .collection(compiled.collection)
        .find(compiled.filter as Filter<Document>, {
          projection: compiled.projection,
          sort: compiled.sort as Sort | undefined,
          limit: compiled.limit,
          skip: compiled.skip,
        })
        .toArray();
      const rows = documents.map((document) => toPlain(document) as Record<string, unknown>);
      return {
        columns: columnsFor(rows, input.columns),
        rows,
        rowCount: rows.length,
        truncated: rows.length === compiled.limit,
      };
    } catch (error) {
      throw this.#publicError(error);
    }
  }

  async close(): Promise<void> {
    await this.#client.close();
  }

  #publicError(error: unknown): Error {
    if (error instanceof QueryValidationError) {
      return error;
    }
    return new Error(
      scrubSecrets(error instanceof Error ? error.message : "MongoDB request failed", this.#secrets),
    );
  }
}

export function createMongoAdapter(config: MongoConnectionConfig): MongoAdapter {
  return MongoAdapter.fromConfig(config);
}
