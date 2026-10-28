import {
  type AdapterFilter,
  type AdapterQuery,
  QueryValidationError,
  normalizeAdapterQuery,
  splitResourceName,
} from "@dash/core";

export interface CompiledSql {
  text: string;
  values: unknown[];
}

function quoteIdent(name: string): string {
  // Identifiers cannot be bound as parameters. Reject invalid names at the SQL
  // boundary instead of removing characters and silently changing the name.
  if (
    typeof name !== "string" ||
    !/^[A-Za-z_]/.test(name) ||
    /[^A-Za-z0-9_]/.test(name)
  ) {
    throw new QueryValidationError("Invalid MySQL identifier");
  }
  return "`" + name + "`";
}

function compileDirection(direction: string): string {
  switch (direction) {
    case "asc":
      return "ASC";
    case "desc":
      return "DESC";
    default:
      throw new QueryValidationError("Invalid MySQL order direction");
  }
}

function qualifyResource(resource: string): string {
  const parts = splitResourceName(resource);
  return parts.namespace
    ? `${quoteIdent(parts.namespace)}.${quoteIdent(parts.name)}`
    : quoteIdent(parts.name);
}

function compileFilter(filter: AdapterFilter, values: unknown[]): string {
  const column = quoteIdent(filter.column);
  const next = () => {
    values.push(filter.value);
    return "?";
  };

  switch (filter.op) {
    case "eq":
      return `${column} = ${next()}`;
    case "neq":
      return `${column} <> ${next()}`;
    case "gt":
      return `${column} > ${next()}`;
    case "gte":
      return `${column} >= ${next()}`;
    case "lt":
      return `${column} < ${next()}`;
    case "lte":
      return `${column} <= ${next()}`;
    case "like":
      return `${column} COLLATE utf8mb4_bin LIKE ${next()}`;
    case "ilike":
      return `LOWER(${column} COLLATE utf8mb4_bin) LIKE LOWER(${next()})`;
    case "in": {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new QueryValidationError("Filter operator `in` requires a non-empty array");
      }
      const placeholders = filter.value.map((entry) => {
        values.push(entry);
        return "?";
      });
      return `${column} IN (${placeholders.join(", ")})`;
    }
    default:
      throw new QueryValidationError(`Unsupported filter operator: ${String(filter.op)}`);
  }
}

export function compileSelect(input: AdapterQuery): CompiledSql {
  const query = normalizeAdapterQuery(input);
  const values: unknown[] = [];
  const projection =
    query.columns && query.columns.length > 0
      ? query.columns.map(quoteIdent).join(", ")
      : "*";
  const from = qualifyResource(query.resource);
  const where =
    query.filters && query.filters.length > 0
      ? ` WHERE ${query.filters.map((filter) => compileFilter(filter, values)).join(" AND ")}`
      : "";
  const order =
    query.orderBy && query.orderBy.length > 0
      ? ` ORDER BY ${query.orderBy
          .map((entry) => `${quoteIdent(entry.column)} ${compileDirection(entry.direction)}`)
          .join(", ")}`
      : "";
  values.push(query.limit);
  values.push(query.offset);
  // SQL structure comes only from validated identifiers and fixed operators;
  // all input values remain separate binds for the driver's prepared statement.
  const text = `SELECT ${projection} FROM ${from}${where}${order} LIMIT ? OFFSET ?`;
  return { text, values };
}

export const INTROSPECT_SQL = `
SELECT
  c.table_schema AS namespace,
  c.table_name AS name,
  t.table_type AS table_type,
  c.column_name AS column_name,
  c.data_type AS data_type,
  c.is_nullable AS is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = DATABASE()
ORDER BY c.table_schema, c.table_name, c.ordinal_position
`;
