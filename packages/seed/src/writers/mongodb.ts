import type { MongoConnectionConfig } from "@dash/core";
import { resolveMongoTarget } from "@dash/adapter-mongodb";
import { MongoClient, MongoServerError, type Db, type Document } from "mongodb";
import { SEED_NAME, SEED_VERSION } from "../company.ts";
import type { SeedDomain, SeedDomainKey, SeedTable } from "../table.ts";
import {
  ForeignNamespaceError,
  MANIFEST,
  OWNER_NOTE,
  RowCountError,
  manifestRow,
  throwIfAborted,
  type InspectResult,
  type SeedWriter,
  type TableResult,
  type WriteOptions,
} from "./types.ts";

const BATCH = 5000;
const TEMP_SUFFIX = "__dash_seed_tmp";

interface ManifestDoc extends Document {
  _id: string;
  seed: string;
  collections: string[];
}

export function collectionName(domain: SeedDomainKey, table: string): string {
  return `${domain}_${table}`;
}

function isNamespaceMissing(error: unknown): boolean {
  return error instanceof MongoServerError && (error.code === 26 || error.codeName === "NamespaceNotFound");
}

/** One document for one row. A single-column primary key becomes `_id`. */
export function toDocument(table: SeedTable, row: Record<string, unknown>): Document {
  const doc: Document = {};
  if (table.primaryKey?.length === 1) doc._id = row[table.primaryKey[0]!];
  for (const column of table.columns) {
    const raw = row[column.name];
    if (raw === undefined || raw === null) {
      doc[column.name] = null;
    } else if (column.type === "date" && typeof raw === "string") {
      doc[column.name] = new Date(`${raw}T00:00:00.000Z`);
    } else {
      doc[column.name] = raw;
    }
  }
  return doc;
}

export class MongoSeedWriter implements SeedWriter {
  readonly kind = "mongodb" as const;
  readonly #client: MongoClient;
  readonly #database: string;
  #db: Db | undefined;

  constructor(config: MongoConnectionConfig) {
    const target = resolveMongoTarget(config);
    this.#client = new MongoClient(target.uri, { ...target.options, appName: "dash-seed" });
    this.#database = target.database;
  }

  namespace(domain: SeedDomainKey): string {
    return `${domain}_*`;
  }

  async #connect(): Promise<Db> {
    if (!this.#db) {
      await this.#client.connect();
      this.#db = this.#client.db(this.#database);
    }
    return this.#db;
  }

  async #manifest(db: Db, domain: SeedDomainKey): Promise<ManifestDoc | null> {
    return db.collection<ManifestDoc>(MANIFEST).findOne({ _id: domain });
  }

  async inspect(domain: Pick<SeedDomain, "key" | "tables">): Promise<InspectResult> {
    const db = await this.#connect();
    const names = domain.tables.map((table) => collectionName(domain.key, table.name));
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
    const manifest = await this.#manifest(db, domain.key);
    if (manifest && manifest.seed !== SEED_NAME) return { state: "foreign", conflicts: [`${MANIFEST}.${domain.key}`] };
    const owned = new Set(manifest?.collections ?? []);
    const conflicts = names.filter((name) => existing.has(name) && !owned.has(name));
    if (conflicts.length > 0) return { state: "foreign", conflicts };
    return { state: manifest ? "owned" : "absent", conflicts: [] };
  }

  async replace(domain: SeedDomain, options: WriteOptions): Promise<TableResult[]> {
    const db = await this.#connect();
    const state = await this.inspect(domain);
    if (state.state === "foreign") throw new ForeignNamespaceError(`Database ${this.#database}`, state.conflicts);
    const names = domain.tables.map((table) => collectionName(domain.key, table.name));
    const previous = (await this.#manifest(db, domain.key))?.collections ?? [];
    const manifests = db.collection<ManifestDoc>(MANIFEST);
    // Claim the names first, so a failed run can be retried or removed.
    await manifests.updateOne(
      { _id: domain.key },
      {
        $set: { seed: SEED_NAME, note: OWNER_NOTE, status: "writing" },
        $addToSet: { collections: { $each: names } },
      },
      { upsert: true },
    );

    const results: TableResult[] = [];
    for (const table of domain.tables) {
      throwIfAborted(options.signal);
      const name = collectionName(domain.key, table.name);
      const temp = `${name}${TEMP_SUFFIX}`;
      await db.collection(temp).drop().catch((error: unknown) => {
        if (!isNamespaceMissing(error)) throw error;
      });
      const collection = db.collection(temp);
      for (let start = 0; start < table.rows.length; start += BATCH) {
        throwIfAborted(options.signal);
        const docs = table.rows.slice(start, start + BATCH).map((row) => toDocument(table, row));
        await collection.insertMany(docs, { ordered: false });
      }
      if (table.rows.length === 0) await db.createCollection(temp);
      const actual = await collection.countDocuments();
      if (actual !== table.rows.length) throw new RowCountError(name, table.rows.length, actual);
      await collection.rename(name, { dropTarget: true });
      for (const columns of table.indexes ?? []) {
        await db.collection(name).createIndex(Object.fromEntries(columns.map((column) => [column, 1])));
      }
      results.push({ table: table.name, rows: actual });
      options.onTable?.(table.name, actual);
    }

    for (const stale of previous.filter((name) => !names.includes(name))) {
      await db.collection(stale).drop().catch((error: unknown) => {
        if (!isNamespaceMissing(error)) throw error;
      });
    }
    const manifest = manifestRow(domain, options, SEED_VERSION, SEED_NAME);
    await manifests.updateOne(
      { _id: domain.key },
      { $set: { ...manifest, note: OWNER_NOTE, collections: names, status: "complete" } },
    );
    return results;
  }

  async remove(domain: SeedDomainKey): Promise<boolean> {
    const db = await this.#connect();
    const manifest = await this.#manifest(db, domain);
    if (!manifest) return false;
    if (manifest.seed !== SEED_NAME) throw new ForeignNamespaceError(`Database ${this.#database}`, [`${MANIFEST}.${domain}`]);
    for (const name of manifest.collections) {
      for (const target of [name, `${name}${TEMP_SUFFIX}`]) {
        await db.collection(target).drop().catch((error: unknown) => {
          if (!isNamespaceMissing(error)) throw error;
        });
      }
    }
    await db.collection<ManifestDoc>(MANIFEST).deleteOne({ _id: domain });
    if ((await db.collection(MANIFEST).countDocuments()) === 0) {
      await db.collection(MANIFEST).drop().catch(() => undefined);
    }
    return true;
  }

  async close(): Promise<void> {
    await this.#client.close();
  }
}
