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

function compileFilter(filter: AdapterFilter, values: unknown[]): string {
  values.push(filter.column);
  const column = "IDENTIFIER(?)";
  const bind = () => {
    values.push(filter.value);
    return "?";
  };

  switch (filter.op) {
    case "eq":
      return column + " = " + bind(); // nosec
    case "neq":
      return column + " <> " + bind(); // nosec
    case "gt":
      return column + " > " + bind(); // nosec
    case "gte":
      return column + " >= " + bind(); // nosec
    case "lt":
      return column + " < " + bind(); // nosec
    case "lte":
      return column + " <= " + bind(); // nosec
    case "like":
      return column + " LIKE " + bind(); // nosec
    case "ilike":
      return column + " ILIKE " + bind(); // nosec
    case "in": {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new QueryValidationError("Filter operator `in` requires a non-empty array");
      }
      const placeholders = filter.value.map((entry) => {
        values.push(entry);
        return "?";
      });
      return column + " IN (" + placeholders.join(", ") + ")"; // nosec
    }
    default:
      throw new QueryValidationError(`Unsupported filter operator: ${String(filter.op)}`);
  }
}

function qualifyResource(resource: string, values: unknown[]): string {
  const parts = splitResourceName(resource);
  if (parts.namespace) {
    values.push(parts.namespace, parts.name);
    return "IDENTIFIER(?).IDENTIFIER(?)";
  }
  values.push(parts.name);
  return "IDENTIFIER(?)";
}

export function compileSelect(input: AdapterQuery): CompiledSql {
  const query = normalizeAdapterQuery(input);
  const values: unknown[] = [];
  const projection =
    query.columns && query.columns.length > 0
      ? query.columns
          .map((column) => {
            values.push(column);
            return "IDENTIFIER(?)";
          })
          .join(", ")
      : "*";
  const from = qualifyResource(query.resource, values);
  // nosec
  const where =
    query.filters && query.filters.length > 0
      ? ` WHERE ${query.filters.map((filter) => compileFilter(filter, values)).join(" AND ")}`
      : "";
  // nosec
  const order =
    query.orderBy && query.orderBy.length > 0
      ? ` ORDER BY ${query.orderBy
          .map((entry) => {
            values.push(entry.column);
            return `IDENTIFIER(?) ${entry.direction.toUpperCase()}`;
          })
          .join(", ")}`
      : "";
  values.push(query.limit);
  values.push(query.offset);
  // nosec
  const text = `SELECT ${projection} FROM ${from}${where}${order} LIMIT ? OFFSET ?`;
  return { text, values };
}

export const INTROSPECT_SQL = `
SELECT
  c.table_schema AS "namespace",
  c.table_name AS "name",
  t.table_type AS "table_type",
  c.column_name AS "column_name",
  c.data_type AS "data_type",
  c.is_nullable AS "is_nullable"
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema <> 'INFORMATION_SCHEMA'
ORDER BY c.table_schema, c.table_name, c.ordinal_position
`;
