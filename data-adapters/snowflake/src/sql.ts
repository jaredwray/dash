import {
  type AdapterFilter,
  type AdapterQuery,
  QueryValidationError,
  assertIdentifier,
  normalizeAdapterQuery,
  splitResourceName,
} from "@dash/core";

export interface CompiledSql {
  text: string;
  values: unknown[];
}

function escapeIdentifier(name: string, label = "identifier"): string {
  return `"${assertIdentifier(name, label)}"`;
}

function qualifyResource(resource: string): string {
  const parts = splitResourceName(resource);
  return parts.namespace
    ? `${escapeIdentifier(parts.namespace, "namespace")}.${escapeIdentifier(parts.name, "resource")}`
    : escapeIdentifier(parts.name, "resource");
}

function compileFilter(filter: AdapterFilter, values: unknown[]): string {
  const column = escapeIdentifier(filter.column, "filter column");
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
      return `${column} LIKE ${next()}`;
    case "ilike":
      return `${column} ILIKE ${next()}`;
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
      ? query.columns.map((column) => escapeIdentifier(column, "column")).join(", ")
      : "*";
  const from = qualifyResource(query.resource);
  const where =
    query.filters && query.filters.length > 0
      ? ` WHERE ${query.filters.map((filter) => compileFilter(filter, values)).join(" AND ")}`
      : "";
  const order =
    query.orderBy && query.orderBy.length > 0
      ? ` ORDER BY ${query.orderBy
          .map(
            (entry) =>
              `${escapeIdentifier(entry.column, "order column")} ${entry.direction.toUpperCase()}`,
          )
          .join(", ")}`
      : "";
  values.push(query.limit);
  values.push(query.offset);
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
