import type { PublicUser } from "@dash/core";
import { Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import { api } from "~/lib/api";
import { fetchMe } from "~/lib/session";
import { cn } from "~/lib/cn";

const NAV = [
  { to: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { to: "/data-sources", label: "Data sources", icon: Database, admin: true },
  { to: "/tokens", label: "API tokens", icon: KeyRound },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function AppShell({ user }: { user: PublicUser }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    queryClient.clear();
    await navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen lg:grid lg:h-screen lg:grid-cols-[16.5rem_1fr] lg:overflow-hidden">
      <aside className="border-b border-line bg-ink-2/80 px-4 py-4 backdrop-blur lg:flex lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <Link to="/dashboards" className="flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <LayoutDashboard size={18} />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">Dash</span>
            <span className="block text-xs text-mist">AI analytics</span>
          </span>
        </Link>
        <nav className="mt-6 flex gap-1 overflow-x-auto lg:mt-10 lg:flex-col">
          {NAV.filter((item) => !("admin" in item && item.admin) || user.role === "admin").map(
            (item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm whitespace-nowrap",
                    active
                      ? "bg-white/10 text-paper"
                      : "text-mist hover:bg-white/5 hover:text-paper",
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            },
          )}
        </nav>
        <div className="mt-6 hidden items-center justify-between rounded-2xl border border-line bg-panel px-3 py-3 lg:mt-auto lg:flex">
          <div>
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-mist">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg p-2 text-mist hover:bg-white/5 hover:text-paper"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:overflow-y-auto lg:px-10 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function AuthedGate() {
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (me.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-mist">Loading workspace…</div>
    );
  }
  if (me.isError || !me.data) {
    return <Navigate to="/login" />;
  }
  return <AppShell user={me.data} />;
}
