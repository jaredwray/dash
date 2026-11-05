import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "../test-db.ts";
import { RegistrationDeniedError, registerAccount, registrationPolicy } from "./account-policy.ts";
import { updateSettings } from "./settings.ts";
import { listMembers } from "./team.ts";

describe("registration policy", () => {
  beforeEach(async () => {
    await useFreshAppDatabase();
  });

  afterEach(async () => {
    await destroyAppDatabase();
  });

  it("lets the first account ignore the switch and the domain list", async () => {
    await updateSettings({ allowRegistration: false, allowedEmailDomains: ["acme.com"] });
    expect(await registrationPolicy("ada@other.com")).toEqual({ userCount: 0 });
  });

  it("closes registration before it checks the domain list", async () => {
    await createUser({
      email: "ada@other.com",
      name: "Ada",
      password: "password123",
      role: "admin",
    });
    await updateSettings({ allowRegistration: false, allowedEmailDomains: ["acme.com"] });
    await expect(registrationPolicy("linus@acme.com")).resolves.toMatchObject({
      userCount: 1,
      denial: { code: "registration_closed" },
    });
  });

  it("allows only listed domains after the first account", async () => {
    await createUser({
      email: "ada@other.com",
      name: "Ada",
      password: "password123",
      role: "admin",
    });
    await updateSettings({ allowedEmailDomains: ["acme.com"] });
    await expect(registrationPolicy("linus@example.com")).resolves.toMatchObject({
      userCount: 1,
      denial: { code: "domain_not_allowed" },
    });
    expect(await registrationPolicy("linus@acme.com")).toEqual({ userCount: 1 });
    await updateSettings({ allowedEmailDomains: [] });
    expect(await registrationPolicy("linus@example.com")).toEqual({ userCount: 1 });
  });

  it("makes one first account an admin when the domain is not on the list", async () => {
    await updateSettings({ allowRegistration: false, allowedEmailDomains: ["acme.com"] });
    const user = await registerAccount({
      email: "Ada@Other.com",
      name: " Ada ",
      password: "password123",
    });
    expect(user).toMatchObject({ email: "ada@other.com", name: "Ada", role: "admin" });
    expect(await listMembers()).toEqual([user]);
  });

  it("removes a concurrent account that loses the first claim", async () => {
    await updateSettings({ allowedEmailDomains: ["acme.com"] });
    const emails = ["ada@other.com", "linus@gmail.com", "grace@other.com", "evan@other.com"];
    const settled = await Promise.allSettled(
      emails.map((email) =>
        registerAccount({ email, name: "Person", password: "password123" }),
      ),
    );
    const created = settled.filter((result) => result.status === "fulfilled");
    const denied = settled.filter((result) => result.status === "rejected");
    expect(created).toHaveLength(1);
    expect(denied).toHaveLength(emails.length - 1);
    for (const result of denied) {
      expect(result.status).toBe("rejected");
      expect(result.reason).toBeInstanceOf(RegistrationDeniedError);
      expect(result.reason.code).toBe("domain_not_allowed");
    }
    const members = await listMembers();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ email: created[0]?.value.email, role: "admin" });
  });
});
