import { afterEach, describe, expect, it } from "vitest";
import { createUser } from "./auth.ts";
import { getAuthBootstrap } from "./bootstrap.ts";
import { DEMO_LOGIN, resetSeedForTests } from "./seed.ts";
import { updateSettings } from "./services/settings.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";

describe("auth bootstrap", () => {
  afterEach(async () => {
    await destroyAppDatabase();
    delete process.env.DASH_SEED_DEMO;
  });

  it("hides the demo login and opens first-account registration when seeding is off", async () => {
    await useFreshAppDatabase();
    process.env.DASH_SEED_DEMO = "false";
    await updateSettings({ allowRegistration: false });

    const empty = await getAuthBootstrap();
    expect(empty).toEqual({
      seedDemo: false,
      needsSetup: true,
      allowRegistration: true,
      demoLogin: null,
    });

    await createUser({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
      role: "admin",
    });
    await updateSettings({ allowRegistration: false });

    const closed = await getAuthBootstrap();
    expect(closed.needsSetup).toBe(false);
    expect(closed.allowRegistration).toBe(false);
    expect(closed.demoLogin).toBeNull();
    expect(closed.seedDemo).toBe(false);
  });

  it("returns the demo login only after the sample admin exists", async () => {
    await useFreshAppDatabase();
    process.env.DASH_SEED_DEMO = "true";
    resetSeedForTests();

    const seeded = await getAuthBootstrap();
    expect(seeded.seedDemo).toBe(true);
    expect(seeded.needsSetup).toBe(false);
    expect(seeded.allowRegistration).toBe(true);
    expect(seeded.demoLogin).toEqual({
      email: DEMO_LOGIN.email,
      password: DEMO_LOGIN.password,
    });

    await destroyAppDatabase();
    await useFreshAppDatabase();
    await createUser({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
      role: "member",
    });
    process.env.DASH_SEED_DEMO = "true";
    resetSeedForTests();

    const existing = await getAuthBootstrap();
    expect(existing.needsSetup).toBe(false);
    expect(existing.demoLogin).toBeNull();
  });
});
