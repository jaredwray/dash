import { randomUUID } from "node:crypto";
import type { ConnectionConfig, MongoConnectionConfig, PublicUser } from "@dash/core";
import { resolveMongoTarget } from "@dash/adapter-mongodb";
import { ConnectionString } from "mongodb-connection-string-url";
import type { PlanSource, SeedDomainKey, SeedPlan, SeedSize } from "@dash/seed";
import { dashboards, getDb, workspaces } from "../db.ts";
import { getEnv } from "../env.ts";
import { ServerClosingError, isServerClosing, onServerClose } from "../shutdown.ts";
import { createDashboard, deleteDashboard } from "./dashboards.ts";
import { getDataSourceConfig, listDataSources } from "./data-sources.ts";
import { createWorkspace } from "./workspaces.ts";

/**
 * Development seeding: writes the Fernway sample company into the data
 * sources an admin configured, then adds dashboards on that data.
 *
 * The run happens in this process after the request returns. The state
 * document in `settings` holds the progress, so the Settings page can poll
 * it and a second run cannot start at the same time.
 */

export const DEV_SEED_WORKSPACE = "Fernway";

/** A run whose heartbeat is older than this is treated as stopped. */
const STALE_MS = 5 * 60_000;

/** A running task refreshes its heartbeat this often, apart from progress. */
const HEARTBEAT_MS = 30_000;

export type DevSeedStatus = "idle" | "running" | "succeeded" | "failed";
export type DevSeedAction = "seed" | "remove";
export type DevSeedStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface DevSeedStep {
  domain: SeedDomainKey;
  label: string;
  sourceId: string;
  sourceName: string;
  kind: string;
  namespace: string;
  status: DevSeedStepStatus;
  rows: number;
  error: string | null;
}

interface OwnedTarget {
  sourceId: string;
  sourceName: string;
  kind: string;
  domain: SeedDomainKey;
  label: string;
  namespace: string;
  /** Engine, host, and database at seed time, with no credentials. */
  target: string | null;
}

interface DevSeedDoc {
  _id: "dev-seed";
  /** The run that holds the claim. A state write from another run is ignored. */
  runId: string | null;
  status: DevSeedStatus;
  action: DevSeedAction | null;
  size: SeedSize | null;
  asOf: string | null;
  startedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  error: string | null;
  steps: DevSeedStep[];
  workspaceId: string | null;
  dashboardIds: string[];
  owned: OwnedTarget[];
}

export interface DevSeedState {
  status: DevSeedStatus;
  action: DevSeedAction | null;
  size: SeedSize | null;
  asOf: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  steps: DevSeedStep[];
  workspaceId: string | null;
  dashboards: { id: string; name: string }[];
  hasSeedData: boolean;
}

export class DevSeedError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DevSeedError";
    this.status = status;
    this.code = code;
  }
}

type SeedModule = typeof import("@dash/seed");
let seedModule: Promise<SeedModule> | undefined;

/** The generator and writers load only when a development run needs them. */
function loadSeed(): Promise<SeedModule> {
  seedModule ??= import("@dash/seed");
  return seedModule;
}

export function devSeedEnabled(): boolean {
  return getEnv().seedDevSources;
}

async function stateCollection() {
  return (await getDb()).collection<DevSeedDoc>("settings");
}

function emptyDoc(): DevSeedDoc {
  return {
    _id: "dev-seed",
    runId: null,
    status: "idle",
    action: null,
    size: null,
    asOf: null,
    startedBy: null,
    startedAt: null,
    finishedAt: null,
    heartbeatAt: null,
    error: null,
    steps: [],
    workspaceId: null,
    dashboardIds: [],
    owned: [],
  };
}

async function readDoc(): Promise<DevSeedDoc> {
  return (await (await stateCollection()).findOne({ _id: "dev-seed" })) ?? emptyDoc();
}

function isStale(doc: DevSeedDoc): boolean {
  return doc.status === "running" && (!doc.heartbeatAt || Date.now() - Date.parse(doc.heartbeatAt) > STALE_MS);
}

export async function getDevSeedState(): Promise<DevSeedState> {
  const doc = await readDoc();
  const status: DevSeedStatus = isStale(doc) ? "failed" : doc.status;
  const rows = doc.dashboardIds.length
    ? await (await dashboards()).find({ _id: { $in: doc.dashboardIds } }).project<{ _id: string; name: string }>({ name: 1 }).toArray()
    : [];
  const names = new Map(rows.map((row) => [row._id, row.name]));
  return {
    status,
    action: doc.action,
    size: doc.size,
    asOf: doc.asOf,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    error: isStale(doc) ? "The run stopped before it finished. Start it again." : doc.error,
    steps: doc.steps,
    workspaceId: doc.workspaceId,
    dashboards: doc.dashboardIds.flatMap((id) => (names.has(id) ? [{ id, name: names.get(id)! }] : [])),
    hasSeedData: doc.owned.length > 0 || doc.dashboardIds.length > 0,
  };
}

