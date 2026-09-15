import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { Dashboard } from "@dash/core";
import { api } from "~/lib/api";
import { GhostButton, PrimaryButton } from "~/components/ui";

export const Route = createFileRoute("/_authed/dashboards/")({
  component: DashboardsPage,
});

function DashboardsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dashboards = useQuery({
    queryKey: ["dashboards"],
    queryFn: async () => {
      const payload = await api<{ dashboards: Dashboard[] }>("/api/dashboards");
      return payload.dashboards;
    },
  });

  async function createDashboard() {
    const payload = await api<{ dashboard: Dashboard }>("/api/dashboards", {
      method: "POST",
      body: JSON.stringify({
        name: "Untitled dashboard",
        description: "Generated in Dash. Add charts from the page or via MCP.",
        widgets: [],
      }),
    });
    await queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    await navigate({
      to: "/dashboards/$dashboardId",
      params: { dashboardId: payload.dashboard.id },
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-mist">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold">Dashboards</h1>
        </div>
        <PrimaryButton type="button" onClick={() => void createDashboard()}>
          <span className="inline-flex items-center gap-2">
            <Plus size={16} /> New dashboard
          </span>
        </PrimaryButton>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {(dashboards.data ?? []).map((dashboard) => (
          <Link
            key={dashboard.id}
            to="/dashboards/$dashboardId"
            params={{ dashboardId: dashboard.id }}
            className="rounded-2xl border border-line bg-panel p-5 hover:border-accent/40"
          >
            <h2 className="text-lg font-medium">{dashboard.name}</h2>
            <p className="mt-2 text-sm text-mist">{dashboard.description || "No description"}</p>
            <p className="mt-4 text-xs text-mist">
              {dashboard.widgets.length} widgets · updated{" "}
              {new Date(dashboard.updatedAt).toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
      {dashboards.data?.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="text-mist">No dashboards yet.</p>
          <GhostButton className="mt-4" type="button" onClick={() => void createDashboard()}>
            Create the first page
          </GhostButton>
        </div>
      ) : null}
    </div>
  );
}
