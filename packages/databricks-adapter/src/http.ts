import { QueryValidationError } from "@dash/core";
import type { DatabricksParam, DatabricksParamType } from "./sql.ts";

export interface DatabricksField {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DatabricksQueryResult {
  rows: Record<string, unknown>[];
  fields: DatabricksField[];
}

export interface DatabricksClient {
  query(text: string, params?: DatabricksParam[], timeoutMs?: number): Promise<DatabricksQueryResult>;
  end(): Promise<void>;
}

export interface DatabricksClientConfig {
  host: string;
  warehouseId: string;
  token: string;
  origin: URL;
  catalog?: string;
  schema?: string;
  fetchImpl?: typeof fetch;
}

const CLOUD_SUFFIXES = [
  "databricks.com",
  "azuredatabricks.net",
  "databricks.net",
  "cloud.databricks.com",
  "gcp.databricks.com",
];

const INTEGER_TYPES = new Set(["INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT"]);
const MAX_CHUNKS = 100;
const MAX_ROWS = 20_000;
const MAX_CHARS = 8_000_000;

interface ManifestColumn {
  name?: string;
  type_name?: string;
  type_text?: string;
  position?: number;
}

interface StatementResult {
  chunk_index?: number;
  data_array?: unknown[][];
  next_chunk_index?: number | null;
  external_links?: unknown[];
}

interface StatementResponse {
  statement_id?: string;
  message?: string;
  status?: {
    state?: string;
    error?: { message?: string };
  };
  manifest?: {
    schema?: { columns?: ManifestColumn[] };
  };
  result?: StatementResult;
  data_array?: unknown[][];
  next_chunk_index?: number | null;
}

const HOST_NAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isDatabricksCloudHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return CLOUD_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

export function assertWorkspaceHost(host: string): string {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized.length > 253 || !isHost(normalized)) {
    throw new QueryValidationError("Invalid Databricks SQL host");
  }
  return normalized;
}

function isHost(value: string): boolean {
  if (value === "::1") {
    return true;
  }
  if (IPV4.test(value)) {
    return value.split(".").every((octet) => {
      if (octet.length > 1 && octet.startsWith("0")) {
        return false;
      }
      return Number(octet) <= 255;
    });
  }
  return HOST_NAME.test(value);
}

