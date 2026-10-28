import type { PoolOptions } from "mysql2/promise";

/** mysql2 skips hostname checks unless verifyIdentity is set. */
export function mysqlTls(enabled: boolean): PoolOptions["ssl"] {
  if (!enabled) {
    return undefined;
  }
  return {
    minVersion: "TLSv1.2",
    verifyIdentity: true,
  };
}
