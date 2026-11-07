import type { ConnectionConfig } from "@dash/core";
import { bigQueryEndpoint } from "@dash/adapter-bigquery";
import { resolveMongoTarget } from "@dash/adapter-mongodb";
import { postgresPoolConfig } from "@dash/adapter-postgres";

function hostPart(uri: string): string {
  const scheme = uri.indexOf("://");
  const rest = scheme >= 0 ? uri.slice(scheme + 3) : uri;
  const authority = rest.split(/[/?#]/)[0] ?? "";
  const at = authority.lastIndexOf("@");
  return (at >= 0 ? authority.slice(at + 1) : authority).toLowerCase();
}

/**
 * Where a data source writes: engine, host, and database or project. It
 * holds no user name, password, token, or key. Removal compares it with the
 * value saved at seed time, so it never acts on a source that someone
 * pointed somewhere else.
 */
export function seedTarget(config: ConnectionConfig): string | null {
  switch (config.kind) {
    case "postgres": {
      const pool = postgresPoolConfig(config);
      if (pool.connectionString) {
        const url = new URL(pool.connectionString);
        return `postgres://${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
      }
      return `postgres://${String(pool.host ?? "").toLowerCase()}:${pool.port ?? 5432}/${pool.database ?? ""}`;
    }
    case "mongodb": {
      const target = resolveMongoTarget(config);
      const hosts = hostPart(target.uri).split(",").sort().join(",");
      return `${target.uri.startsWith("mongodb+srv:") ? "mongodb+srv" : "mongodb"}://${hosts}/${target.database}`;
    }
    case "bigquery":
      return `bigquery://${bigQueryEndpoint(config.apiEndpoint).host}/${config.projectId}`;
    default:
      return null;
  }
}
