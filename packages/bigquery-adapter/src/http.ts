import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { BigQueryParam, BigQueryParamType } from "./sql.ts";

export interface BigQueryField {
  name: string;
  type: string;
  mode?: string;
}

export interface BigQueryQueryResult {
  rows: Record<string, unknown>[];
  fields: BigQueryField[];
}

export interface BigQueryClient {
  query(text: string, params?: BigQueryParam[], timeoutMs?: number): Promise<BigQueryQueryResult>;
  listDatasets(): Promise<string[]>;
  end(): Promise<void>;
}

export interface BigQueryClientConfig {
  projectId: string;
  dataset?: string;
  location?: string;
  apiEndpoint?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  readFile?: (path: string) => string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const BQ_SCOPE = "https://www.googleapis.com/auth/bigquery";
const METADATA_TOKEN_URL =
  "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token";
const DEFAULT_ORIGIN = "https://bigquery.googleapis.com";
const MAX_DATASETS = 100;

interface SchemaField {
  name?: string;
  type?: string;
  mode?: string;
  fields?: SchemaField[];
}

interface QueryRow {
  f?: Array<{ v?: unknown }>;
}

interface QueryResponse {
  jobComplete?: boolean;
  jobReference?: { jobId?: string; location?: string };
  pageToken?: string;
  schema?: { fields?: SchemaField[] };
  rows?: QueryRow[];
  totalRows?: string;
  error?: { message?: string };
  datasets?: Array<{ datasetReference?: { datasetId?: string } }>;
  nextPageToken?: string;
}

export function bigQueryEndpoint(value: string | undefined): URL {
  const raw = value?.trim() || DEFAULT_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("BigQuery API endpoint is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BigQuery API endpoint must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("BigQuery API endpoint must not include credentials");
  }
  if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("BigQuery API endpoint must be an origin without a path, query, or hash");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  if (isGoogleApiHost(url) && url.protocol !== "https:") {
    throw new Error("BigQuery Google endpoints must use https");
  }
  return url;
}

export function isGoogleApiHost(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host === "bigquery.googleapis.com" || host.endsWith(".googleapis.com");
}

function base64url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64url");
}

export function normalizePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  if (trimmed.includes("\\n") && !trimmed.includes("\n")) {
    return trimmed.replaceAll("\\n", "\n");
  }
  return trimmed;
}

export function signServiceAccountJwt(
  email: string,
  privateKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: email,
      scope: BQ_SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(privateKey)).toString("base64url");
  return `${signingInput}.${signature}`;
}

function parameterValue(type: BigQueryParamType, value: string | number | boolean): { value: string } {
  if (type === "BOOL") {
    return { value: value ? "true" : "false" };
  }
  return { value: String(value) };
}

function decodeScalar(type: string, raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }
  const text = String(raw);
  switch (type) {
    case "INTEGER":
    case "INT64": {
      const parsed = Number(text);
      return Number.isSafeInteger(parsed) ? parsed : text;
    }
    case "FLOAT":
    case "FLOAT64": {
      const parsed = Number(text);
      return Number.isFinite(parsed) ? parsed : text;
    }
    case "NUMERIC":
    case "BIGNUMERIC": {
      const parsed = Number(text);
      return Number.isFinite(parsed) && String(parsed) === text ? parsed : text;
    }
    case "TIMESTAMP": {
      const seconds = Number(text);
      if (!Number.isFinite(seconds)) {
        return text;
      }
      return new Date(seconds * 1000).toISOString();
    }
    case "BOOLEAN":
    case "BOOL":
      return text === "true";
    default:
      return text;
  }
}

const SQL_TYPE: Record<string, string> = {
  INTEGER: "INT64",
  FLOAT: "FLOAT64",
  BOOLEAN: "BOOL",
  RECORD: "STRUCT",
};

function sqlType(type: string): string {
  return SQL_TYPE[type] ?? type;
}

function decodeValue(field: SchemaField, raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (field.mode === "REPEATED") {
    const values = Array.isArray(raw) ? raw : [];
    return values.map((entry) => {
      const cell = entry && typeof entry === "object" && "v" in entry ? entry.v : entry;
      return decodeValue({ ...field, mode: "NULLABLE" }, cell);
    });
  }
  if ((field.type === "RECORD" || field.type === "STRUCT") && raw && typeof raw === "object" && "f" in raw) {
    const record = raw as QueryRow;
    const out: Record<string, unknown> = {};
    (field.fields ?? []).forEach((child, index) => {
      if (!child.name) {
        return;
      }
      out[child.name] = decodeValue(child, record.f?.[index]?.v);
    });
    return out;
  }
  return decodeScalar(field.type ?? "STRING", raw);
}

