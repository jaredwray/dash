import { beforeEach, expect, it, vi } from "vitest";
import { QueryValidationError } from "@dash/core";
import { RedshiftAdapter } from "./adapter.ts";

const pool = vi.hoisted(() => ({
  options: [] as unknown[],
  query: vi.fn().mockResolvedValue({ rows: [], fields: [] }),
  end: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("pg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pg")>();
  const pgActual = actual.default;
  return {
    ...actual,
    default: {
      ...pgActual,
      Pool: class {
        constructor(options: unknown) {
          pool.options.push(options);
        }
        query = pool.query;
        end = pool.end;
        on() {
          return this;
        }
      },
    },
  };
});

const config = {
  kind: "redshift" as const,
  host: "localhost",
  database: "dash",
  user: "dash",
};

beforeEach(() => {
  vi.clearAllMocks();
  pool.options.length = 0;
});

it.each([undefined, {}, ["paid"], Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects unsupported bind values before executing SQL: %j",
  async (value) => {
    const adapter = RedshiftAdapter.fromConfig(config);
    try {
      await expect(
        adapter.query({
          resource: "orders",
          filters: [{ column: "status", op: "eq", value }],
        }),
      ).rejects.toThrow(QueryValidationError);
      expect(pool.query).not.toHaveBeenCalled();
    } finally {
      await adapter.close();
    }
  },
);

it("builds the pool from parsed fields and verifies the certificate when TLS is on", async () => {
  const adapter = RedshiftAdapter.fromConfig({
    kind: "redshift",
    connectionString:
      "redshift://dash:super-secret@example.redshift.amazonaws.com/analytics?sslmode=require",
  });
  try {
    const options = pool.options.at(-1) as {
      ssl?: { rejectUnauthorized?: boolean; checkServerIdentity?: () => undefined };
      query_timeout?: number;
      statement_timeout?: number;
    };
    expect(options).toMatchObject({
      host: "example.redshift.amazonaws.com",
      port: 5439,
      database: "analytics",
      user: "dash",
      password: "super-secret",
      query_timeout: 60_000,
      statement_timeout: 60_000,
    });
    expect(options.ssl?.rejectUnauthorized).toBe(true);
    expect(options.ssl?.checkServerIdentity?.()).toBeUndefined();
    expect(options).not.toHaveProperty("connectionString");
  } finally {
    await adapter.close();
  }
});

it("sends untrusted values as parameters on the wire protocol", async () => {
  const adapter = RedshiftAdapter.fromConfig(config);
  const payload = "paid' OR 1=1 -- ";
  try {
    await adapter.query({
      resource: "orders",
      filters: [{ column: "status", op: "eq", value: payload }],
      limit: 10,
      offset: 2,
    });
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM "orders" WHERE "status" = $1 LIMIT $2 OFFSET $3',
      [payload, 11, 2],
    );
  } finally {
    await adapter.close();
  }
});
