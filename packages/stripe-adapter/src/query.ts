import {
  QueryValidationError,
  normalizeAdapterQuery,
  splitResourceName,
  type AdapterColumn,
  type AdapterFilter,
  type AdapterOrderBy,
  type AdapterQuery,
} from "@dash/core";
import {
  STRIPE_RESOURCES,
  STRIPE_SEARCH_FIELDS,
  isStripeResource,
  type StripeResourceName,
} from "./resources.ts";

const MAX_IN = 1000;
const MAX_PATTERN = 256;
const MAX_SEARCH = 1024;

export interface PreparedStripeQuery {
  resource: StripeResourceName;
  columns: string[];
  filters: AdapterFilter[];
  orderBy: AdapterOrderBy[];
  limit: number;
  offset: number;
  /** Stripe Search query. Null when every predicate stays on the list endpoint. */
  search: string | null;
  /** Predicates Search cannot express. They are applied to each returned object. */
  residual: AdapterFilter[];
}

export function prepareStripeQuery(input: AdapterQuery): PreparedStripeQuery {
  const normalized = normalizeAdapterQuery(input);
  const parts = splitResourceName(normalized.resource);
  if (parts.catalog || parts.namespace || !isStripeResource(parts.name)) {
    throw new QueryValidationError("Stripe resource must be an object name");
  }
  const known = STRIPE_RESOURCES[parts.name];
  const names = new Set<string>(known.map((column) => column.name));
  const columns = normalized.columns ?? known.map((column) => column.name);
  for (const column of columns) {
    if (!names.has(column)) {
      throw new QueryValidationError("Unknown Stripe column");
    }
  }
  const filters = normalized.filters ?? [];
  for (const filter of filters) {
    if (!names.has(filter.column)) {
      throw new QueryValidationError("Unknown Stripe column");
    }
    assertFilterValue(parts.name, filter);
  }
  for (const entry of normalized.orderBy ?? []) {
    if (!names.has(entry.column)) {
      throw new QueryValidationError("Unknown Stripe column");
    }
  }
  const compiled = compileStripeSearch(parts.name, filters);
  return {
    resource: parts.name,
    columns,
    filters,
    orderBy: normalized.orderBy ?? [],
    limit: normalized.limit ?? 1000,
    offset: normalized.offset ?? 0,
    search: compiled.search,
    residual: compiled.residual,
  };
}

export function compileStripeSearch(
  resource: StripeResourceName,
  filters: readonly AdapterFilter[],
): { search: string | null; residual: AdapterFilter[] } {
  const fields = STRIPE_SEARCH_FIELDS[resource];
  const parts: string[] = [];
  const residual: AdapterFilter[] = [];
  for (const filter of filters) {
    const compiled = compileFilter(fields, filter);
    if (!compiled) {
      residual.push(filter);
      continue;
    }
    parts.push(compiled);
  }
  const search = parts.length === 0 ? null : parts.join(" AND ");
  if (search && search.length > MAX_SEARCH) {
    return { search: null, residual: [...filters] };
  }
  return { search, residual };
}

export function projectStripeObject(
  resource: StripeResourceName,
  object: Record<string, unknown>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of STRIPE_RESOURCES[resource]) {
    const value = scalarField(object[column.name]);
    if (value === null && !column.nullable) {
      throw new Error("Stripe returned an unexpected response");
    }
    row[column.name] = value;
  }
  return row;
}

export function selectColumns(
  row: Record<string, unknown>,
  columns: readonly string[],
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const column of columns) {
    selected[column] = row[column] ?? null;
  }
  return selected;
}

export function resultColumns(resource: StripeResourceName, names: readonly string[]): AdapterColumn[] {
  const byName = new Map<string, AdapterColumn>(
    STRIPE_RESOURCES[resource].map((column) => [column.name, { ...column }]),
  );
  return names.map((name) => {
    const column = byName.get(name);
    if (!column) {
      throw new QueryValidationError("Unknown Stripe column");
    }
    return column;
  });
}

export function matchesFilters(row: Record<string, unknown>, filters: readonly AdapterFilter[]): boolean {
  return filters.every((filter) => matchesFilter(row[filter.column] ?? null, filter));
}

export function compareRows(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  orderBy: readonly AdapterOrderBy[],
): number {
  for (const entry of orderBy) {
    const compared = compareValues(left[entry.column] ?? null, right[entry.column] ?? null);
    if (compared !== 0) {
      return entry.direction === "desc" ? -compared : compared;
    }
  }
  return 0;
}

export function needsCompleteResult(orderBy: readonly AdapterOrderBy[]): boolean {
  if (orderBy.length === 0) {
    return false;
  }
  return !(orderBy.length === 1 && orderBy[0]?.column === "created" && orderBy[0]?.direction === "desc");
}