export function databricksOrigin(value: string | undefined, host: string): URL {
  const raw = value?.trim() || `https://${formatHost(host)}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new QueryValidationError("Databricks SQL API endpoint is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new QueryValidationError("Databricks SQL API endpoint must use http or https");
  }
  if (url.username || url.password) {
    throw new QueryValidationError("Databricks SQL API endpoint must not include credentials");
  }
  if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new QueryValidationError(
      "Databricks SQL API endpoint must be an origin without a path, query, or hash",
    );
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new QueryValidationError("Databricks SQL API endpoint must use https");
  }
  if (host && url.hostname !== host) {
    throw new QueryValidationError("Databricks SQL API endpoint host must match the workspace host");
  }
  return url;
}

function parameterValue(type: DatabricksParamType, value: string | number | boolean): string {
  if (type === "BOOLEAN") {
    return value === true ? "true" : "false";
  }
  return String(value);
}

function baseType(typeName: string): string {
  return typeName
    .toUpperCase()
    .replace(/\s+NOT NULL$/, "")
    .replace(/\(.*\)/, "")
    .trim();
}

function decodeInteger(text: string): unknown {
  if (!/^-?\d+$/.test(text)) {
    return text;
  }
  const parsed = Number(text);
  if (Number.isSafeInteger(parsed) && String(parsed) === text) {
    return parsed;
  }
  return text;
}

function decodeCell(typeName: string, raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }
  const text = String(raw);
  const type = baseType(typeName);
  if (type === "BOOLEAN" || type === "BOOL") {
    const flag = text.toLowerCase();
    if (flag === "true") {
      return true;
    }
    if (flag === "false") {
      return false;
    }
    return text;
  }
  if (INTEGER_TYPES.has(type)) {
    return decodeInteger(text);
  }
  if (type === "FLOAT" || type === "DOUBLE") {
    const parsed = Number(text);
    if (Number.isFinite(parsed) && String(parsed) === text) {
      return parsed;
    }
    return text;
  }
  return text;
}

function columnsOf(payload: StatementResponse): DatabricksField[] {
  const columns = payload.manifest?.schema?.columns ?? [];
  const used = new Set<string>();
  return [...columns]
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((column) => {
      const type = column.type_name || column.type_text || "STRING";
      const base = column.name?.trim() ? column.name : "column";
      let name = base;
      let suffix = 2;
      while (used.has(name)) {
        name = `${base}_${suffix}`;
        suffix += 1;
      }
      used.add(name);
      return {
        name,
        type,
        nullable: true,
      };
    });
}

function rowsOf(fields: DatabricksField[], data: unknown[][]): Record<string, unknown>[] {
  return data.map((row) => {
    const record: Record<string, unknown> = {};
    fields.forEach((field, index) => {
      record[field.name] = decodeCell(field.type, row[index]);
    });
    return record;
  });
}

function errorMessage(payload: StatementResponse, status: number): string {
  return (
    payload.status?.error?.message ||
    payload.message ||
    `Databricks SQL request failed (${status})`
  );
}

function waitTimeout(timeoutMs: number): string {
  const seconds = Math.min(50, Math.max(5, Math.ceil(timeoutMs / 1000)));
  return `${seconds}s`;
}

function externalLinks(result: StatementResult | undefined): boolean {
  return (result?.external_links?.length ?? 0) > 0;
}

export function createDatabricksClient(config: DatabricksClientConfig): DatabricksClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  let closed = false;
  let activeController: AbortController | null = null;
  let activeStatementId: string | null = null;

  function assertOpen(): void {
    if (closed) {
      throw new Error("Databricks SQL connection is closed");
    }
  }

  async function cancelActive(): Promise<void> {
    const statementId = activeStatementId;
    const controller = activeController;
    activeStatementId = null;
    activeController = null;
    controller?.abort();
    if (!statementId) {
      return;
    }
    try {
      await fetchImpl(new URL(`/api/2.0/sql/statements/${encodeURIComponent(statementId)}/cancel`, config.origin), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.token}`,
        },
      });
    } catch {
      // The statement may already have finished.
    }
  }

  function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Databricks SQL statement timed out"), { name: "TimeoutError" }));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function request(
    path: string,
    init: { method: "GET" | "POST"; body?: string },
    signal: AbortSignal,
  ): Promise<StatementResponse> {
    assertOpen();
    const url = new URL(path, config.origin);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: init.method,
        redirect: "error",
        signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.body ? { body: init.body } : {}),
      });
    } catch (error) {
      if (closed) {
        throw new Error("Databricks SQL connection is closed");
      }
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error("Databricks SQL statement timed out");
      }
      throw error;
    }
    let payload: StatementResponse;
    try {
      payload = (await response.json()) as StatementResponse;
    } catch {
      throw new Error(`Databricks SQL request failed (${response.status})`);
    }
    if (!response.ok) {
      throw new Error(errorMessage(payload, response.status));
    }
    return payload;
  }

  function takeChunk(data: unknown[][], chars: { count: number }, extra: unknown[][]): void {
    for (const row of extra) {
      if (data.length >= MAX_ROWS) {
        throw new Error("Databricks SQL result is too large");
      }
      for (const cell of row) {
        if (typeof cell === "string") {
          chars.count += cell.length;
        }
      }
      if (chars.count > MAX_CHARS) {
        throw new Error("Databricks SQL result is too large");
      }
      data.push(row);
    }
  }

  return {
    async query(text, params = [], timeoutMs = 30_000) {
      assertOpen();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      activeController = controller;
      const deadline = Date.now() + timeoutMs;
      try {
        const body = JSON.stringify({
          warehouse_id: config.warehouseId,
          statement: text,
          ...(config.catalog ? { catalog: config.catalog } : {}),
          ...(config.schema ? { schema: config.schema } : {}),
          disposition: "INLINE",
          format: "JSON_ARRAY",
          wait_timeout: waitTimeout(timeoutMs),
          on_wait_timeout: "CONTINUE",
          ...(params.length > 0
            ? {
                parameters: params.map((param) => ({
                  name: param.name,
                  type: param.type,
                  value: parameterValue(param.type, param.value),
                })),
              }
            : {}),
        });
        let payload = await request("/api/2.0/sql/statements", { method: "POST", body }, controller.signal);
        const statementId = payload.statement_id;
        if (statementId) {
          activeStatementId = statementId;
        }
        while (payload.status?.state === "PENDING" || payload.status?.state === "RUNNING") {
          if (!statementId) {
            throw new Error("Databricks SQL statement did not return an id");
          }
          if (Date.now() > deadline || controller.signal.aborted) {
            throw new Error("Databricks SQL statement timed out");
          }
          await sleep(50, controller.signal);
          if (closed) {
            throw new Error("Databricks SQL connection is closed");
          }
          payload = await request(
            `/api/2.0/sql/statements/${encodeURIComponent(statementId)}`,
            { method: "GET" },
            controller.signal,
          );
        }
        const state = payload.status?.state;
        if (state !== "SUCCEEDED") {
          throw new Error(payload.status?.error?.message || "Databricks SQL statement failed");
        }
        if (externalLinks(payload.result)) {
          throw new Error("Databricks SQL result is not inline; refusing to fetch external links");
        }
        const fields = columnsOf(payload);
        const data: unknown[][] = [];
        const chars = { count: 0 };
        takeChunk(data, chars, payload.result?.data_array ?? []);
        const initialChunk = payload.result?.chunk_index ?? 0;
        if (!Number.isInteger(initialChunk) || initialChunk < 0) {
          throw new Error("Databricks SQL result chunk sequence is invalid");
        }
        let next = payload.result?.next_chunk_index;
        const seen = new Set<number>([initialChunk]);
        while (next !== null && next !== undefined) {
          if (
            typeof next !== "number" ||
            !Number.isInteger(next) ||
            next < 0 ||
            !statementId ||
            seen.has(next) ||
            seen.size >= MAX_CHUNKS
          ) {
            throw new Error("Databricks SQL result chunk sequence is invalid");
          }
          seen.add(next);
          const chunk = await request(
            `/api/2.0/sql/statements/${encodeURIComponent(statementId)}/result/chunks/${next}`,
            { method: "GET" },
            controller.signal,
          );
          const chunkResult: StatementResult = chunk.result ?? {
            data_array: chunk.data_array,
            next_chunk_index: chunk.next_chunk_index,
          };
          if (externalLinks(chunkResult)) {
            throw new Error("Databricks SQL result is not inline; refusing to fetch external links");
          }
          takeChunk(data, chars, chunkResult.data_array ?? []);
          next = chunkResult.next_chunk_index;
        }
        activeStatementId = null;
        return { rows: rowsOf(fields, data), fields };
      } catch (error) {
        await cancelActive();
        if (closed) {
          throw new Error("Databricks SQL connection is closed");
        }
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
          throw new Error("Databricks SQL statement timed out");
        }
        throw error;
      } finally {
        clearTimeout(timer);
        if (activeController === controller) {
          activeController = null;
        }
      }
    },
    async end() {
      closed = true;
      await cancelActive();
    },
  };
}