function rowsFromResponse(fields: SchemaField[], rows: QueryRow[] | undefined): Record<string, unknown>[] {
  return (rows ?? []).map((row) => {
    const record: Record<string, unknown> = {};
    fields.forEach((field, index) => {
      if (!field.name) {
        return;
      }
      record[field.name] = decodeValue(field, row.f?.[index]?.v);
    });
    return record;
  });
}

function apiMessage(payload: QueryResponse, status: number): string {
  if (payload.error?.message) {
    return `BigQuery API: ${payload.error.message}`;
  }
  return `BigQuery request failed (${status})`;
}

const CREDENTIALS_REQUIRED =
  "BigQuery credentials are required: provide a service account key, GOOGLE_APPLICATION_CREDENTIALS, or run on GCE";

export function createBigQueryClient(config: BigQueryClientConfig): BigQueryClient {
  const origin = bigQueryEndpoint(config.apiEndpoint);
  const googleApi = isGoogleApiHost(origin);
  const fetchImpl = config.fetchImpl ?? fetch;
  const env = config.env ?? process.env;
  const readFile = config.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  let closed = false;
  let cachedToken: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  function assertOpen(): void {
    if (closed) {
      throw new Error("BigQuery connection is closed");
    }
  }

  function credentials(): { client_email: string; private_key: string } | undefined {
    if (config.credentials?.client_email && config.credentials.private_key) {
      return config.credentials;
    }
    const path = env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!path) {
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFile(path));
    } catch {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not a readable service account JSON key");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not a service account JSON key");
    }
    const record = parsed as { type?: string; client_email?: string; private_key?: string };
    if (record.type && record.type !== "service_account") {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS must be a service account key");
    }
    if (!record.client_email || !record.private_key) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS is missing client_email or private_key");
    }
    return { client_email: record.client_email, private_key: record.private_key };
  }

  async function mintAccessToken(timeoutMs: number): Promise<string> {
    const key = credentials();
    if (key) {
      const assertion = signServiceAccountJwt(key.client_email, key.private_key);
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      let payload: { access_token?: string; expires_in?: number; error_description?: string };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        throw new Error("BigQuery service account token request failed");
      }
      if (!response.ok || !payload.access_token) {
        throw new Error(payload.error_description || "BigQuery service account token request failed");
      }
      cachedToken = {
        value: payload.access_token,
        expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      };
      return payload.access_token;
    }

    try {
      const response = await fetchImpl(METADATA_TOKEN_URL, {
        headers: { "Metadata-Flavor": "Google" },
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(timeoutMs, 1_000)),
      });
      const payload = (await response.json()) as { access_token?: string; expires_in?: number };
      if (!response.ok || !payload.access_token) {
        throw new Error(CREDENTIALS_REQUIRED);
      }
      cachedToken = {
        value: payload.access_token,
        expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      };
      return payload.access_token;
    } catch (error) {
      if (error instanceof Error && error.message === CREDENTIALS_REQUIRED) {
        throw error;
      }
      throw new Error(CREDENTIALS_REQUIRED);
    }
  }

  function fetchAccessToken(timeoutMs: number): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
      return Promise.resolve(cachedToken.value);
    }
    if (!pendingToken) {
      pendingToken = mintAccessToken(timeoutMs).finally(() => {
        pendingToken = undefined;
      });
    }
    return pendingToken;
  }

  async function authorization(timeoutMs: number): Promise<string | undefined> {
    if (!googleApi) {
      return undefined;
    }
    return fetchAccessToken(timeoutMs);
  }

  async function requestJson(url: URL, init: RequestInit, timeoutMs: number): Promise<QueryResponse> {
    assertOpen();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const token = await authorization(timeoutMs);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(`BigQuery request timed out after ${timeoutMs} ms`);
      }
      throw error;
    }
    let payload: QueryResponse;
    try {
      payload = (await response.json()) as QueryResponse;
    } catch {
      throw new Error(`BigQuery request failed (${response.status})`);
    }
    if (!response.ok || payload.error) {
      throw new Error(apiMessage(payload, response.status));
    }
    return payload;
  }

  function remaining(deadline: number): number {
    const left = deadline - Date.now();
    if (left <= 0) {
      throw new Error("BigQuery query did not finish within the time limit");
    }
    return left;
  }

  async function collectRows(initial: QueryResponse, deadline: number): Promise<BigQueryQueryResult> {
    let current = initial;
    for (let attempt = 0; attempt < 30 && current.jobComplete === false; attempt += 1) {
      const jobId = current.jobReference?.jobId;
      if (!jobId) {
        throw new Error("BigQuery query did not return a job id");
      }
      const url = new URL(
        `/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries/${encodeURIComponent(jobId)}`,
        origin,
      );
      const waitMs = Math.min(remaining(deadline), 10_000);
      url.searchParams.set("timeoutMs", String(waitMs));
      url.searchParams.set("maxResults", "10000");
      const location = current.jobReference?.location ?? config.location;
      if (location) {
        url.searchParams.set("location", location);
      }
      current = await requestJson(url, { method: "GET" }, waitMs);
    }
    if (current.jobComplete === false) {
      throw new Error("BigQuery query did not finish within the time limit");
    }

    const fields = current.schema?.fields ?? [];
    const rows = [...(current.rows ?? [])];
    let pageToken = current.pageToken;
    const jobId = current.jobReference?.jobId;
    for (let page = 0; pageToken && jobId && page < 20; page += 1) {
      const url = new URL(
        `/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries/${encodeURIComponent(jobId)}`,
        origin,
      );
      url.searchParams.set("pageToken", pageToken);
      url.searchParams.set("maxResults", "10000");
      const location = current.jobReference?.location ?? config.location;
      if (location) {
        url.searchParams.set("location", location);
      }
      const next = await requestJson(url, { method: "GET" }, remaining(deadline));
      rows.push(...(next.rows ?? []));
      pageToken = next.pageToken;
      current = next;
    }

    const namedFields: BigQueryField[] = fields
      .filter((field): field is SchemaField & { name: string; type: string } =>
        typeof field.name === "string" && typeof field.type === "string",
      )
      .map((field) => ({
        name: field.name,
        type: sqlType(field.type),
        ...(field.mode ? { mode: field.mode } : {}),
      }));
    return {
      fields: namedFields,
      rows: rowsFromResponse(fields, rows),
    };
  }

  return {
    async query(text, params = [], timeoutMs = 30_000) {
      const url = new URL(
        `/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries`,
        origin,
      );
      const deadline = Date.now() + timeoutMs;
      const serverWait = Math.min(10_000, Math.max(1_000, timeoutMs - 2_000));
      const body: Record<string, unknown> = {
        query: text,
        useLegacySql: false,
        timeoutMs: serverWait,
        maxResults: 10_000,
      };
      if (config.location) {
        body.location = config.location;
      }
      if (config.dataset) {
        body.defaultDataset = { projectId: config.projectId, datasetId: config.dataset };
      }
      if (params.length > 0) {
        body.parameterMode = "NAMED";
        body.queryParameters = params.map((param) => ({
          name: param.name,
          parameterType: { type: param.type },
          parameterValue: parameterValue(param.type, param.value),
        }));
      }
      const payload = await requestJson(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        remaining(deadline),
      );
      return collectRows(payload, deadline);
    },
    async listDatasets() {
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(
          `/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/datasets`,
          origin,
        );
        url.searchParams.set("maxResults", String(MAX_DATASETS));
        if (pageToken) {
          url.searchParams.set("pageToken", pageToken);
        }
        const payload = await requestJson(url, { method: "GET" }, 10_000);
        for (const dataset of payload.datasets ?? []) {
          const id = dataset.datasetReference?.datasetId;
          if (id) {
            ids.push(id);
          }
        }
        pageToken = payload.nextPageToken;
        if (pageToken && ids.length >= MAX_DATASETS) {
          throw new Error(
            `BigQuery project has more than ${MAX_DATASETS} datasets; set a default dataset`,
          );
        }
      } while (pageToken);
      return ids;
    },
    async end() {
      closed = true;
      cachedToken = undefined;
      pendingToken = undefined;
    },
  };
}
