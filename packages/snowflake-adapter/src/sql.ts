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

const FILTER_SQL: Record<Exclude<AdapterFilter["op"], "in">, string> = {
  eq: " = ?",
  neq: " <> ?",
  gt: " > ?",
  gte: " >= ?",
  lt: " < ?",
  lte: " <= ?",
  like: " LIKE ?",
  ilike: " ILIKE ?",
};

function compileFilter(filter: AdapterFilter, values: unknown[]): string {
  values.push(filter.column);
  if (filter.op === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) {
      throw new QueryValidationError("Filter operator `in` requires a non-empty array");
    }
    const placeholders = filter.value.map((entry) => {
      values.push(entry);
      return "?";
    });
    return "IDENTIFIER(?) IN (" + placeholders.join(", ") + ")";
  }
  const clause = FILTER_SQL[filter.op];
  if (!clause) {
    throw new QueryValidationError(`Unsupported filter operator: ${String(filter.op)}`);
  }
  values.push(filter.value);
  return "IDENTIFIER(?)" + clause;
}

function qualifyResource(resource: string, values: unknown[]): string {
  const parts = splitResourceName(resource);
  if (parts.catalog) {
    throw new QueryValidationError("Snowflake resource must be schema.table");
  }
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
  const tokens: string[] = ["SELECT"];

  if (query.columns && query.columns.length > 0) {
    const projection: string[] = [];
    for (const column of query.columns) {
      values.push(column);
      projection.push("IDENTIFIER(?)");
    }
    tokens.push(projection.join(", "));
  } else {
    tokens.push("*");
  }

  tokens.push("FROM", qualifyResource(query.resource, values));

  if (query.filters && query.filters.length > 0) {
    const clauses = query.filters.map((filter) => compileFilter(filter, values));
    tokens.push("WHERE", clauses.join(" AND "));
  }

  if (query.orderBy && query.orderBy.length > 0) {
    const clauses = query.orderBy.map((entry) => {
      values.push(entry.column);
      return "IDENTIFIER(?) " + entry.direction.toUpperCase();
    });
    tokens.push("ORDER BY", clauses.join(", "));
  }

  tokens.push("LIMIT ? OFFSET ?");
  values.push(query.limit, query.offset);
  return { text: tokens.join(" "), values };
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
