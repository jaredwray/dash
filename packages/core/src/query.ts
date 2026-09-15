const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUALIFIED = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

export class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}

export function assertIdentifier(name: string, label = "identifier"): string {
  if (!IDENT.test(name)) {
    throw new QueryValidationError(`Invalid ${label}: ${name}`);
  }
  return name;
}

export function splitResourceName(resource: string): {
  namespace?: string;
  name: string;
} {
  if (!QUALIFIED.test(resource)) {
    throw new QueryValidationError(`Invalid resource name: ${resource}`);
  }
  const parts = resource.split(".");
  if (parts.length === 2) {
    return { namespace: parts[0], name: parts[1]! };
  }
  return { name: parts[0]! };
}

export function isFilterOperator(value: string): value is import("./adapter.ts").FilterOperator {
  return (
    value === "eq" ||
    value === "neq" ||
    value === "gt" ||
    value === "gte" ||
    value === "lt" ||
    value === "lte" ||
    value === "in" ||
    value === "like" ||
    value === "ilike"
  );
}

const MAX_LIMIT = 10_000;
const DEFAULT_LIMIT = 1_000;

export function normalizeAdapterQuery(
  input: import("./adapter.ts").AdapterQuery,
): import("./adapter.ts").AdapterQuery {
  splitResourceName(input.resource);

  const columns = input.columns?.map((column) => assertIdentifier(column, "column"));
  const filters = (input.filters ?? []).map((filter) => {
    assertIdentifier(filter.column, "filter column");
    if (!isFilterOperator(filter.op)) {
      throw new QueryValidationError(`Unsupported filter operator: ${String(filter.op)}`);
    }
    if (filter.op === "in") {
      if (!Array.isArray(filter.value)) {
        throw new QueryValidationError("Filter operator `in` requires an array value");
      }
    }
    return filter;
  });
  const orderBy = (input.orderBy ?? []).map((entry) => {
    assertIdentifier(entry.column, "order column");
    if (entry.direction !== "asc" && entry.direction !== "desc") {
      throw new QueryValidationError(`Invalid order direction: ${String(entry.direction)}`);
    }
    return entry;
  });

  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new QueryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  const offset = input.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new QueryValidationError("offset must be a non-negative integer");
  }

  return {
    resource: input.resource,
    columns,
    filters,
    orderBy,
    limit,
    offset,
  };
}
