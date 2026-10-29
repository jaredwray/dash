import { describe, expect, it, vi } from "vitest";
import { createDatabricksClient, databricksOrigin } from "./http.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestInit(fetchImpl: { mock: { calls: unknown[][] } }, index: number): RequestInit {
  const init = fetchImpl.mock.calls[index]?.[1];
  if (!init || typeof init !== "object") {
    throw new Error(`missing request init at call ${index}`);
  }
  return init as RequestInit;
}

const clientConfig = {
  host: "127.0.0.1",
  warehouseId: "dash",
  token: "dash-token",
  origin: new URL("http://127.0.0.1:14439"),
  catalog: "dash",
  schema: "analytics",
};

describe("Databricks SQL HTTP client", () => {
  it("decodes inline rows and sends the token only as a bearer header", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        statement_id: "s1",
        status: { state: "SUCCEEDED" },
        manifest: {
          schema: {
            columns: [
              { name: "id", type_name: "INT", type_text: "INT", position: 0 },
              { name: "note", type_name: "STRING", type_text: "STRING", position: 1 },
              { name: "active", type_name: "BOOLEAN", type_text: "BOOLEAN", position: 2 },
            ],
          },
        },
        result: { data_array: [["4", null, "true"]] },
      }),
    );
    const client = createDatabricksClient({ ...clientConfig, fetchImpl });
    const result = await client.query("SELECT 1", [{ name: "p0", type: "INT", value: 4 }]);
    expect(result.rows).toEqual([{ id: 4, note: null, active: true }]);
    expect(result.fields[0]).toEqual({ name: "id", type: "INT", nullable: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://127.0.0.1:14439/api/2.0/sql/statements");
    const init = requestInit(fetchImpl, 0);
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer dash-token");
    const body = JSON.parse(String(init.body)) as {
      warehouse_id: string;
      parameters: Array<{ name: string; type: string; value: string }>;
    };
    expect(body.warehouse_id).toBe("dash");
    expect(body.parameters).toEqual([{ name: "p0", type: "INT", value: "4" }]);
    expect(JSON.stringify(body)).not.toContain("dash-token");
  });

  it("polls a pending statement and appends the next chunk", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const path = String(url);
      if (path.endsWith("/statements")) {
        return jsonResponse({ statement_id: "s2", status: { state: "PENDING" } });
      }
      if (path.endsWith("/chunks/1")) {
        return jsonResponse({ data_array: [["2"]], next_chunk_index: null });
      }
      return jsonResponse({
        statement_id: "s2",
        status: { state: "SUCCEEDED" },
        manifest: {
          schema: { columns: [{ name: "id", type_name: "INT", type_text: "INT", position: 0 }] },
        },
        result: { chunk_index: 0, data_array: [["1"]], next_chunk_index: 1 },
      });
    });
    const client = createDatabricksClient({ ...clientConfig, fetchImpl });
    const result = await client.query("SELECT id FROM t");
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.fields[0]?.nullable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("refuses external result links", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        statement_id: "s3",
        status: { state: "SUCCEEDED" },
        manifest: { schema: { columns: [] } },
        result: { external_links: [{ external_link: "https://example.test/data" }] },
      }),
    );
    const client = createDatabricksClient({ ...clientConfig, fetchImpl });
    await expect(client.query("SELECT 1")).rejects.toThrow(/external links/);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/statements");
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toContain("/cancel");
  });

  it("reports a closed client and requires https for cloud workspaces", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createDatabricksClient({ ...clientConfig, fetchImpl });
    await client.end();
    await expect(client.query("SELECT 1")).rejects.toThrow(/closed/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => databricksOrigin("http://adb-1.12.azuredatabricks.net", "adb-1.12.azuredatabricks.net")).toThrow(
      /https/,
    );
    expect(() => databricksOrigin("https://evil.test", "adb-1.12.azuredatabricks.net")).toThrow(/match/);
    expect(() => databricksOrigin("http://evil.test", "evil.test")).toThrow(/https/);
    expect(databricksOrigin("http://127.0.0.1:14439", "127.0.0.1").origin).toBe("http://127.0.0.1:14439");
  });

  it("keeps exact decimals and integers that do not round-trip", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        statement_id: "s4",
        status: { state: "SUCCEEDED" },
        manifest: {
          schema: {
            columns: [
              { name: "amount", type_name: "DECIMAL", type_text: "DECIMAL(18,2)", position: 0 },
              { name: "wide", type_name: "BIGINT", type_text: "BIGINT", position: 1 },
              { name: "flag", type_name: "BOOLEAN", type_text: "BOOLEAN", position: 2 },
              { name: "id", type_name: "INT", type_text: "INT", position: 3 },
              { name: "", type_name: "STRING", type_text: "STRING", position: 4 },
            ],
          },
        },
        result: {
          chunk_index: 0,
          data_array: [["9007199254740993.25", "9007199254740993", "TRUE", "4", "a"]],
        },
      }),
    );
    const client = createDatabricksClient({ ...clientConfig, fetchImpl });
    const result = await client.query("SELECT amount");
    expect(result.rows[0]).toEqual({
      amount: "9007199254740993.25",
      wide: "9007199254740993",
      flag: true,
      id: 4,
      column: "a",
    });
  });

  it("refuses inline rows that also carry external links and a repeated chunk", async () => {
    const withLinks = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        statement_id: "s5",
        status: { state: "SUCCEEDED" },
        manifest: { schema: { columns: [{ name: "id", type_name: "INT", position: 0 }] } },
        result: { chunk_index: 0, data_array: [["1"]], external_links: [{ external_link: "https://example.test/data" }] },
      }),
    );
    const linked = createDatabricksClient({ ...clientConfig, fetchImpl: withLinks });
    await expect(linked.query("SELECT 1")).rejects.toThrow(/external links/);

    const repeated = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        statement_id: "s6",
        status: { state: "SUCCEEDED" },
        manifest: { schema: { columns: [{ name: "id", type_name: "INT", position: 0 }] } },
        result: { chunk_index: 0, data_array: [["1"]], next_chunk_index: 0 },
      }),
    );
    const client = createDatabricksClient({ ...clientConfig, fetchImpl: repeated });
    await expect(client.query("SELECT 1")).rejects.toThrow(/chunk/);
  });

  it("cancels a running statement when the query times out", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/cancel")) {
        return jsonResponse({ status: { state: "CANCELED" } });
      }
      if (path.endsWith("/statements")) {
        return jsonResponse({ statement_id: "s9", status: { state: "RUNNING" } });
      }
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });
    const client = createDatabricksClient({ ...clientConfig, fetchImpl });
    await expect(client.query("SELECT 1", [], 300)).rejects.toThrow(/timed out/);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).endsWith("/cancel"))).toBe(true);
  });
});
