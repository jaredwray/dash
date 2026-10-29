import {
  type AdapterFilter,
  type AdapterQuery,
  QueryValidationError,
  assertIdentifier,
  normalizeAdapterQuery,
  splitResourceName,
} from "@dash/core";

export type BigQueryParamType = "STRING" | "INT64" | "FLOAT64" | "BOOL";

export interface BigQueryParam {
  name: string;
  type: BigQueryParamType;
  value: string | number | boolean;
}

export interface CompiledBigQuery {
  text: string;
  params: BigQueryParam[];
  limit: number;
}

export interface BigQuerySqlContext {
  projectId: string;
  dataset?: string;
}

const PROJECT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const LOCATION = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const FILTER_SQL: Record<Exclude<AdapterFilter["op"], "in" | "ilike">, string> = {
  eq: " = ",
  neq: " <> ",
  gt: " > ",
  gte: " >= ",
  lt: " < ",
  lte: " <= ",
  like: " LIKE ",
};

export function assertProjectId(projectId: string): string {
  if (!PROJECT_ID.test(projectId)) {
    throw new QueryValidationError(`Invalid BigQuery project id: ${projectId}`);
  }
  return projectId;
}

export function assertLocation(location: string): string {
  if (!LOCATION.test(location)) {
    throw new QueryValidationError(`Invalid BigQuery location: ${location}`);
  }
  return location;
}

function quoteIdent(name: string): string {
  return "`" + name.replaceAll("`", "") + "`";
}

function qualifyResource(resource: string, context: BigQuerySqlContext): string {
  const projectId = assertProjectId(context.projectId);
  const parts = splitResourceName(resource);
  if (parts.catalog) {
    throw new QueryValidationError("BigQuery resource must be dataset.table");
  }
  const dataset = parts.namespace ?? context.dataset;
  if (!dataset) {
    throw new QueryValidationError(
      "BigQuery resource must be dataset.table, or the connection needs a default dataset",
    );
  }
  assertIdentifier(dataset, "dataset");
  return `${quoteIdent(projectId)}.${quoteIdent(dataset)}.${quoteIdent(parts.name)}`;
}

function literalType(value: unknown): BigQueryParamType {
  if (typeof value === "string") {
    return "STRING";
  }
  if (typeof value === "boolean") {
    return "BOOL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new QueryValidationError("Filter values must be finite numbers");
    }
    if (!Number.isInteger(value)) {
      return "FLOAT64";
    }
    if (!Number.isSafeInteger(value)) {
      throw new QueryValidationError("Filter integers must be safe integers");
    }
    return "INT64";
  }
  throw new QueryValidationError("Filter values must be strings, numbers, or booleans");
}

function arrayType(values: unknown[]): BigQueryParamType {
  const types = values.map((value) => literalType(value));
  const unique = new Set(types);
  if (unique.size === 1) {
    return types[0]!;
  }
  if (unique.size === 2 && unique.has("INT64") && unique.has("FLOAT64")) {
    return "FLOAT64";
  }
  throw new QueryValidationError("Filter operator `in` requires values of one type");
}

function pushParam(params: BigQueryParam[], type: BigQueryParamType, value: string | number | boolean): string {
  const name = `p${params.length}`;
  params.push({ name, type, value });
  return `@${name}`;
}

function compileFilter(filter: AdapterFilter, params: BigQueryParam[]): string {
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
    return `${column} IN (${placeholders.join(", ")})`;
  }

  if (filter.op === "ilike") {
    const type = literalType(filter.value);
    if (type !== "STRING" || typeof filter.value !== "string") {
      throw new QueryValidationError("Filter operator `ilike` requires a string");
    }
    const placeholder = pushParam(params, "STRING", filter.value);
    return `LOWER(CAST(${column} AS STRING)) LIKE LOWER(CAST(${placeholder} AS STRING))`;
  }

  const operator = FILTER_SQL[filter.op];
  if (!operator) {
    throw new QueryValidationError(`Unsupported filter operator: ${String(filter.op)}`);
  }
  const type = literalType(filter.value);
  if (typeof filter.value !== "string" && typeof filter.value !== "number" && typeof filter.value !== "boolean") {
    throw new QueryValidationError("Filter values must be strings, numbers, or booleans");
  }
  return `${column}${operator}${pushParam(params, type, filter.value)}`;
}

export function compileSelect(input: AdapterQuery, context: BigQuerySqlContext): CompiledBigQuery {
  const query = normalizeAdapterQuery(input);
  const params: BigQueryParam[] = [];
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

  const limit = pushParam(params, "INT64", query.limit ?? 1000);
  const offset = pushParam(params, "INT64", query.offset ?? 0);
  tokens.push("LIMIT", limit, "OFFSET", offset);
  return { text: tokens.join(" "), params, limit: query.limit ?? 1000 };
}

export function introspectSql(projectId: string, dataset: string): string {
  const project = assertProjectId(projectId);
  const schema = assertIdentifier(dataset, "dataset");
  const columns = `\`${project}.${schema}.INFORMATION_SCHEMA.COLUMNS\``;
  const tables = `\`${project}.${schema}.INFORMATION_SCHEMA.TABLES\``;
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
    "ORDER BY c.table_name, c.ordinal_position",
  ].join(" ");
}
