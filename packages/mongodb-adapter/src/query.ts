import {
  type AdapterColumn,
  type AdapterFilter,
  type AdapterQuery,
  QueryValidationError,
  normalizeAdapterQuery,
} from "@dash/core";
import { ObjectId } from "mongodb";

export interface CompiledFind {
  collection: string;
  filter: Record<string, unknown>;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  limit: number;
  skip: number;
}

const MAX_STRING = 10_000;
const MAX_IN = 100;
const MAX_LIKE = 200;
const MAX_COLLECTION_BYTES = 255;
const BANNED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OBJECT_ID_HEX = /^[a-f0-9]{24}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface CompileFindOptions {
  /** Column types from introspection, keyed by collection name then field name. */
  columnTypes?: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /**
   * The resource string is itself a collection in this database.
   * Do not treat `database.collection` as a qualifier in that case.
   */
  literalCollectionExists?: boolean;
}

function emptyRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function assertSafeKey(name: string): void {
  if (name.startsWith("$") || name.includes(".") || BANNED_KEYS.has(name)) {
    throw new QueryValidationError(`Invalid column: ${name}`);
  }
}

function assertScalar(value: unknown, label: string): string | number | boolean | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING) {
      throw new QueryValidationError(`${label} is too long`);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new QueryValidationError(`${label} must be a finite number`);
    }
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new QueryValidationError(`${label} must be a string, number, boolean, or null`);
}

function comparison(
  operator: "$ne" | "$gt" | "$gte" | "$lt" | "$lte",
  value: unknown,
): Record<string, unknown> {
  const clause = emptyRecord();
  clause[operator] = value;
  return clause;
}

/** SQL comparisons with NULL match nothing. `$ne` and `{ field: null }` do not. */
function matchNothing(): Record<string, unknown> {
  const exists = emptyRecord();
  exists.$exists = true;
  const missing = emptyRecord();
  missing.$exists = false;
  const present = emptyRecord();
  present._id = exists;
  const absent = emptyRecord();
  absent._id = missing;
  const clause = emptyRecord();
  clause.$and = [present, absent];
  return clause;
}

function fieldClause(column: string, value: unknown): Record<string, unknown> {
  const clause = emptyRecord();
  clause[column] = value;
  return clause;
}

function explicitNull(column: string): Record<string, unknown> {
  const exists = emptyRecord();
  exists.$exists = true;
  const clause = emptyRecord();
  clause.$and = [fieldClause(column, null), fieldClause(column, exists)];
  return clause;
}

/** Present and not null. The inverse of `explicitNull`, which does not match a missing field. */
function notEqualNull(column: string): Record<string, unknown> {
  const exists = emptyRecord();
  exists.$exists = true;
  const clause = emptyRecord();
  clause.$and = [fieldClause(column, comparison("$ne", null)), fieldClause(column, exists)];
  return clause;
}

function notEqual(
  column: string,
  value: string | number | boolean | null | ObjectId | Date,
): Record<string, unknown> {
  if (value === null) {
    return notEqualNull(column);
  }
  const exists = emptyRecord();
  exists.$exists = true;
  const clause = emptyRecord();
  clause.$and = [
    fieldClause(column, comparison("$ne", value)),
    fieldClause(column, comparison("$ne", null)),
    fieldClause(column, exists),
  ];
  return clause;
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function likeToRegex(pattern: string, ignoreCase: boolean): Record<string, unknown> {
  if (pattern.length > MAX_LIKE) {
    throw new QueryValidationError("Filter pattern is too long");
  }
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "%") {
      while (pattern[index + 1] === "%") {
        index += 1;
      }
      source += ".*";
      continue;
    }
    if (character === "_") {
      source += ".";
      continue;
    }
    source += character.replace(REGEX_SPECIAL, "\\$&");
  }
  source += "$";
  const clause = emptyRecord();
  clause.$regex = source;
  if (ignoreCase) {
    clause.$options = "i";
  }
  return clause;
}

