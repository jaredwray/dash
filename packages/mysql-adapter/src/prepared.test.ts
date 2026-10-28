import { beforeEach, expect, it, vi } from "vitest";
import { QueryValidationError } from "@dash/core";
import { MysqlAdapter } from "./adapter.ts";

const pool = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue([[], []]),
  query: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("mysql2/promise", () => ({ createPool: () => pool }));

beforeEach(() => vi.clearAllMocks());

it.each([undefined, {}, ["paid"], Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects unsupported bind values before executing SQL: %j",
  async (value) => {
    const adapter = MysqlAdapter.fromConfig({ kind: "mysql", host: "localhost" });
    try {
      await expect(adapter.query({
        resource: "orders",
        filters: [{ column: "status", op: "eq", value }],
      })).rejects.toThrow(QueryValidationError);
      expect(pool.execute).not.toHaveBeenCalled();
    } finally {
      await adapter.close();
    }
  },
);

it("sends untrusted values separately through server-side prepared statements", async () => {
  const adapter = MysqlAdapter.fromConfig({ kind: "mysql", host: "localhost" });
  const payload = "paid' OR 1=1 -- ";
  try {
    await adapter.query({
      resource: "orders",
      filters: [{ column: "status", op: "eq", value: payload }],
      limit: 10,
      offset: 2,
    });
    expect(pool.execute).toHaveBeenCalledWith(
      "SELECT * FROM `orders` WHERE `status` = ? LIMIT ? OFFSET ?",
      [payload, 10, 2],
    );
    expect(pool.query).not.toHaveBeenCalled();
  } finally {
    await adapter.close();
  }
});
