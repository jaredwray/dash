import type { ConnectionConfig } from "@dash/core";
import { BigQuerySeedWriter } from "./bigquery.ts";
import { MongoSeedWriter } from "./mongodb.ts";
import { PostgresSeedWriter } from "./postgres.ts";
import type { SeedWriter } from "./types.ts";

/** A writer for a data source config, or null when the kind has no writer yet. */
export function createSeedWriter(config: ConnectionConfig): SeedWriter | null {
  switch (config.kind) {
    case "postgres":
      return new PostgresSeedWriter(config);
    case "mongodb":
      return new MongoSeedWriter(config);
    case "bigquery":
      return new BigQuerySeedWriter(config);
    default:
      return null;
  }
}

export { BigQuerySeedWriter, MongoSeedWriter, PostgresSeedWriter };
export * from "./types.ts";