function coerceScalar(
  column: string,
  value: string | number | boolean | null,
  types: ReadonlyMap<string, string> | undefined,
): string | number | boolean | null | ObjectId | Date {
  if (typeof value !== "string") {
    return value;
  }
  const type = types?.get(column);
  if ((column === "_id" || type === "objectid") && OBJECT_ID_HEX.test(value)) {
    return new ObjectId(value);
  }
  if (type === "date" && ISO_INSTANT.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && date.toISOString() === value) {
      return date;
    }
  }
  return value;
}

function compileFilter(
  filter: AdapterFilter,
  types: ReadonlyMap<string, string> | undefined,
): Record<string, unknown> {
  assertSafeKey(filter.column);
  switch (filter.op) {
    case "eq": {
      const value = coerceScalar(filter.column, assertScalar(filter.value, "filter value"), types);
      return value === null ? explicitNull(filter.column) : fieldClause(filter.column, value);
    }
    case "neq":
      return notEqual(
        filter.column,
        coerceScalar(filter.column, assertScalar(filter.value, "filter value"), types),
      );
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const value = coerceScalar(filter.column, assertScalar(filter.value, "filter value"), types);
      if (value === null) {
        return matchNothing();
      }
      const operator =
        filter.op === "gt" ? "$gt" : filter.op === "gte" ? "$gte" : filter.op === "lt" ? "$lt" : "$lte";
      return fieldClause(filter.column, comparison(operator, value));
    }
    case "in": {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new QueryValidationError("Filter operator `in` requires a non-empty array");
      }
      if (filter.value.length > MAX_IN) {
        throw new QueryValidationError(
          `Filter operator \`in\` accepts at most ${MAX_IN} values`,
        );
      }
      const values = filter.value.map((entry) =>
        coerceScalar(filter.column, assertScalar(entry, "filter value"), types),
      );
      const nonNull = values.filter((entry) => entry !== null);
      const clauses: Record<string, unknown>[] = [];
      if (nonNull.length > 0) {
        const membership = emptyRecord();
        membership.$in = nonNull;
        clauses.push(fieldClause(filter.column, membership));
      }
      if (nonNull.length !== values.length) {
        clauses.push(explicitNull(filter.column));
      }
      if (clauses.length === 1) {
        return clauses[0]!;
      }
      const either = emptyRecord();
      either.$or = clauses;
      return either;
    }
    case "like":
    case "ilike": {
      if (typeof filter.value !== "string") {
        throw new QueryValidationError("Filter operators `like` and `ilike` require a string");
      }
      return fieldClause(filter.column, likeToRegex(filter.value, filter.op === "ilike"));
    }
    default:
      throw new QueryValidationError(`Unsupported filter operator: ${String(filter.op)}`);
  }
}

function compileProjection(columns: string[] | undefined): Record<string, 0 | 1> | undefined {
  if (!columns || columns.length === 0) {
    return undefined;
  }
  const projection = Object.create(null) as Record<string, 0 | 1>;
  for (const column of columns) {
    assertSafeKey(column);
    projection[column] = 1;
  }
  if (!Object.hasOwn(projection, "_id")) {
    projection._id = 0;
  }
  return projection;
}

function compileSort(
  orderBy: AdapterQuery["orderBy"],
): Record<string, 1 | -1> | undefined {
  if (!orderBy || orderBy.length === 0) {
    return undefined;
  }
  const sort = Object.create(null) as Record<string, 1 | -1>;
  for (const entry of orderBy) {
    assertSafeKey(entry.column);
    sort[entry.column] = entry.direction === "asc" ? 1 : -1;
  }
  return sort;
}

function assertCollectionLiteral(name: string): string {
  if (
    name.length === 0 ||
    Buffer.byteLength(name) > MAX_COLLECTION_BYTES ||
    name.includes("\0") ||
    name.includes("$") ||
    name.startsWith("system.")
  ) {
    throw new QueryValidationError(`Invalid resource name: ${name}`);
  }
  return name;
}

/**
 * A resource is the collection name. `database.collection` is also accepted
 * when both parts are identifiers and the database is the one this client is
 * connected to. Any other string, including a dotted name that is not that
 * qualifier, is the collection name itself.
 */
