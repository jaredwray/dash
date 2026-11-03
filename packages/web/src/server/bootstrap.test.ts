import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUser } from "./auth.ts";
import { getAuthBootstrap } from "./bootstrap.ts";
import { closeDb } from "./db.ts";
import { DEMO_LOGIN } from "./seed.ts";
import { updateSettings } from "./services/settings.ts";

function useDatabase(): void {
  process.env.DASH_SECRET = "unit-test-secret";
  process.env.DASH_DATABASE_PATH = join(
    mkdtempSync(join(tmpdir(), "dash-bootstrap-")),
    "test.sqlite",
  );
  closeDb();
}

describe("auth bootstrap", () => {
  afterEach(() => {
    closeDb();
    delete process.env.DASH_SEED_DEMO;
  });

  it("hides the demo login and opens first-account registration when seeding is off", async () => {
    useDatabase();
    process.env.DASH_SEED_DEMO = "false";
    updateSettings({ allowRegistration: false });

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
    updateSettings({ allowRegistration: false });

    const closed = await getAuthBootstrap();
    expect(closed.needsSetup).toBe(false);
    expect(closed.allowRegistration).toBe(false);
    expect(closed.demoLogin).toBeNull();
    expect(closed.seedDemo).toBe(false);
  });

  it("returns the demo login only after the sample admin exists", async () => {
    useDatabase();
    process.env.DASH_SEED_DEMO = "true";

    const seeded = await getAuthBootstrap();
    expect(seeded.seedDemo).toBe(true);
    expect(seeded.needsSetup).toBe(false);
    expect(seeded.allowRegistration).toBe(true);
    expect(seeded.demoLogin).toEqual({
      email: DEMO_LOGIN.email,
      password: DEMO_LOGIN.password,
    });

    useDatabase();
    process.env.DASH_SEED_DEMO = "false";
    await createUser({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
      role: "member",
    });
    process.env.DASH_SEED_DEMO = "true";

    const existing = await getAuthBootstrap();
    expect(existing.needsSetup).toBe(false);
    expect(existing.demoLogin).toBeNull();
  });
});
