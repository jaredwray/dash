import { site } from "~/lib/site";

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

/** Questions on the pricing page. The owner will confirm the answers about users and migration. */
export const pricingFaq: readonly FaqItem[] = [
  {
    id: "limited",
    question: "Is the open source version limited?",
    answer:
      "No. The open source build and Dash Cloud run the same product with the same features. The MIT license covers the full code base. There are no feature gates and no usage caps.",
  },
  {
    id: "user",
    question: "What counts as a user on Dash Cloud?",
    answer:
      "A user is a person who can sign in to your organization. Viewers and editors both count. An agent that connects with an API token is not a user.",
  },
  {
    id: "move",
    question: "Can I move from self-hosted to Cloud, or back?",
    answer: `Yes. Your dashboards and data sources belong to you in both cases. Write to ${site.contactEmail} and we will help you plan the move.`,
  },
  {
    id: "agents",
    question: "How do agents connect to Dash?",
    answer:
      "Dash includes an MCP server at POST /mcp. Issue an API token with the read and mcp scopes. Add the endpoint to Claude Code or another MCP client. The agent can then read schemas and run queries. To let it create dashboards and add chart widgets, add the write scope. The token owner also needs editor access to the workspace.",
  },
  {
    id: "sources",
    question: "Which data sources does Dash support?",
    answer:
      "Postgres, MySQL, Snowflake, MongoDB, Google BigQuery, Databricks SQL, Amazon Redshift, and Stripe. More adapters are on the way.",
  },
  {
    id: "enterprise",
    question: "What does Enterprise add?",
    answer:
      "Enterprise runs on a dedicated instance with an uptime SLA, priority support, and invoice billing. The product is the same.",
  },
  {
    id: "license",
    question: "Which license does Dash use?",
    answer: `Dash uses the ${site.license} license. You can use it, change it, and deploy it for any purpose, in private or in public.`,
  },
];
