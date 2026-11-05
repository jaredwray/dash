import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { PublicUser, Workspace } from "@dash/core";
import { api } from "~/lib/api";

interface WorkspaceContextValue {
  workspace: Workspace;
  workspaces: Workspace[];
  selectWorkspace: (id: string) => void;
  workspaceApi: typeof api;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace context required");
  return value;
}

export function WorkspaceProvider({ user, children }: { user: PublicUser; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace: selectedId } = useSearch({ strict: false });
  const query = useQuery({
    queryKey: ["workspaces", user.id],
    queryFn: async () => (await api<{ workspaces: Workspace[] }>("/api/workspaces")).workspaces,
    refetchInterval: 30_000,
  });
  const workspaces = query.data ?? [];
  const personal = workspaces.find((item) => item.ownerId === user.id);
  const workspace = selectedId ? workspaces.find((item) => item.id === selectedId) : personal;

  if (query.isError)
    return (
      <p role="alert" className="p-8 text-rose-300">
        Could not load workspaces. Refresh this page to try again.
      </p>
    );
  if (query.data && !workspace)
    return (
      <div className="p-8">
        <p role="alert" className="text-rose-300">
          Workspace not found or access removed.
        </p>
        <button
          className="mt-4 text-accent underline"
          onClick={() => void navigate({ to: "/dashboards", search: { workspace: undefined } })}
        >
          Open your personal workspace
        </button>
      </div>
    );
  if (!workspace) return <p className="p-8 text-mist">Loading workspaces…</p>;

  function selectWorkspace(id: string) {
    void navigate({ to: "/dashboards", search: { workspace: id } });
  }

  const workspaceApi: typeof api = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("x-dash-workspace-id", workspace.id);
    try {
      return await api(path, { ...init, headers });
    } catch (cause) {
      void queryClient.invalidateQueries({ queryKey: ["workspaces", user.id] });
      throw cause;
    }
  };

  return (
    <WorkspaceContext.Provider value={{ workspace, workspaces, selectWorkspace, workspaceApi }}>
      <div key={`${workspace.id}:${workspace.role}`}>{children}</div>
    </WorkspaceContext.Provider>
  );
}
