import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import type { PublicInvitation, PublicUser, UserRole } from "@dash/core";
import { USER_ROLE_LABELS, USER_ROLES } from "@dash/core";
import { api } from "~/lib/api";
import { cn } from "~/lib/cn";
import { invitationUrl } from "~/lib/invitation";
import { fetchMe } from "~/lib/session";
import { Field, GhostButton, PrimaryButton, Select, TextInput } from "~/components/ui";

export const Route = createFileRoute("/_authed/team")({
  component: TeamPage,
});

interface IssuedInvitation {
  email: string;
  role: UserRole;
  url: string;
}

function useInvite(onIssued: (issued: IssuedInvitation) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: UserRole }) =>
      api<{ token: string; invitation: PublicInvitation }>("/api/invitations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (payload) => {
      onIssued({
        email: payload.invitation.email,
        role: payload.invitation.role,
        url: invitationUrl(window.location.origin, payload.token),
      });
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
  });
}

function TeamPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const isAdmin = me.data?.role === "admin";
  const members = useQuery({
    queryKey: ["members"],
    queryFn: async () => (await api<{ members: PublicUser[] }>("/api/members")).members,
  });
  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: async () =>
      (await api<{ invitations: PublicInvitation[] }>("/api/invitations")).invitations,
    enabled: isAdmin,
  });
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);

  return (
    <div className="max-w-4xl">
      <p className="text-xs uppercase tracking-[0.2em] text-mist">Workspace</p>
      <h1 className="mt-1 text-3xl font-semibold">Team</h1>
      <p className="mt-2 text-sm text-mist">
        Everyone with access to this organization. Admins can invite people, change roles, and
        manage data sources and settings. Users can build dashboards and issue their own API
        tokens.
      </p>

      {isAdmin ? <InviteForm onIssued={setIssued} /> : null}
      {issued ? <IssuedLink issued={issued} onDismiss={() => setIssued(null)} /> : null}

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">Members</h2>
          {members.data ? (
            <span className="text-sm text-mist">
              {members.data.length} {members.data.length === 1 ? "person" : "people"}
            </span>
          ) : null}
        </div>
        {members.isError ? (
          <p className="mt-3 text-sm text-rose-300">
            {members.error instanceof Error ? members.error.message : "Could not load members"}
          </p>
        ) : members.data && me.data ? (
          <MembersTable members={members.data} me={me.data} canManage={isAdmin} />
        ) : (
          <p className="mt-3 text-sm text-mist">Loading members…</p>
        )}
      </section>

      {isAdmin ? (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Pending invitations</h2>
          {invitations.data && invitations.data.length > 0 ? (
            <InvitationsTable invitations={invitations.data} onIssued={setIssued} />
          ) : invitations.isError ? (
            <p className="mt-3 text-sm text-rose-300">
              {invitations.error instanceof Error
                ? invitations.error.message
                : "Could not load invitations"}
            </p>
          ) : (
            <p className="mt-3 text-sm text-mist">
              {invitations.isPending ? "Loading invitations…" : "No open invitations."}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function InviteForm({ onIssued }: { onIssued: (issued: IssuedInvitation) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const invite = useInvite((issued) => {
    setEmail("");
    onIssued(issued);
  });

  return (
    <form
      className="mt-8 rounded-2xl border border-line bg-panel p-6"
      onSubmit={(event) => {
        event.preventDefault();
        invite.mutate({ email, role });
      }}
    >
      <h2 className="text-base font-medium">Invite someone</h2>
      <p className="mt-1 text-sm text-mist">
        Dash creates a sign-up link for you to share. It works once, even while open
        registration is off, and expires in 7 days.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            {USER_ROLES.map((value) => (
              <option key={value} value={value}>
                {USER_ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <PrimaryButton type="submit" disabled={invite.isPending}>
          <span className="inline-flex items-center gap-2">
            <UserPlus size={16} />
            {invite.isPending ? "Creating…" : "Create invite link"}
          </span>
        </PrimaryButton>
      </div>
      {invite.isError ? (
        <p className="mt-3 text-sm text-rose-300">
          {invite.error instanceof Error ? invite.error.message : "Could not create the invitation"}
        </p>
      ) : null}
    </form>
  );
}

function IssuedLink({ issued, onDismiss }: { issued: IssuedInvitation; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      role="status"
      className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm"
    >
      <p className="text-paper">
        Invite link for <span className="font-medium">{issued.email}</span> as{" "}
        {USER_ROLE_LABELS[issued.role]}. Copy it now: it cannot be shown again.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <TextInput
          readOnly
          value={issued.url}
          aria-label="Invite link"
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
        />
        <div className="flex gap-2">
          <GhostButton type="button" onClick={() => void copy()} className="whitespace-nowrap">
            <span className="inline-flex items-center gap-2">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy link"}
            </span>
          </GhostButton>
          <GhostButton type="button" onClick={onDismiss}>
            Done
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs",
        role === "admin"
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-line bg-white/5 text-mist",
      )}
    >
      {USER_ROLE_LABELS[role]}
    </span>
  );
}

function MembersTable({
  members,
  me,
  canManage,
}: {
  members: PublicUser[];
  me: PublicUser;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const adminCount = members.filter((member) => member.role === "admin").length;
  const changeRole = useMutation({
    mutationFn: async (input: { id: string; role: UserRole }) =>
      api<{ member: PublicUser }>(`/api/members/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: input.role }),
      }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
    },
  });

  return (
    <>
      {changeRole.isError ? (
        <p className="mt-3 text-sm text-rose-300">
          {changeRole.error instanceof Error ? changeRole.error.message : "Could not change role"}
        </p>
      ) : null}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/4 text-mist">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isLastAdmin = member.role === "admin" && adminCount === 1;
              const pendingRole =
                changeRole.isPending && changeRole.variables.id === member.id
                  ? changeRole.variables.role
                  : undefined;
              return (
                <tr key={member.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <span className="font-medium">{member.name}</span>
                    {member.id === me.id ? (
                      <span className="ml-2 text-xs text-mist">(you)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-mist">{member.email}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <Select
                        aria-label={`Role for ${member.name}`}
                        value={pendingRole ?? member.role}
                        disabled={changeRole.isPending || isLastAdmin}
                        title={isLastAdmin ? "The organization needs at least one admin" : undefined}
                        onChange={(event) =>
                          changeRole.mutate({
                            id: member.id,
                            role: event.target.value as UserRole,
                          })
                        }
                        className="w-28 py-1.5"
                      >
                        {USER_ROLES.map((value) => (
                          <option key={value} value={value}>
                            {USER_ROLE_LABELS[value]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-mist">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InvitationsTable({
  invitations,
  onIssued,
}: {
  invitations: PublicInvitation[];
  onIssued: (issued: IssuedInvitation) => void;
}) {
  const queryClient = useQueryClient();
  const reissue = useInvite(onIssued);
  const revoke = useMutation({
    mutationFn: async (id: string) => api(`/api/invitations/${id}`, { method: "DELETE" }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
  });
  const failure = reissue.error ?? revoke.error;

  return (
    <>
      {failure ? (
        <p className="mt-3 text-sm text-rose-300">
          {failure instanceof Error ? failure.message : "Could not update the invitation"}
        </p>
      ) : null}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/4 text-mist">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Invited by</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.id} className="border-t border-line">
                <td className="px-4 py-3">{invitation.email}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={invitation.role} />
                </td>
                <td className="px-4 py-3 text-mist">{invitation.invitedBy?.name ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {invitation.status === "expired" ? (
                    <span className="text-warn">Expired</span>
                  ) : (
                    <span className="text-mist">
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <GhostButton
                      type="button"
                      className="px-3 py-1.5 whitespace-nowrap"
                      disabled={reissue.isPending}
                      onClick={() =>
                        reissue.mutate({ email: invitation.email, role: invitation.role })
                      }
                    >
                      New link
                    </GhostButton>
                    <GhostButton
                      type="button"
                      className="px-3 py-1.5"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(invitation.id)}
                    >
                      Revoke
                    </GhostButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
