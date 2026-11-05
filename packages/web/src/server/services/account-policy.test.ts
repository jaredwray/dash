import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "../test-db.ts";
import { registrationPolicy } from "./account-policy.ts";
import { updateSettings } from "./settings.ts";

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
});