function normalizeHost(host: string): string {
  // `localhost.` and `db.internal.` name the same hosts without the final dot.
  const lower = host.toLowerCase().replace(/\.(?=:\d+$|$)/, "");
  const withPort = /:\d+$/.test(lower) ? lower : `${lower}:27017`;
  return withPort.replace(/^(localhost|\[::1\]):/, "127.0.0.1:");
}

function hostsOf(uri: string): string[] {
  try {
    return new ConnectionString(uri).hosts.map(normalizeHost);
  } catch {
    return [];
  }
}

/** True when a MongoDB data source points at the Dash app database. */
export function isAppDatabase(config: MongoConnectionConfig): boolean {
  const env = getEnv();
  let target: ReturnType<typeof resolveMongoTarget>;
  try {
    target = resolveMongoTarget(config);
  } catch {
    return false;
  }
  if (target.database !== env.databaseName) return false;
  const app = new Set(hostsOf(env.mongoUri));
  return hostsOf(target.uri).some((host) => app.has(host));
}

async function planSources(): Promise<{ sources: PlanSource[]; configs: Map<string, ConnectionConfig> }> {
  const records = await listDataSources();
  const configs = new Map<string, ConnectionConfig>();
  const sources: PlanSource[] = [];
  for (const record of records) {
    let config: ConnectionConfig | undefined;
    try {
      config = await getDataSourceConfig(record.id);
    } catch {
      // A config saved with another DASH_SECRET cannot be read.
      sources.push({ id: record.id, name: record.name, kind: record.kind, createdAt: record.createdAt, updatedAt: record.updatedAt, refusal: "Dash cannot read the saved connection settings." });
      continue;
    }
    if (!config) continue;
    configs.set(record.id, config);
    sources.push({
      id: record.id,
      name: record.name,
      kind: record.kind,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(config.kind === "mongodb" && isAppDatabase(config)
        ? { refusal: "This source is the Dash app database. Point it at a different database." }
        : {}),
    });
  }
  return { sources, configs };
}

export async function getDevSeedPlan(size: SeedSize): Promise<SeedPlan> {
  const seed = await loadSeed();
  const { sources } = await planSources();
  return seed.planSeed(sources, size);
}

let currentRun: Promise<void> | undefined;
let currentAbort: AbortController | undefined;

/**
 * True while a seed or removal run is active. Data source edits wait for it,
 * so a run never acts on a connection that changed under it.
 */
export async function isDevSeedRunning(): Promise<boolean> {
  if (!devSeedEnabled()) return false;
  if (currentRun) return true;
  const doc = await readDoc();
  return doc.status === "running" && !isStale(doc);
}

onServerClose(async () => {
  currentAbort?.abort(new ServerClosingError());
  await currentRun?.catch(() => undefined);
});

/**
 * Claims the state document for a new run. Returns null when a run is
 * active. A run in this process is never taken over, even when its
 * heartbeat looks old.
 */
async function claim(action: DevSeedAction, user: PublicUser, patch: Partial<DevSeedDoc>): Promise<DevSeedDoc | null> {
  if (currentRun) return null;
  const collection = await stateCollection();
  const { _id: _ignored, ...initial } = emptyDoc();
  await collection.updateOne({ _id: "dev-seed" }, { $setOnInsert: initial }, { upsert: true });
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  return collection.findOneAndUpdate(
    { _id: "dev-seed", $or: [{ status: { $ne: "running" } }, { heartbeatAt: { $lt: staleBefore } }] },
    {
      $set: {
        runId: randomUUID(),
        status: "running",
        action,
        startedBy: user.id,
        startedAt: now,
        heartbeatAt: now,
        finishedAt: null,
        error: null,
        ...patch,
      },
    },
    { returnDocument: "after" },
  );
}

type Update = (set: Record<string, unknown>) => Promise<void>;

/**
 * State writes for one run. After another run takes over, a write matches
 * nothing and `onLost` stops this run before its next write to a source.
 */
