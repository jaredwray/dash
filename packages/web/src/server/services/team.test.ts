import { ensurePersonalWorkspace } from "./workspaces.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EmailTakenError,
  authenticatePassword,
  createSession,
  createUser,
  findUserByEmail,
  issueApiToken,
} from "../auth.ts";
import { invitations } from "../db.ts";
import { isResponse, requireAdminSession } from "../guard.ts";
import { SESSION_COOKIE } from "../http.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "../test-db.ts";
import { EmailDomainNotAllowedError } from "./account-policy.ts";
import { updateSettings } from "./settings.ts";
import {
  INVITATION_TTL_MS,
  LastAdminError,
  acceptInvitation,
  createInvitation,
  listInvitations,
  listMembers,
  previewInvitation,
  revokeInvitation,
  setMemberRole,
} from "./team.ts";

function admin(email = "ada@example.com", name = "Ada") {
  return createUser({ email, name, password: "password123", role: "admin" });
}

function member(email = "grace@example.com", name = "Grace") {
  return createUser({ email, name, password: "password123", role: "member" });
}

describe("team", () => {
  beforeEach(async () => {
    await useFreshAppDatabase();
  });

  afterEach(async () => {
    await destroyAppDatabase();
  });

  describe("members", () => {
    it("lists everyone oldest first", async () => {
      const first = await admin();
      const second = await member();
      const members = await listMembers();
      expect(members.map((row) => row.id)).toEqual([first.id, second.id]);
      expect(members[1]).toEqual({
        id: second.id,
        email: "grace@example.com",
        name: "Grace",
        role: "member",
        createdAt: second.createdAt,
      });
      expect(members[0]).not.toHaveProperty("passwordHash");
    });

    it("promotes and demotes", async () => {
      await admin();
      const grace = await member();
      expect((await setMemberRole(grace.id, "admin"))?.role).toBe("admin");
      expect((await findUserByEmail("grace@example.com"))?.role).toBe("admin");
      expect((await setMemberRole(grace.id, "member"))?.role).toBe("member");
      expect(await setMemberRole("missing", "admin")).toBeUndefined();
    });

    it("refuses to demote the last admin", async () => {
      const ada = await admin();
      await expect(setMemberRole(ada.id, "member")).rejects.toBeInstanceOf(LastAdminError);
      expect((await findUserByEmail("ada@example.com"))?.role).toBe("admin");
      expect((await setMemberRole(ada.id, "admin"))?.role).toBe("admin");
    });

    it("keeps an admin when two admins demote each other at once", async () => {
      const ada = await admin();
      const grace = await admin("grace@example.com", "Grace");
      const results = await Promise.allSettled([
        setMemberRole(ada.id, "member"),
        setMemberRole(grace.id, "member"),
      ]);
      const admins = (await listMembers()).filter((row) => row.role === "admin");
      expect(admins.length).toBeGreaterThanOrEqual(1);
      for (const result of results) {
        if (result.status === "rejected") {
          expect(result.reason).toBeInstanceOf(LastAdminError);
        }
      }
    });
  });

  describe("invitations", () => {
    it("invites, previews, and accepts once with the invited role", async () => {
      const ada = await admin();
      await updateSettings({ name: "Acme", allowRegistration: false });
      const { token, invitation } = await createInvitation({
        email: "  Linus@Example.com ",
        role: "admin",
        invitedBy: ada.id,
      });
      expect(invitation).toMatchObject({
        email: "linus@example.com",
        role: "admin",
        invitedBy: { id: ada.id, name: "Ada" },
        status: "pending",
      });
      const expiresIn = new Date(invitation.expiresAt).getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(INVITATION_TTL_MS - 60_000);
      expect(expiresIn).toBeLessThanOrEqual(INVITATION_TTL_MS);

      const stored = await (await invitations()).findOne({ _id: invitation.id });
      expect(stored?.tokenHash).not.toContain(token);
      expect(JSON.stringify(stored)).not.toContain(token);

      expect(await listInvitations()).toEqual([invitation]);
      expect(await previewInvitation(token)).toEqual({
        email: "linus@example.com",
        role: "admin",
        organizationName: "Acme",
        invitedByName: "Ada",
        expiresAt: invitation.expiresAt,
      });

      const user = await acceptInvitation({ token, name: " Linus ", password: "password123" });
      expect(user).toMatchObject({ email: "linus@example.com", name: "Linus", role: "admin" });
      expect((await authenticatePassword("linus@example.com", "password123"))?.id).toBe(user?.id);
      expect(await (await invitations()).findOne({ _id: invitation.id })).toMatchObject({
        status: "accepted",
        acceptedBy: user?.id,
      });

      expect(await listInvitations()).toEqual([]);
      expect(await previewInvitation(token)).toBeUndefined();
      expect(await acceptInvitation({ token, name: "Again", password: "password123" })).toBeUndefined();
    });

    it("creates one account when the same link is accepted twice at once", async () => {
      const ada = await admin();
      const { token } = await createInvitation({
        email: "linus@example.com",
        role: "member",
        invitedBy: ada.id,
      });
      const results = await Promise.all([
        acceptInvitation({ token, name: "One", password: "password123" }),
        acceptInvitation({ token, name: "Two", password: "password123" }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await listMembers()).filter((row) => row.email === "linus@example.com")).toHaveLength(1);
    });

    it("replaces an open invitation when the same email is invited again", async () => {
      const ada = await admin();
      const first = await createInvitation({
        email: "linus@example.com",
        role: "member",
        invitedBy: ada.id,
      });
      const second = await createInvitation({
        email: "LINUS@example.com",
        role: "admin",
        invitedBy: ada.id,
      });
      expect(second.invitation.id).toBe(first.invitation.id);
      expect(second.token).not.toBe(first.token);
      expect(await listInvitations()).toHaveLength(1);
      expect(await previewInvitation(first.token)).toBeUndefined();
      expect((await previewInvitation(second.token))?.role).toBe("admin");
    });

    it("keeps one open invitation under concurrent invites for a new email", async () => {
      const ada = await admin();
      const issued = await Promise.all([
        createInvitation({ email: "linus@example.com", role: "member", invitedBy: ada.id }),
        createInvitation({ email: "linus@example.com", role: "admin", invitedBy: ada.id }),
      ]);
      expect(await listInvitations()).toHaveLength(1);
      const usable = await Promise.all(issued.map((row) => previewInvitation(row.token)));
      expect(usable.filter(Boolean)).toHaveLength(1);
    });

    it("creates an account only for a domain on the list", async () => {
      const ada = await admin();
      await updateSettings({ allowedEmailDomains: ["acme.com"] });
      await expect(
        createInvitation({ email: "linus@example.com", role: "member", invitedBy: ada.id }),
      ).rejects.toBeInstanceOf(EmailDomainNotAllowedError);
      expect(await listInvitations()).toEqual([]);

      const { token } = await createInvitation({
        email: "linus@acme.com",
        role: "member",
        invitedBy: ada.id,
      });
      await expect(
        acceptInvitation({ token, name: "Linus", password: "password123" }),
      ).resolves.toMatchObject({ email: "linus@acme.com", role: "member" });
    });

    it("releases an invitation when the domain is no longer allowed", async () => {
      const ada = await admin();
      const { token } = await createInvitation({
        email: "linus@example.com",
        role: "member",
        invitedBy: ada.id,
      });
      await updateSettings({ allowedEmailDomains: ["acme.com"] });
      await expect(
        acceptInvitation({ token, name: "Linus", password: "password123" }),
      ).rejects.toBeInstanceOf(EmailDomainNotAllowedError);
      expect(await findUserByEmail("linus@example.com")).toBeUndefined();
      expect(await previewInvitation(token)).toMatchObject({ email: "linus@example.com" });
    });

    it("refuses to invite an existing member", async () => {
      const ada = await admin();
      await member();
      await expect(
        createInvitation({ email: "Grace@example.com", role: "member", invitedBy: ada.id }),
      ).rejects.toBeInstanceOf(EmailTakenError);
      expect(await listInvitations()).toEqual([]);
    });

    it("revokes an open invitation", async () => {
      const ada = await admin();
      const { token, invitation } = await createInvitation({
        email: "linus@example.com",
        role: "member",
        invitedBy: ada.id,
      });
      expect(await revokeInvitation(invitation.id)).toBe(true);
      expect(await revokeInvitation(invitation.id)).toBe(false);
      expect(await revokeInvitation("missing")).toBe(false);
      expect(await listInvitations()).toEqual([]);
      expect(await previewInvitation(token)).toBeUndefined();
      expect(await acceptInvitation({ token, name: "Linus", password: "password123" })).toBeUndefined();
    });

    it("lists an expired invitation as expired and refuses its link until reissued", async () => {
      const ada = await admin();
      const { token, invitation } = await createInvitation({
        email: "linus@example.com",
        role: "member",
        invitedBy: ada.id,
      });
      await (
        await invitations()
      ).updateOne(
        { _id: invitation.id },
        { $set: { expiresAt: new Date(Date.now() - 1000).toISOString() } },
      );
      expect((await listInvitations())[0]?.status).toBe("expired");
      expect(await previewInvitation(token)).toBeUndefined();
      expect(await acceptInvitation({ token, name: "Linus", password: "password123" })).toBeUndefined();

      const reissued = await createInvitation({
        email: "linus@example.com",
        role: "member",
        invitedBy: ada.id,
      });
      expect(reissued.invitation.status).toBe("pending");
      expect(await acceptInvitation({ token: reissued.token, name: "Linus", password: "password123" }))
        .toMatchObject({ email: "linus@example.com", role: "member" });
    });

    it("releases the invitation when the email registered in the meantime", async () => {
      const ada = await admin();
      const { token } = await createInvitation({
        email: "linus@example.com",
        role: "admin",
        invitedBy: ada.id,
      });
      await member("linus@example.com", "Linus");
      await expect(
        acceptInvitation({ token, name: "Linus", password: "password123" }),
      ).rejects.toBeInstanceOf(EmailTakenError);
      expect((await findUserByEmail("linus@example.com"))?.role).toBe("member");
      expect(await listInvitations()).toHaveLength(1);
    });

    it("shows a removed inviter as unknown", async () => {
      const { token, invitation } = await createInvitation({
        email: "linus@example.com",
        role: "member",
        invitedBy: "gone",
      });
      expect(invitation.invitedBy).toBeNull();
      expect((await previewInvitation(token))?.invitedByName).toBeNull();
    });
  });

  describe("admin session guard", () => {
    function sessionRequest(token: string): Request {
      return new Request("http://localhost/api/invitations", {
        headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
      });
    }

    it("allows an admin session only", async () => {
      const ada = await admin();
      const grace = await member();

      const allowed = await requireAdminSession(sessionRequest(await createSession(ada.id)));
      expect(isResponse(allowed)).toBe(false);

      const memberSession = await requireAdminSession(
        sessionRequest(await createSession(grace.id)),
      );
      expect(isResponse(memberSession) && memberSession.status).toBe(403);

      const issued = await issueApiToken({
        userId: ada.id,
        workspaceId: await ensurePersonalWorkspace(ada.id),
        name: "automation",
        scopes: ["read", "write"],
        expiresAt: null,
      });
      const adminToken = await requireAdminSession(
        new Request("http://localhost/api/invitations", {
          headers: { authorization: `Bearer ${issued.token}` },
        }),
      );
      expect(isResponse(adminToken) && adminToken.status).toBe(403);

      const anonymous = await requireAdminSession(new Request("http://localhost/api/invitations"));
      expect(isResponse(anonymous) && anonymous.status).toBe(401);
    });
  });
});
