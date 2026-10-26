import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createBigQueryClient, signServiceAccountJwt } from "./http.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

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

describe("BigQuery HTTP client", () => {
  it("decodes emulator rows without sending credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        jobComplete: true,
        schema: {
          fields: [
            { name: "id", type: "INTEGER", mode: "REQUIRED" },
            { name: "note", type: "STRING", mode: "NULLABLE" },
            { name: "active", type: "BOOLEAN" },
          ],
        },
        rows: [{ f: [{ v: "4" }, { v: null }, { v: "true" }] }],
      }),
    );
    const client = createBigQueryClient({
      projectId: "dash",
      dataset: "analytics",
      apiEndpoint: "http://127.0.0.1:9059",
      fetchImpl,
      env: {},
    });
    const result = await client.query("SELECT 1", [
      { name: "p0", type: "INT64", value: 4 },
    ]);
    expect(result.rows).toEqual([{ id: 4, note: null, active: true }]);
    expect(result.fields[0]).toEqual({ name: "id", type: "INTEGER", mode: "REQUIRED" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = requestInit(fetchImpl, 0);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:9059/bigquery/v2/projects/dash/queries",
    );
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    const body = JSON.parse(String(init.body)) as {
      queryParameters: Array<{ parameterValue: { value: string } }>;
    };
    expect(body.queryParameters[0]?.parameterValue.value).toBe("4");
  });

  it("does not send a stored service account token to a non-Google endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        jobComplete: true,
        schema: { fields: [{ name: "ok", type: "INTEGER" }] },
        rows: [{ f: [{ v: "1" }] }],
      }),
    );
    const client = createBigQueryClient({
      projectId: "dash",
      apiEndpoint: "http://127.0.0.1:9059",
      credentials: {
        client_email: "dash@example.iam.gserviceaccount.com",
        private_key: privateKey,
      },
      fetchImpl,
      env: {},
    });
    await client.query("SELECT 1 AS ok");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain("googleapis.com");
    expect(new Headers(requestInit(fetchImpl, 0).headers).has("Authorization")).toBe(false);
    expect(String(requestInit(fetchImpl, 0).body)).not.toContain("PRIVATE KEY");
  });

  it("signs a service account token and sends it only to Google", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url) === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ya29.test", expires_in: 3600 });
      }
      return jsonResponse({
        jobComplete: true,
        schema: { fields: [{ name: "ok", type: "INTEGER" }] },
        rows: [{ f: [{ v: "1" }] }],
      });
    });
    const client = createBigQueryClient({
      projectId: "dash",
      credentials: {
        client_email: "dash@example.iam.gserviceaccount.com",
        private_key: privateKey,
      },
      fetchImpl,
      env: {},
    });
    const result = await client.query("SELECT 1 AS ok");
    expect(result.rows).toEqual([{ ok: 1 }]);
    const tokenInit = requestInit(fetchImpl, 0);
    const params = new URLSearchParams(String(tokenInit.body));
    const assertion = params.get("assertion") ?? "";
    const [header, payload, signature] = assertion.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature ?? "", "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString()) as {
      iss: string;
      scope: string;
    };
    expect(claims.iss).toBe("dash@example.iam.gserviceaccount.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/bigquery");
    const queryInit = requestInit(fetchImpl, 1);
    expect(new Headers(queryInit.headers).get("Authorization")).toBe("Bearer ya29.test");
    expect(String(queryInit.body)).not.toContain("PRIVATE KEY");
    expect(String(tokenInit.body)).not.toContain("PRIVATE KEY");
  });

  it("follows a query page token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const href = String(url);
      if (href.includes("pageToken=next")) {
        return jsonResponse({
          jobComplete: true,
          rows: [{ f: [{ v: "2" }] }],
        });
      }
      return jsonResponse({
        jobComplete: true,
        jobReference: { jobId: "job-1", projectId: "dash" },
        pageToken: "next",
        schema: { fields: [{ name: "id", type: "INTEGER" }] },
        rows: [{ f: [{ v: "1" }] }],
      });
    });
    const client = createBigQueryClient({
      projectId: "dash",
      apiEndpoint: "http://127.0.0.1:9059",
      fetchImpl,
      env: {},
    });
    const result = await client.query("SELECT id FROM t");
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("surfaces API errors and refuses a closed client", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { message: "Unrecognized name: nope" } }, 400),
    );
    const client = createBigQueryClient({
      projectId: "dash",
      apiEndpoint: "http://127.0.0.1:9059",
      fetchImpl,
      env: {},
    });
    await expect(client.query("SELECT nope")).rejects.toThrow("Unrecognized name: nope");
    await client.end();
    await expect(client.query("SELECT 1")).rejects.toThrow(/closed/);
  });

  it("reads a service account file and lists datasets", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url) === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ya29.file", expires_in: 3600 });
      }
      return jsonResponse({
        datasets: [{ datasetReference: { datasetId: "analytics", projectId: "dash" } }],
      });
    });
    const client = createBigQueryClient({
      projectId: "dash",
      fetchImpl,
      env: { GOOGLE_APPLICATION_CREDENTIALS: "/tmp/dash-sa.json" },
      readFile: () =>
        JSON.stringify({
          type: "service_account",
          client_email: "file@example.iam.gserviceaccount.com",
          private_key: privateKey,
        }),
    });
    await expect(client.listDatasets()).resolves.toEqual(["analytics"]);
    const jwt = signServiceAccountJwt("file@example.iam.gserviceaccount.com", privateKey.replaceAll("\n", "\\n"));
    expect(jwt.split(".")).toHaveLength(3);
  });
});
