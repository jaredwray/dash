import {
  QueryValidationError,
  type AdapterQuery,
  type AdapterQueryResult,
  type AdapterSchema,
  type ConnectionTestResult,
  type DataAdapter,
  type StripeConnectionConfig,
} from "@dash/core";
import { stripePublicSummary, parseStripeConnectionString, stripeSession, type StripeSession } from "./connection.ts";
import { StripeHttpError, stripeList, type StripeListPage } from "./http.ts";
import {
  compareRows,
  matchesFilters,
  needsCompleteResult,
  prepareStripeQuery,
  projectStripeObject,
  resultColumns,
  selectColumns,
  type PreparedStripeQuery,
} from "./query.ts";
import { STRIPE_RESOURCE_NAMES, STRIPE_RESOURCES } from "./resources.ts";

const PAGE_SIZE = 100;
const SCAN_CAP = 10_000;
const QUERY_TIMEOUT_MS = 60_000;
const PERMISSION_MESSAGE = "Stripe key cannot list customers, charges, invoices, or subscriptions";

export class StripeAdapter implements DataAdapter {
  readonly kind = "stripe" as const;
  private readonly abort = new AbortController();

  constructor(private readonly session: StripeSession) {}

  static fromConfig(config: StripeConnectionConfig): StripeAdapter {
    return new StripeAdapter(stripeSession(config));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    let denied = 0;
    try {
      for (const name of STRIPE_RESOURCE_NAMES) {
        try {
          await stripeList(this.session, `/v1/${name}`, new URLSearchParams("limit=1"), this.abort.signal);
          return {
            ok: true,
            latencyMs: Date.now() - started,
            message: "Stripe account is reachable",
          };
        } catch (error) {
          if (error instanceof StripeHttpError && error.status === 403) {
            denied += 1;
            continue;
          }
          throw error;
        }
      }
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: denied === STRIPE_RESOURCE_NAMES.length ? PERMISSION_MESSAGE : "Stripe request failed",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe request failed";
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: message.includes(this.session.apiKey) ? "Stripe request failed" : message,
      };
    }
  }

  async introspectSchema(): Promise<AdapterSchema> {
    const resources: AdapterSchema["resources"] = [];
    for (const name of STRIPE_RESOURCE_NAMES) {
      try {
        await stripeList(this.session, `/v1/${name}`, new URLSearchParams("limit=1"), this.abort.signal);
      } catch (error) {
        if (error instanceof StripeHttpError && error.status === 403) {
          continue;
        }
        throw error;
      }
      resources.push({
        name,
        kind: "collection",
        columns: STRIPE_RESOURCES[name].map((column) => ({ ...column })),
      });
    }
    if (resources.length === 0) {
      throw new Error(PERMISSION_MESSAGE);
    }
    return { kind: "stripe", resources };
  }

  async query(input: AdapterQuery): Promise<AdapterQueryResult> {
    const prepared = prepareStripeQuery(input);
    const columns = resultColumns(prepared.resource, prepared.columns);
    if (prepared.filters.some((filter) => filter.op === "in" && Array.isArray(filter.value) && filter.value.length === 0)) {
      return { columns, rows: [], rowCount: 0, truncated: false };
    }
    const deadline = AbortSignal.timeout(QUERY_TIMEOUT_MS);
    const complete = needsCompleteResult(prepared.orderBy);
    const need = prepared.offset + prepared.limit + 1;
    const matches: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let scanned = 0;

    while (true) {
      if (cursor) {
        if (seen.has(cursor)) {
          throw new Error("Stripe repeated a page");
        }
        seen.add(cursor);
      }
      const page = await this.fetchPage(prepared, cursor, deadline);
      if (page.data.length === 0 && page.hasMore) {
        throw new Error("Stripe returned an unexpected response");
      }
      let filled = false;
      for (const object of page.data) {
        scanned += 1;
        const row = projectStripeObject(prepared.resource, object);
        if (matchesFilters(row, prepared.filters)) {
          matches.push(row);
        }
        if (!complete && matches.length >= need) {
          filled = true;
          break;
        }
      }
      if (filled || !page.hasMore) {
        break;
      }
      if (scanned >= SCAN_CAP) {
        throw new QueryValidationError("Stripe query exceeded 10000 rows before it was complete");
      }
      const next = pageCursor(prepared.search, page);
      if (!next || next === cursor) {
        throw new Error("Stripe repeated a page");
      }
      cursor = next;
    }

    if (prepared.orderBy.length > 0) {
      matches.sort((left, right) => compareRows(left, right, prepared.orderBy));
    }
    const sliced = matches.slice(prepared.offset, prepared.offset + prepared.limit);
    return {
      columns,
      rows: sliced.map((row) => selectColumns(row, prepared.columns)),
      rowCount: sliced.length,
      truncated: matches.length > prepared.offset + prepared.limit,
    };
  }

  async close(): Promise<void> {
    this.abort.abort();
  }

  private fetchPage(
    prepared: PreparedStripeQuery,
    cursor: string | undefined,
    deadline: AbortSignal,
  ): Promise<StripeListPage> {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    if (prepared.search) {
      params.set("query", prepared.search);
      if (cursor) {
        params.set("page", cursor);
      }
      return stripeList(this.session, `/v1/${prepared.resource}/search`, params, this.abort.signal, deadline);
    }
    if (cursor) {
      params.set("starting_after", cursor);
    }
    return stripeList(this.session, `/v1/${prepared.resource}`, params, this.abort.signal, deadline);
  }
}

function pageCursor(search: string | null, page: StripeListPage): string {
  if (search) {
    if (!page.nextPage) {
      throw new Error("Stripe returned an unexpected response");
    }
    return page.nextPage;
  }
  const last = page.data[page.data.length - 1];
  if (!last || typeof last.id !== "string" || last.id.length === 0) {
    throw new Error("Stripe returned an unexpected response");
  }
  return last.id;
}

export function createStripeAdapter(config: StripeConnectionConfig): StripeAdapter {
  return StripeAdapter.fromConfig(config);
}

export { stripePublicSummary, parseStripeConnectionString, stripeSession };
export type { StripeSession };
