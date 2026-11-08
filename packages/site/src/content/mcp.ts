export type McpTool = {
  name: string;
  description: string;
};

/** Tools that the built-in MCP server exposes at POST /mcp. */
export const mcpTools: readonly McpTool[] = [
  { name: "list_data_sources", description: "List the data sources in the workspace." },
  { name: "get_schema", description: "Read the tables and columns of a data source." },
  { name: "query_data", description: "Run a structured query and get rows back." },
  { name: "list_dashboards", description: "List the dashboards in the workspace." },
  { name: "get_dashboard", description: "Read one dashboard and its widgets." },
  { name: "create_dashboard", description: "Create a new dashboard." },
  { name: "add_chart_widget", description: "Add a chart widget to a dashboard." },
];

export const mcpEndpoint = "POST /mcp";

export type TranscriptStep =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "tool"; tool: string; input: string; result: string }
  | { id: string; kind: "assistant"; text: string };

/** An example conversation between a person, an agent, and Dash. */
export const agentTranscript: readonly TranscriptStep[] = [
  { id: "ask", kind: "user", text: "Chart revenue by product from the sample warehouse." },
  {
    id: "sources",
    kind: "tool",
    tool: "list_data_sources",
    input: "",
    result: "Sample warehouse (postgres)",
  },
  { id: "schema", kind: "tool", tool: "get_schema", input: "product_sales", result: "6 columns" },
  { id: "query", kind: "tool", tool: "query_data", input: "product_sales", result: "6 rows" },
  {
    id: "widget",
    kind: "tool",
    tool: "add_chart_widget",
    input: "Regional revenue review",
    result: "Revenue by product (bar)",
  },
  {
    id: "answer",
    kind: "assistant",
    text: "Dash Team leads, then Govern. The bar chart is now on Regional revenue review.",
  },
];
