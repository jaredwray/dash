import type { StripeSession } from "./connection.ts";

const MAX_BODY = 2_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

export class StripeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "StripeHttpError";
    this.status = status;
  }
}

export interface StripeListPage {
  data: Record<string, unknown>[];
  hasMore: boolean;
  nextPage?: string;
}

export async function stripeGet(
  session: StripeSession,
  path: string,
  params: URLSearchParams,
  signal: AbortSignal,
  deadline?: AbortSignal,
): Promise<unknown> {
  if (!path.startsWith("/v1/")) {
    throw new Error("Stripe request failed");
  }
  const url = new URL(path, session.origin);
  url.search = params.toString();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const requestSignal = AbortSignal.any(deadline ? [signal, timeout, deadline] : [signal, timeout]);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: requestSignal,
      headers: {
        Authorization: `Bearer ${session.apiKey}`,
        Accept: "application/json",
        "Stripe-Version": "2024-06-20",
      },
    });
  } catch (error) {
    throw mapTransportError(error, signal, deadline, timeout, session.apiKey);
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new StripeHttpError(response.status, "Stripe refused a redirect");
  }
  if (response.status === 401) {
    await response.body?.cancel();
    throw new StripeHttpError(401, "Stripe rejected the API key");
  }
  if (response.status === 403) {
    await response.body?.cancel();
    throw new StripeHttpError(403, "Stripe denied permission");
  }
  if (response.status === 429) {
    await response.body?.cancel();
    throw new StripeHttpError(429, "Stripe rate limited the request");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new StripeHttpError(response.status, "Stripe request failed");
  }
  try {
    return await readJson(response);
  } catch (error) {
    throw mapTransportError(error, signal, deadline, timeout, session.apiKey);
  }
}

export async function stripeList(
  session: StripeSession,
  path: string,
  params: URLSearchParams,
  signal: AbortSignal,
  deadline?: AbortSignal,
): Promise<StripeListPage> {
  const body = await stripeGet(session, path, params, signal, deadline);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Stripe returned an unexpected response");
  }
  const record = body as Record<string, unknown>;
  if (record.object !== "list" || !Array.isArray(record.data) || typeof record.has_more !== "boolean") {
    throw new Error("Stripe returned an unexpected response");
  }
  const data = record.data.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  );
  if (data.length !== record.data.length) {
    throw new Error("Stripe returned an unexpected response");
  }
  const nextPage = typeof record.next_page === "string" && record.next_page.length > 0 ? record.next_page : undefined;
  return { data, hasMore: record.has_more, ...(nextPage ? { nextPage } : {}) };
}

function mapTransportError(
  error: unknown,
  signal: AbortSignal,
  deadline: AbortSignal | undefined,
  timeout: AbortSignal,
  apiKey: string,
): Error {
  if (error instanceof StripeHttpError) {
    return error;
  }
  if (error instanceof Error && /Stripe returned|Stripe response exceeded/.test(error.message)) {
    return error;
  }
  if (deadline?.aborted || timeout.aborted) {
    return new Error("Stripe request timed out");
  }
  if (signal.aborted) {
    return new Error("Stripe request was cancelled");
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes(apiKey)) {
    return new Error("Stripe request failed");
  }
  return new Error("Stripe request failed");
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Stripe returned an empty response");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new Error("Stripe response exceeded the size limit");
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Stripe returned an unexpected response");
  }
}
