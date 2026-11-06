import { createFileRoute } from "@tanstack/react-router";
import { TokenManager } from "~/components/token-manager";

export const Route = createFileRoute("/_authed/tokens")({
  component: TokensPage,
});

function TokensPage() {
  return <TokenManager />;
}
