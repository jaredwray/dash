import {
  type AdapterFilter,
  type AdapterQuery,
  QueryValidationError,
  assertIdentifier,
  normalizeAdapterQuery,
  splitResourceName,
} from "@dash/core";

export type DatabricksParamType = "STRING" | "INT" | "BIGINT" | "DOUBLE" | "BOOLEAN";

export interface DatabricksParam {
  name: string;
  type: DatabricksParamType;
  value: string | number | boolean;
}

export interface CompiledDatabricks {
  text: string;
  params: DatabricksParam[];
  limit: number;
  /** True when the statement fetches one extra row so an exact page is not marked truncated. */
  lookAhead: boolean;
}

export interface DatabricksSqlContext {
  catalog: string;
  schema?: string;
}

const FILTER_SQL: Record<Exclude<AdapterFilter["op"], "in" | "ilike">, string> = {
  eq: " = ",
  neq: " <> ",
  gt: " > ",
  gte: " >= ",
  lt: " < ",
  lte: " <= ",
  like: " LIKE ",
};

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
const MAX_PAGE = 10_000;

/** One past this cap means the caller should ask for a schema instead of reading the whole catalog. */
export const INTROSPECT_ROW_CAP = 10_000;

export function quoteIdent(name: string): string {
  if (name.includes("`")) {
    throw new QueryValidationError("Invalid identifier");
  }
  return "`" + name + "`";
}

function qualifyResource(resource: string, context: DatabricksSqlContext): string {
  const parts = splitResourceName(resource);
  const catalog = assertIdentifier(parts.catalog ?? context.catalog, "catalog");
  const schema = parts.namespace ?? context.schema;
  if (!schema) {
    throw new QueryValidationError(
      "Databricks SQL resource must be schema.table or catalog.schema.table, or the connection needs a default schema",
    );
  }
  assertIdentifier(schema, "schema");
  return `${quoteIdent(catalog)}.${quoteIdent(schema)}.${quoteIdent(parts.name)}`;
}

function literalType(value: unknown): DatabricksParamType {
  if (typeof value === "string") {
    return "STRING";
  }
  if (typeof value === "boolean") {
    return "BOOLEAN";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new QueryValidationError("Filter values must be finite numbers");
    }
    if (!Number.isInteger(value)) {
      return "DOUBLE";
    }
    if (!Number.isSafeInteger(value)) {
      throw new QueryValidationError("Filter integers must be safe integers");
    }
    if (value < INT32_MIN || value > INT32_MAX) {
      return "BIGINT";
    }
    return "INT";
  }
  throw new QueryValidationError("Filter values must be strings, numbers, or booleans");
}

function arrayType(values: unknown[]): DatabricksParamType {
  const types = values.map((value) => literalType(value));
  const unique = new Set(types);
  if (unique.size === 1) {
    return types[0]!;
  }
  if (unique.size === 2 && unique.has("INT") && unique.has("BIGINT")) {
    return "BIGINT";
  }
  throw new QueryValidationError("Filter operator `in` requires values of one type");
}

function pushParam(
  params: DatabricksParam[],
  type: DatabricksParamType,
  value: string | number | boolean,
): string {
  const name = `p${params.length}`;
  params.push({ name, type, value });
  return `:${name}`;
}

function sqlColumn(column: string, type: DatabricksParamType): string {
  if (type === "STRING") {
    return `CAST(${column} AS VARCHAR)`;
  }
  return column;
}