export function resolveCollection(
  resource: string,
  databaseName: string,
  literalCollectionExists = false,
): string {
  if (typeof resource !== "string") {
    throw new QueryValidationError("Invalid resource name");
  }
  if (literalCollectionExists) {
    return assertCollectionLiteral(resource);
  }
  const dot = resource.indexOf(".");
  if (dot > 0 && resource.indexOf(".", dot + 1) === -1) {
    const namespace = resource.slice(0, dot);
    const name = resource.slice(dot + 1);
    if (namespace === databaseName && IDENTIFIER.test(namespace) && IDENTIFIER.test(name)) {
      return name;
    }
  }
  return assertCollectionLiteral(resource);
}

/** Collections introspection can hand to the widget and query again unchanged. */
export function isListedCollection(name: string): boolean {
  return (
    name.length > 0 &&
    Buffer.byteLength(name) <= MAX_COLLECTION_BYTES &&
    !name.startsWith("system.") &&
    !name.includes("\0") &&
    !name.includes("$")
  );
}

/**
 * Compiles a structured query into a find command.
 * Field names are validated identifiers passed as document keys.
 * Filter values are scalars (or arrays of scalars for `in`) passed as BSON
 * values — objects are rejected so a client cannot inject query operators.
 * `like` / `ilike` patterns are escaped and anchored; they are not raw regular expressions.
 */
export function compileFind(
  input: AdapterQuery,
  databaseName: string,
  options?: CompileFindOptions,
): CompiledFind {
  const collection = resolveCollection(
    input.resource,
    databaseName,
    options?.literalCollectionExists,
  );
  // Resource names MongoDB accepts are wider than the SQL qualifier grammar.
  // Validate filters, columns, and limits against a placeholder name.
  const query = normalizeAdapterQuery({ ...input, resource: "collection" });
  const types = options?.columnTypes?.get(collection);

  const filters = (query.filters ?? []).map((filter) => compileFilter(filter, types));
  let filter = emptyRecord();
  if (filters.length === 1) {
    filter = filters[0]!;
  } else if (filters.length > 1) {
    filter.$and = filters;
  }

  const limit = query.limit ?? 1000;
  const skip = query.offset ?? 0;
  return {
    collection,
    filter,
    projection: compileProjection(query.columns),
    sort: compileSort(query.orderBy),
    limit,
    skip,
  };
}

function valueType(value: unknown): string {
  if (value instanceof Date) {
    return "date";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (value !== null && typeof value === "object") {
    const kind = (value as { _bsontype?: unknown })._bsontype;
    if (kind === "Int32" || kind === "Long" || kind === "Double" || kind === "Decimal128") {
      return "number";
    }
    if (kind === "ObjectId") {
      return "objectid";
    }
    if (typeof kind === "string" && kind.length > 0) {
      return kind.toLowerCase();
    }
    return "object";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value;
  }
  if (typeof value === "bigint") {
    return "number";
  }
  return "unknown";
}

/** Infers top-level fields from a sample. Names that cannot be queried are omitted. */
export function inferColumns(documents: Record<string, unknown>[]): AdapterColumn[] {
  const fields = new Map<string, { types: Set<string>; seen: number; nulls: number }>();
  for (const document of documents) {
    for (const key of Object.keys(document)) {
      if (!IDENTIFIER.test(key) || BANNED_KEYS.has(key)) {
        continue;
      }
      let entry = fields.get(key);
      if (!entry) {
        entry = { types: new Set(), seen: 0, nulls: 0 };
        fields.set(key, entry);
      }
      entry.seen += 1;
      const value = document[key];
      if (value === null || value === undefined) {
        entry.nulls += 1;
      } else {
        entry.types.add(valueType(value));
      }
    }
  }
  return [...fields.entries()].map(([name, entry]) => ({
    name,
    type: entry.types.size > 0 ? [...entry.types].sort().join("|") : "null",
    nullable: entry.nulls > 0 || entry.seen < documents.length,
  }));
}
