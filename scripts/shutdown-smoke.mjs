#!/usr/bin/env node
// Start the built @dash/web server, open the app database and one cached
// data source adapter, then send SIGTERM. The process must exit by itself.
//
// Cloudflare sends SIGTERM when the container sleeps or a new version rolls out.
// If the process stays alive after the HTTP listener closes, the Worker proxies
// each request to a closed port and returns "Error proxying request to container".
//
// Usage: pnpm --filter @dash/web build && pnpm test:services:start && pnpm test:shutdown

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = `${root}packages/web/.output/server/index.mjs`;
const { MongoClient } = createRequire(`${root}packages/web/package.json`)("mongodb");

// Less than FORCED_EXIT_MS in packages/web/src/server/shutdown.ts, so a forced exit fails the check.
const EXIT_LIMIT_MS = 8_000;
const START_LIMIT_MS = 30_000;

const mongoHost = process.env.DASH_TEST_MONGODB_HOST ?? "127.0.0.1";
const mongoPort = process.env.DASH_TEST_MONGODB_PORT ?? "27029";
const mongoUser = process.env.DASH_TEST_MONGODB_USER ?? "dash";
const mongoPassword = process.env.DASH_TEST_MONGODB_PASSWORD ?? "dash";
const authSource = process.env.DASH_TEST_MONGODB_AUTH_SOURCE ?? "admin";
const database = `dash_shutdown_${randomBytes(4).toString("hex")}`;
const credentials = `${encodeURIComponent(mongoUser)}:${encodeURIComponent(mongoPassword)}`;
const mongoUri = `mongodb://${credentials}@${mongoHost}:${mongoPort}/${database}?authSource=${encodeURIComponent(authSource)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function expectStatus(response, status, step) {
  if (response.status !== status) {
    throw new Error(`${step}: expected HTTP ${status}, received ${response.status}: ${await response.text()}`);
  }
}

async function dropDatabase() {
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    await client.db(database).dropDatabase();
  } finally {
    await client.close();
  }
}

async function main() {
  if (!existsSync(entry)) {
    throw new Error(`${entry} does not exist. Run "pnpm --filter @dash/web build" first.`);
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const output = [];
  const server = spawn(process.execPath, [entry], {
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(port),
      DASH_SECRET: `shutdown-smoke-${randomBytes(16).toString("hex")}`,
      DASH_SEED_DEMO: "false",
      MONGODB_URI: mongoUri,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => output.push(chunk));
  server.stderr.on("data", (chunk) => output.push(chunk));
  const exited = new Promise((resolve) => {
    server.once("exit", (code, signal) => resolve({ code, signal }));
  });

  try {
    const startedAt = Date.now();
    while (!(await canConnect(port))) {
      if (Date.now() - startedAt > START_LIMIT_MS || server.exitCode !== null) {
        throw new Error(`The server did not listen on port ${port}.`);
      }
      await sleep(200);
    }

    const register = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "smoke@example.com", password: "shutdown-smoke", name: "Smoke" }),
    });
    await expectStatus(register, 201, "register the first user");
    const cookie = register.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) {
      throw new Error("register the first user: no session cookie");
    }

    const create = await fetch(`${base}/api/data-sources`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Shutdown smoke",
        config: { kind: "mongodb", connectionString: mongoUri },
      }),
    });
    await expectStatus(create, 201, "create a MongoDB data source");
    const { dataSource } = await create.json();

    // The schema request opens an adapter that the registry keeps in its cache.
    const schema = await fetch(`${base}/api/data-sources/${dataSource.id}/schema`, { headers: { cookie } });
    await expectStatus(schema, 200, "read the data source schema");

    const signalledAt = Date.now();
    server.kill("SIGTERM");
    const result = await Promise.race([exited, sleep(EXIT_LIMIT_MS).then(() => undefined)]);
    if (!result) {
      throw new Error(`The server was still running ${EXIT_LIMIT_MS} ms after SIGTERM.`);
    }
    if (result.code !== 0) {
      throw new Error(`The server exited with code ${result.code} and signal ${result.signal} after SIGTERM.`);
    }
    console.log(`The server exited with code 0, ${Date.now() - signalledAt} ms after SIGTERM.`);
  } catch (error) {
    console.error(Buffer.concat(output).toString());
    throw error;
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGKILL");
      await exited;
    }
    await dropDatabase();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