function compileFilter(filter: AdapterFilter, params: DatabricksParam[]): string {
  const column = quoteIdent(assertIdentifier(filter.column, "filter column"));
  if (filter.value === null) {
    if (filter.op === "eq") {
      return `${column} IS NULL`;
    }
    if (filter.op === "neq") {
      return `${column} IS NOT NULL`;
    }
    throw new QueryValidationError(`Filter operator \`${filter.op}\` does not accept null`);
  }

  if (filter.op === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) {
      throw new QueryValidationError("Filter operator `in` requires a non-empty array");
    }
    if (filter.value.some((entry) => entry === null)) {
      throw new QueryValidationError("Filter operator `in` does not accept null");
    }
    const type = arrayType(filter.value);
    const placeholders = filter.value.map((entry) => {
      if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
        throw new QueryValidationError("Filter values must be strings, numbers, or booleans");
      }
      return pushParam(params, type, entry);
    });
    return `${sqlColumn(column, type)} IN (${placeholders.join(", ")})`;
  }

  if (filter.op === "ilike") {
    const type = literalType(filter.value);
    if (type !== "STRING" || typeof filter.value !== "string") {
      throw new QueryValidationError("Filter operator `ilike` requires a string");
    }
    return `${sqlColumn(column, "STRING")} ILIKE ${pushParam(params, "STRING", filter.value)}`;
  }

  const operator = FILTER_SQL[filter.op];
  if (!operator) {
    throw new QueryValidationError(`Unsupported filter operator: ${String(filter.op)}`);
  }
  const type = literalType(filter.value);
  if (typeof filter.value !== "string" && typeof filter.value !== "number" && typeof filter.value !== "boolean") {
    throw new QueryValidationError("Filter values must be strings, numbers, or booleans");
  }
  return `${sqlColumn(column, type)}${operator}${pushParam(params, type, filter.value)}`;
}

export function compileSelect(input: AdapterQuery, context: DatabricksSqlContext): CompiledDatabricks {
  const query = normalizeAdapterQuery(input);
  const params: DatabricksParam[] = [];
  const tokens: string[] = ["SELECT"];

  if (query.columns && query.columns.length > 0) {
    tokens.push(query.columns.map((column) => quoteIdent(column)).join(", "));
  } else {
    tokens.push("*");
  }

  tokens.push("FROM", qualifyResource(query.resource, context));

  if (query.filters && query.filters.length > 0) {
    tokens.push(
      "WHERE",
      query.filters.map((filter) => compileFilter(filter, params)).join(" AND "),
    );
  }

  if (query.orderBy && query.orderBy.length > 0) {
    tokens.push(
      "ORDER BY",
      query.orderBy
        .map((entry) => `${quoteIdent(entry.column)} ${entry.direction.toUpperCase()}`)
        .join(", "),
    );
  }

  const limit = query.limit ?? 1000;
  const offset = query.offset ?? 0;
  const lookAhead = limit < MAX_PAGE;
  const fetchLimit = lookAhead ? limit + 1 : limit;
  tokens.push("LIMIT", String(fetchLimit), "OFFSET", String(offset));
  return { text: tokens.join(" "), params, limit, lookAhead };
}

export function introspectSql(catalog: string, schema?: string): string {
  const cat = quoteIdent(assertIdentifier(catalog, "catalog"));
  const columns = `${cat}.${quoteIdent("information_schema")}.${quoteIdent("columns")}`;
  const tables = `${cat}.${quoteIdent("information_schema")}.${quoteIdent("tables")}`;
  const schemaFilter = schema
    ? `WHERE c.table_schema = '${assertIdentifier(schema, "schema")}'`
    : "WHERE c.table_schema NOT IN ('information_schema', 'system')";
  return [
    "SELECT",
    "c.table_schema AS namespace,",
    "c.table_name AS name,",
    "t.table_type AS table_type,",
    "c.column_name AS column_name,",
    "c.data_type AS data_type,",
    "c.is_nullable AS is_nullable",
    `FROM ${columns} AS c`,
    `JOIN ${tables} AS t`,
    "ON c.table_schema = t.table_schema AND c.table_name = t.table_name",
    schemaFilter,
    "ORDER BY c.table_schema, c.table_name, c.ordinal_position",
    `LIMIT ${INTROSPECT_ROW_CAP + 1}`,
  ].join(" ");
}