function compileFilter(
  fields: Readonly<Record<string, "string" | "number">>,
  filter: AdapterFilter,
): string | null {
  const kind = fields[filter.column];
  if (!kind || filter.op === "like" || filter.op === "ilike") {
    return null;
  }
  if (filter.op === "in") {
    const values = filter.value as unknown[];
    if (values.length === 0) {
      return null;
    }
    const compiled = values.map((value) => equalityTerm(filter.column, kind, value));
    if (compiled.some((value) => value === null)) {
      return null;
    }
    return `(${compiled.join(" OR ")})`;
  }
  if (filter.value === null) {
    if (filter.op === "eq") {
      return `${filter.column}:null`;
    }
    if (filter.op === "neq") {
      return `-${filter.column}:null`;
    }
    return null;
  }
  if (kind === "number") {
    if (typeof filter.value !== "number" || !Number.isInteger(filter.value)) {
      return null;
    }
    const literal = String(filter.value);
    if (filter.op === "eq") {
      return `${filter.column}:${literal}`;
    }
    if (filter.op === "neq") {
      return `-${filter.column}:${literal}`;
    }
    if (filter.op === "gt") {
      return `${filter.column}>${literal}`;
    }
    if (filter.op === "gte") {
      return `${filter.column}>=${literal}`;
    }
    if (filter.op === "lt") {
      return `${filter.column}<${literal}`;
    }
    if (filter.op === "lte") {
      return `${filter.column}<=${literal}`;
    }
    return null;
  }
  if (typeof filter.value !== "string") {
    return null;
  }
  const quoted = quoteSearch(filter.value);
  if (filter.op === "eq") {
    return `${filter.column}:${quoted}`;
  }
  if (filter.op === "neq") {
    return `-${filter.column}:${quoted}`;
  }
  return null;
}

function equalityTerm(column: string, kind: "string" | "number", value: unknown): string | null {
  if (kind === "number") {
    return typeof value === "number" && Number.isInteger(value) ? `${column}:${value}` : null;
  }
  return typeof value === "string" ? `${column}:${quoteSearch(value)}` : null;
}

function quoteSearch(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function assertFilterValue(resource: StripeResourceName, filter: AdapterFilter): void {
  const type = STRIPE_RESOURCES[resource].find((column) => column.name === filter.column)?.type;
  if (filter.column === "created" && filter.op !== "in" && filter.op !== "like" && filter.op !== "ilike") {
    if (filter.value !== null && !Number.isInteger(filter.value)) {
      throw new QueryValidationError("Stripe created filters require an integer unix timestamp");
    }
  }
  if (filter.op === "in") {
    const values = filter.value as unknown[];
    if (values.length > MAX_IN) {
      throw new QueryValidationError("Stripe `in` filters accept at most 1000 values");
    }
    if (values.some((value) => value === null || !isScalar(value))) {
      throw new QueryValidationError("Stripe `in` filters require scalar values");
    }
  }
  if (filter.op === "like" || filter.op === "ilike") {
    if (type !== "string") {
      throw new QueryValidationError("Stripe pattern filters require a string column");
    }
    if (typeof filter.value !== "string") {
      throw new QueryValidationError("Stripe pattern filters require a string");
    }
    if (filter.value.length > MAX_PATTERN) {
      throw new QueryValidationError("Stripe pattern filters are limited to 256 characters");
    }
  }
}

function matchesFilter(value: unknown, filter: AdapterFilter): boolean {
  if (filter.op === "eq") {
    return filter.value === null ? value === null : value === filter.value;
  }
  if (filter.op === "neq") {
    return filter.value === null ? value !== null : value !== filter.value;
  }
  if (filter.op === "in") {
    return (filter.value as unknown[]).some((entry) => entry === value);
  }
  if (filter.op === "like" || filter.op === "ilike") {
    if (typeof value !== "string" || typeof filter.value !== "string") {
      return false;
    }
    return likePattern(filter.value, filter.op === "ilike").test(value);
  }
  if (value === null || filter.value === null) {
    return false;
  }
  const compared = compareValues(value, filter.value);
  if (filter.op === "gt") {
    return compared > 0;
  }
  if (filter.op === "gte") {
    return compared >= 0;
  }
  if (filter.op === "lt") {
    return compared < 0;
  }
  return compared <= 0;
}

function compareValues(left: unknown, right: unknown): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  return compareStrings(String(left), String(right));
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function likePattern(pattern: string, insensitive: boolean): RegExp {
  let source = "^";
  for (const char of pattern) {
    if (char === "%") {
      source += ".*";
    } else if (char === "_") {
      source += ".";
    } else {
      source += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`, insensitive ? "i" : "");
}

function scalarField(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
