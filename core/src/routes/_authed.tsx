import { createFileRoute } from "@tanstack/react-router";
import { AuthedGate } from "~/components/AppShell";

export const Route = createFileRoute("/_authed")({
  component: AuthedGate,
});
