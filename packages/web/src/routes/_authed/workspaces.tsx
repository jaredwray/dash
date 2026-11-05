import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { PublicUser, Workspace, WorkspaceMember, WorkspaceMemberRole } from "@dash/core";
import { useWorkspace } from "~/components/WorkspaceProvider";
import { Field, GhostButton, PrimaryButton, Select, TextInput } from "~/components/ui";
import { api } from "~/lib/api";
import { fetchMe } from "~/lib/session";

export const Route = createFileRoute("/_authed/workspaces")({ component: WorkspacesPage });

function WorkspacesPage() {
  const { workspace, selectWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const [newName, setNewName] = useState("");
  const [name, setName] = useState(workspace.name);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<WorkspaceMemberRole>("viewer");
  const [copyStatus, setCopyStatus] = useState("");
  const members = useQuery({
    queryKey: ["workspace-members", workspace.id],
    enabled: workspace.canManage,
    queryFn: async () =>
      (await api<{ members: WorkspaceMember[] }>(`/api/workspaces/${workspace.id}/members`))
        .members,
  });
  const people = useQuery({
    queryKey: ["members"],
    enabled: workspace.canManage,
    queryFn: async () => (await api<{ members: PublicUser[] }>("/api/members")).members,
  });
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace.id] }),
    ]);
  }
  const create = useMutation({
    mutationFn: () =>
      api<{ workspace: Workspace }>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      }),
    onSuccess: async (payload) => {
      await refresh();
      selectWorkspace(payload.workspace.id);
    },
  });
  const rename = useMutation({
    mutationFn: () =>
      api(`/api/workspaces/${workspace.id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: refresh,
  });
  const share = useMutation({
    mutationFn: (input: { userId: string; role: WorkspaceMemberRole | null }) =>
      api(`/api/workspaces/${workspace.id}/members`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setUserId("");
      await refresh();
    },
  });
  const failure = create.error ?? rename.error ?? share.error ?? members.error ?? people.error;
  const candidates = (people.data ?? []).filter(
    (person) => !members.data?.some((member) => member.id === person.id),
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold">Workspaces</h1>
      <p className="mt-2 text-sm text-mist">
        Each workspace has its own dashboards. Data sources belong to the organization.
      </p>
      {failure ? (
        <p role="alert" className="mt-4 text-rose-300">
          {failure.message}
        </p>
      ) : null}
      <section className="mt-8 space-y-5 rounded-2xl border border-line bg-panel p-6">
        <div>
          <h2 className="text-xl font-medium">{workspace.name}</h2>
          <p className="mt-1 text-sm text-mist">
            {workspace.kind === "personal"
              ? "The owner controls access to this personal workspace."
              : "Organization admins control access to this shared workspace."}{" "}
            Your access:{" "}
            {workspace.role === "owner"
              ? "Manager"
              : workspace.role === "editor"
                ? "Editor"
                : "Viewer"}
            .
          </p>
        </div>
        {workspace.canManage ? (
          <>
            <form
              className="flex items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                rename.mutate();
              }}
            >
              <div className="flex-1">
                <Field label="Workspace name">
                  <TextInput
                    required
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
              </div>
              <GhostButton disabled={rename.isPending || !name.trim()} type="submit">
                Save name
              </GhostButton>
            </form>
            <div>
              <h3 className="font-medium">People with access</h3>
              <GhostButton
                className="mt-3"
                onClick={async () => {
                  try {
                    const url = new URL("/dashboards", window.location.origin);
                    url.searchParams.set("workspace", workspace.id);
                    await navigator.clipboard.writeText(url.href);
                    setCopyStatus("Workspace link copied. Only people with access can open it.");
                  } catch {
                    setCopyStatus("Could not copy the link. Copy the page URL from your browser.");
                  }
                }}
              >
                Copy workspace link
              </GhostButton>
              <p role="status" className="mt-2 text-sm text-mist">
                {copyStatus}
              </p>
              {workspace.kind === "shared" ? (
                <p className="mt-1 text-sm text-mist">
                  All organization admins have manager access.
                </p>
              ) : null}
              <ul className="mt-3 divide-y divide-line">
                {(members.data ?? []).map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm">{member.name}</p>
                      <p className="text-xs text-mist">{member.email}</p>
                    </div>
                    {member.role === "owner" ? (
                      <span className="text-sm text-mist">Manager</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select
                          aria-label={`Access for ${member.name}`}
                          value={member.role}
                          disabled={share.isPending}
                          onChange={(event) =>
                            share.mutate({
                              userId: member.id,
                              role: event.target.value as WorkspaceMemberRole,
                            })
                          }
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </Select>
                        <GhostButton
                          disabled={share.isPending}
                          onClick={() => share.mutate({ userId: member.id, role: null })}
                        >
                          Remove
                        </GhostButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <form
              className="space-y-3 border-t border-line pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                share.mutate({ userId, role });
              }}
            >
              <Field label="Share with an organization member">
                <Select required value={userId} onChange={(event) => setUserId(event.target.value)}>
                  <option value="">Select a person</option>
                  {candidates.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ({person.email})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Access">
                <Select
                  value={role}
                  onChange={(event) => setRole(event.target.value as WorkspaceMemberRole)}
                >
                  <option value="viewer">Viewer — can view dashboards</option>
                  <option value="editor">Editor — can create, change, and delete dashboards</option>
                </Select>
              </Field>
              <PrimaryButton type="submit" disabled={!userId || share.isPending}>
                Share workspace
              </PrimaryButton>
            </form>
          </>
        ) : (
          <p className="text-sm text-mist">Ask a workspace manager to change access.</p>
        )}
      </section>
      {me.data?.role === "admin" ? (
        <form
          className="mt-8 space-y-4 rounded-2xl border border-line bg-panel p-6"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="text-xl font-medium">Create a shared workspace</h2>
          <p className="text-sm text-mist">
            Only organization admins have access until you share it.
          </p>
          <Field label="Name">
            <TextInput
              required
              maxLength={80}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </Field>
          <PrimaryButton type="submit" disabled={!newName.trim() || create.isPending}>
            Create workspace
          </PrimaryButton>
        </form>
      ) : null}
    </div>
  );
}
