import { EmailTakenError, countUsers, createUser, findUserByEmail, grantInitialAdmin } from "./auth.ts";
import { ensurePersonalWorkspace } from "./services/workspaces.ts";
import { dashboards, getDb, nowIso } from "./db.ts";
import { getEnv } from "./env.ts";
import { getSettings, updateSettings } from "./services/settings.ts";

export const DEMO_LOGIN = {
  email: "admin@dash.dev",
  password: "dashadmin",
} as const;

/**
 * The built-in sample warehouse (`kind: "demo"`) is gone. Older app databases
 * can still hold one, and its config has no adapter now. This step runs once:
 * it deletes those sources and the widgets that read them. A dashboard with
 * no widget left is deleted too. The demo source held no data of its own.
 */
async function retireDemoSources(): Promise<void> {
  const db = await getDb();
  const marker = db.collection<{ _id: string; complete: boolean }>("settings");
  if (await marker.findOne({ _id: "demo-retired" })) return;
  const sources = db.collection<{ _id: string; kind: string }>("data_sources");
  const ids = (await sources.find({ kind: "demo" }).project<{ _id: string }>({ _id: 1 }).toArray()).map((row) => row._id);
  if (ids.length > 0) {
    const boards = await dashboards();
    for (const board of await boards.find({ "widgets.dataSourceId": { $in: ids } }).toArray()) {
      const widgets = board.widgets.filter((widget) => !ids.includes(widget.dataSourceId));
      if (widgets.length === 0) {
        await boards.deleteOne({ _id: board._id });
      } else {
        await boards.updateOne({ _id: board._id }, { $set: { widgets, updatedAt: nowIso() } });
      }
    }
    await sources.deleteMany({ _id: { $in: ids } });
  }
  await marker.updateOne({ _id: "demo-retired" }, { $set: { complete: true } }, { upsert: true });
}

let seedTask: Promise<void> | undefined;

export function resetSeedForTests(): void {
  seedTask = undefined;
}

async function seedOnce(): Promise<void> {
  const db = await getDb();
  await getSettings();
  await retireDemoSources();
  if (!getEnv().seedDemo) return;
  const progress = db.collection<{ _id: string; complete: boolean }>("settings");
  let state = await progress.findOne({ _id: "demo-seed" });
  if (!state) {
    if ((await countUsers()) !== 0) return;
    await progress.updateOne(
      { _id: "demo-seed" },
      { $setOnInsert: { complete: false } },
      { upsert: true },
    );
    state = await progress.findOne({ _id: "demo-seed" });
  }
  if (state?.complete) return;

  // Resume each step after a failed request or a server restart.
  let admin = await findUserByEmail(DEMO_LOGIN.email);
  if (!admin) {
    try {
      await createUser({
        email: DEMO_LOGIN.email,
        name: "Dash Admin",
        password: DEMO_LOGIN.password,
        role: "member",
      });
    } catch (error) {
      if (!(error instanceof EmailTakenError)) throw error;
    }
    admin = await findUserByEmail(DEMO_LOGIN.email);
  }
  if (!admin) throw new Error("Demo account not found");
  await grantInitialAdmin(admin._id);
  await ensurePersonalWorkspace(admin._id);
  await updateSettings({ name: "Dash", allowRegistration: true });
  await progress.updateOne({ _id: "demo-seed" }, { $set: { complete: true } });
}

export function ensureSeeded(): Promise<void> {
  if (!seedTask) {
    seedTask = seedOnce().catch((error: unknown) => {
      seedTask = undefined;
      throw error;
    });
  }
  return seedTask;
}
