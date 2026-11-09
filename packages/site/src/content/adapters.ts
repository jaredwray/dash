export type AdapterKind = "sql" | "warehouse" | "document" | "saas";

export type Adapter = {
  id: string;
  name: string;
  kind: AdapterKind;
  /** One short line that says what the adapter connects to. */
  note: string;
  /** Accent color for the adapter tile. */
  color: string;
};

/** Data source adapters that ship today. ClickHouse is planned and is not in this list. */
export const adapters: readonly Adapter[] = [
  { id: "postgres", name: "Postgres", kind: "sql", note: "Relational database", color: "#60a5fa" },
  { id: "mysql", name: "MySQL", kind: "sql", note: "Relational database", color: "#fb923c" },
  {
    id: "snowflake",
    name: "Snowflake",
    kind: "warehouse",
    note: "Cloud warehouse",
    color: "#38bdf8",
  },
  { id: "mongodb", name: "MongoDB", kind: "document", note: "Document database", color: "#4ade80" },
  {
    id: "bigquery",
    name: "Google BigQuery",
    kind: "warehouse",
    note: "Cloud warehouse",
    color: "#818cf8",
  },
  {
    id: "databricks",
    name: "Databricks SQL",
    kind: "warehouse",
    note: "Lakehouse SQL",
    color: "#f87171",
  },
  {
    id: "redshift",
    name: "Amazon Redshift",
    kind: "warehouse",
    note: "Cloud warehouse",
    color: "#a78bfa",
  },
  { id: "stripe", name: "Stripe", kind: "saas", note: "Payments and billing", color: "#c084fc" },
];

export const adapterCount = adapters.length;
