import { createFileRoute } from "@tanstack/react-router";
import { TokenManager } from "~/components/token-manager";

export const Route = createFileRoute("/_authed/agent-tokens")({
  component: AgentTokensPage,
});

function AgentTokensPage() {
  return <TokenManager agent />;
}
