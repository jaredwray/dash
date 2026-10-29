import {
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  type MongoConnectionConfig,
  QueryValidationError,
} from "@dash/core";
import { ConnectionString } from "mongodb-connection-string-url";
import {
  MongoClient,
  type Document,
  type Filter,
  type MongoClientOptions,
  type Sort,
} from "mongodb";
import { compileFind, inferColumns, isListedCollection, resolveCollection } from "./query.ts";

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

const INSECURE_TLS =
  /^(?:tls|ssl)(?:insecure|allowinvalidcertificates|allowinvalidhostnames)$/i;

interface ParsedMongoUri {
  database?: string;
  /** Set when the URI has `tls` or `ssl`. Undefined leaves the driver default. */
  tls?: boolean;
  srv: boolean;
  password?: string;
}

function readMongoUri(connectionString: string): ParsedMongoUri {
  if (
    !/^mongodb(?:\+srv)?:\/\/\S+$/i.test(connectionString) ||
    connectionString.length > 2048
  ) {
    throw new Error("MongoDB connection string must use the mongodb:// or mongodb+srv:// scheme");
  }
  let url: ConnectionString;
  try {
    url = new ConnectionString(connectionString);
  } catch {
    throw new Error("Invalid MongoDB connection string");
  }
  for (const key of url.searchParams.keys()) {
    if (INSECURE_TLS.test(key)) {
      throw new Error("MongoDB connection string cannot disable TLS verification");
    }
  }
  const tlsValues: boolean[] = [];
  for (const [key, raw] of url.searchParams.entries()) {
    if (!/^(?:tls|ssl)$/i.test(key)) {
      continue;
    }
    if (raw !== "true" && raw !== "false") {
      throw new Error("Invalid MongoDB connection string");
    }
    tlsValues.push(raw === "true");
  }
  if (tlsValues.some((value) => value !== tlsValues[0])) {
    throw new Error("Invalid MongoDB connection string");
  }
  let database: string | undefined;
  const pathname = url.pathname.replace(/^\//, "");
  if (pathname) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new Error("MongoDB database name is invalid");
    }
    if (decoded.includes("/")) {
      throw new Error("MongoDB database name is invalid");
    }
    database = assertDatabase(decoded);
  }
  let password = url.password;
  if (password) {
    try {
      password = decodeURIComponent(password);
    } catch {
      // Keep the password text the parser returned.
    }
  }
  return {
    database,
    tls: tlsValues.length > 0 ? tlsValues[0] : undefined,
    srv: url.isSRV,
    password: password || undefined,
  };
}

export function parseMongoConnectionString(connectionString: string): { database?: string } {
  const parsed = readMongoUri(connectionString);
  return parsed.database ? { database: parsed.database } : {};
}

/** TLS the driver will use. `mongodb+srv` defaults to TLS when the URI does not say. */
export function mongoUsesTls(config: MongoConnectionConfig): boolean {
  if (config.connectionString && !config.host) {
    try {
      const parsed = readMongoUri(config.connectionString);
      if (parsed.tls !== undefined) {
        return parsed.tls;
      }
      if (config.tls) {
        return true;
      }
      return parsed.srv;
    } catch {
      return Boolean(config.tls);
    }
  }
  return Boolean(config.tls);
}

function secretsFrom(config: MongoConnectionConfig): string[] {
  const secrets = [config.password, config.connectionString].filter(
    (value): value is string => typeof value === "string" && value.length >= 3,
  );
  if (!config.connectionString) {
    return secrets;
  }
  try {
    const password = readMongoUri(config.connectionString).password;
    if (password && password.length >= 3) {
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
  if (config.connectionString) {
    const parsed = readMongoUri(config.connectionString);
    if (config.tls && parsed.tls === false) {
      throw new Error("MongoDB TLS settings disagree");
    }
    if (config.tls && parsed.tls === undefined) {
      options.tls = true;
    }
    const database = config.database ? assertDatabase(config.database) : parsed.database;
    if (!database) {
      throw new Error("MongoDB database name is required");
    }
    if (config.authSource) {
      options.authSource = assertDatabase(config.authSource);
    }
    return { uri: config.connectionString, database, options };
  }

  if (config.tls) {
    options.tls = true;
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
    if (kind === "Double") {
      const rendered = typeof text === "function" ? text.call(value) : String(value);
      const numeric = Number(rendered);
      return Number.isFinite(numeric) ? numeric : rendered;
    }
    if (kind === "Decimal128" || kind === "Long" || kind === "Int32" || kind === "Timestamp") {
      const rendered = typeof text === "function" ? text.call(value) : String(value);
      if (kind === "Decimal128" && !/^-?\d+$/.test(rendered)) {
        return rendered;
      }
      if (/^-?\d+$/.test(rendered)) {
        const numeric = Number(rendered);
        if (Number.isSafeInteger(numeric) && String(numeric) === rendered) {
          return numeric;
        }
      }
      return rendered;
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
  #columnTypes = new Map<string, Map<string, string>>();

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
        .filter((entry) => isListedCollection(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, MAX_COLLECTIONS);
      const resources: AdapterSchema["resources"] = [];
      for (const entry of selected) {
        const documents = await database
          .collection(entry.name)
          .find({}, { limit: SAMPLE_DOCUMENTS })
          .toArray();
        const columns = inferColumns(documents as Record<string, unknown>[]);
        this.#columnTypes.set(
          entry.name,
          new Map(columns.map((column) => [column.name, column.type])),
        );
        resources.push({
          name: entry.name,
          namespace: this.#database,
          kind: entry.type === "view" ? "view" : "collection",
          columns,
        });
      }
      return { kind: "mongodb", resources };
    } catch (error) {
      throw this.#publicError(error);
    }
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    try {
      const database = this.#client.db(this.#database);
      let literalCollectionExists = false;
      const stripped = resolveCollection(input.resource, this.#database);
      if (stripped !== input.resource) {
        const cursor = database.listCollections({ name: input.resource }, { nameOnly: true });
        try {
          literalCollectionExists = await cursor.hasNext();
        } finally {
          await cursor.close();
        }
      }
      const compiled = compileFind(input, this.#database, {
        columnTypes: this.#columnTypes,
        literalCollectionExists,
      });
      const documents = await database
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