function updater(runId: string, onLost: () => void): Update {
  return async (set) => {
    const result = await (await stateCollection()).updateOne(
      { _id: "dev-seed", runId },
      { $set: { ...set, heartbeatAt: new Date().toISOString() } },
    );
    if (result.matchedCount === 0) onLost();
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function launch(runId: string, task: (signal: AbortSignal, update: Update) => Promise<void>): void {
  const controller = new AbortController();
  const update = updater(runId, () => controller.abort(new Error("Another seed run took over. This run stopped.")));
  // A long table load sends no progress, so the heartbeat has its own timer.
  const heartbeat = setInterval(() => void update({}).catch(() => undefined), HEARTBEAT_MS);
  heartbeat.unref?.();
  currentAbort = controller;
  currentRun = task(controller.signal, update)
    .catch(async (error: unknown) => {
      await update({ status: "failed", error: message(error), finishedAt: new Date().toISOString() }).catch(() => undefined);
    })
    .finally(() => {
      clearInterval(heartbeat);
      if (currentAbort === controller) {
        currentAbort = undefined;
        currentRun = undefined;
      }
    });
}

/**
 * Starts a seed run. `planId` must match the plan that the admin confirmed,
 * so a changed source list cannot receive data that nobody reviewed.
 */
export async function startDevSeed(user: PublicUser, planId: string, size: SeedSize): Promise<DevSeedState> {
  if (isServerClosing()) throw new ServerClosingError();
  const seed = await loadSeed();
  const { sources, configs } = await planSources();
  const plan = seed.planSeed(sources, size);
  if (plan.planId !== planId) {
    throw new DevSeedError(409, "plan_changed", "The data sources changed. Review the plan again.");
  }
  if (plan.assignments.length === 0) {
    throw new DevSeedError(400, "no_targets", "Add a Postgres, MongoDB, or BigQuery data source first.");
  }
  const asOf = seed.defaultAsOf();
  const steps: DevSeedStep[] = plan.assignments.map((item) => ({
    domain: item.domain,
    label: item.label,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    kind: item.kind,
    namespace: item.namespace,
    status: "pending",
    rows: 0,
    error: null,
  }));
  const claimed = await claim("seed", user, { size, asOf: asOf.toISOString().slice(0, 10), steps });
  if (!claimed?.runId) throw new DevSeedError(409, "busy", "A seed run is already in progress.");

  launch(claimed.runId, async (signal, update) => {
    const dataset = seed.generateDataset({ asOf, size });
    const writers = new Map<string, NonNullable<ReturnType<SeedModule["createSeedWriter"]>>>();
    try {
      for (const item of plan.assignments) {
        if (writers.has(item.sourceId)) continue;
        const writer = seed.createSeedWriter(configs.get(item.sourceId)!);
        if (!writer) throw new Error(`No seed writer for ${item.kind}`);
        writers.set(item.sourceId, writer);
      }
      // Check every target before the first write.
      const conflicts: string[] = [];
      for (const item of plan.assignments) {
        const domain = dataset.domains.find((entry) => entry.key === item.domain)!;
        const state = await writers.get(item.sourceId)!.inspect(domain);
        if (state.state === "foreign") conflicts.push(`${item.sourceName}: ${state.conflicts.join(", ")}`);
      }
      if (conflicts.length > 0) {
        throw new Error(`Nothing was written. These targets hold data that Dash did not create: ${conflicts.join("; ")}.`);
      }

      const owned = [...claimed.owned];
      const done = new Set<SeedDomainKey>();
      for (const [index, item] of plan.assignments.entries()) {
        if (signal.aborted) throw signal.reason;
        const domain = dataset.domains.find((entry) => entry.key === item.domain)!;
        const target = seed.seedTarget(configs.get(item.sourceId)!);
        await update({ [`steps.${index}.status`]: "running" });
        if (!owned.some((entry) => entry.sourceId === item.sourceId && entry.domain === item.domain && entry.target === target)) {
          owned.push({ sourceId: item.sourceId, sourceName: item.sourceName, kind: item.kind, domain: item.domain, label: item.label, namespace: item.namespace, target });
          await update({ owned });
        }
        try {
          let rows = 0;
          let progress = Promise.resolve();
          await writers.get(item.sourceId)!.replace(domain, {
            signal,
            size,
            asOf,
            onTable: (_table, count) => {
              rows += count;
              const total = rows;
              progress = progress.then(() => update({ [`steps.${index}.rows`]: total })).catch(() => undefined);
            },
          });
          await progress;
          done.add(item.domain);
          await update({ [`steps.${index}.status`]: "done", [`steps.${index}.rows`]: rows });
        } catch (error) {
          if (signal.aborted) throw error;
          await update({ [`steps.${index}.status`]: "failed", [`steps.${index}.error`]: message(error) });
        }
      }

      // Dashboards on the domains that were written. Each id is saved as soon
      // as it exists, so a failure part way leaves nothing untracked.
      const targets = new Map(plan.assignments.filter((item) => done.has(item.domain)).map((item) => [item.domain, item]));
      const specs = seed.buildDashboards(asOf, (domain, table) => {
        const item = targets.get(domain);
        return item ? { dataSourceId: item.sourceId, resource: seed.resourceName(item.kind, domain, table) } : null;
      });
      let workspaceId = claimed.workspaceId;
      if (!workspaceId || !(await (await workspaces()).findOne({ _id: workspaceId, kind: "shared" }))) {
        workspaceId = (await createWorkspace(user, DEV_SEED_WORKSPACE)).id;
        await update({ workspaceId });
      }
      const dashboardIds = [...claimed.dashboardIds];
      for (const id of claimed.dashboardIds) {
        await deleteDashboard(claimed.workspaceId ?? workspaceId, id);
        dashboardIds.splice(dashboardIds.indexOf(id), 1);
        await update({ dashboardIds });
      }
      for (const dashboard of specs) {
        const created = await createDashboard({
          workspaceId,
          name: dashboard.name,
          description: dashboard.description,
          widgets: dashboard.widgets,
          createdBy: user.id,
        });
        dashboardIds.push(created.id);
        await update({ dashboardIds });
      }
      const failed = done.size < plan.assignments.length;
      await update({
        status: failed ? "failed" : "succeeded",
        error: failed ? "Some domains failed. The dashboards show the domains that were written." : null,
        finishedAt: new Date().toISOString(),
      });
    } finally {
      await Promise.allSettled([...writers.values()].map((writer) => writer.close()));
    }
  });
  return getDevSeedState();
}

/** Starts a run that drops the seeded data and the seeded dashboards. */
export async function startDevSeedRemoval(user: PublicUser): Promise<DevSeedState> {
  if (isServerClosing()) throw new ServerClosingError();
  const current = await readDoc();
  const steps: DevSeedStep[] = current.owned.map((item) => ({
    domain: item.domain,
    label: item.label,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    kind: item.kind,
    namespace: item.namespace,
    status: "pending",
    rows: 0,
    error: null,
  }));
  const claimed = await claim("remove", user, { steps });
  if (!claimed?.runId) throw new DevSeedError(409, "busy", "A seed run is already in progress.");
  const seed = await loadSeed();

  launch(claimed.runId, async (signal, update) => {
    const remaining: OwnedTarget[] = [];
    for (const [index, item] of claimed.owned.entries()) {
      await update({ [`steps.${index}.status`]: "running" });
      if (signal.aborted) throw signal.reason;
      // Read the sources again for each step, so an edit during the run is seen.
      const { configs } = await planSources();
      // Act only on the target that received the data. The source that
      // seeded it comes first. Another source with the same target also
      // works, for example a source that someone deleted and added again.
      const own = configs.get(item.sourceId);
      const config =
        own && seed.seedTarget(own) === item.target
          ? own
          : [...configs.values()].find((candidate) => item.target !== null && seed.seedTarget(candidate) === item.target);
      if (!config) {
        remaining.push(item);
        await update({
          [`steps.${index}.status`]: "failed",
          [`steps.${index}.error`]: own
            ? `This data source now points somewhere else. Restore its connection to ${item.target ?? "the seeded target"}, then remove again.`
            : `No data source points at ${item.target ?? "the seeded target"} now. Add one, then remove again.`,
        });
        continue;
      }
      const writer = seed.createSeedWriter(config);
      try {
        if (!writer) throw new Error(`No seed writer for ${config.kind}`);
        await writer.remove(item.domain);
        await update({ [`steps.${index}.status`]: "done" });
      } catch (error) {
        remaining.push(item);
        await update({ [`steps.${index}.status`]: "failed", [`steps.${index}.error`]: message(error) });
      } finally {
        await writer?.close().catch(() => undefined);
      }
    }
    const dashboardIds = [...claimed.dashboardIds];
    if (claimed.workspaceId) {
      for (const id of claimed.dashboardIds) {
        await deleteDashboard(claimed.workspaceId, id);
        dashboardIds.splice(dashboardIds.indexOf(id), 1);
        await update({ dashboardIds });
      }
    }
    await update({
      status: remaining.length ? "failed" : "succeeded",
      error: remaining.length ? "Some targets could not be removed." : null,
      owned: remaining,
      finishedAt: new Date().toISOString(),
    });
  });
  return getDevSeedState();
}
