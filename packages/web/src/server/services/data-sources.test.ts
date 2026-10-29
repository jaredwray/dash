import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth.ts";
import { closeDb } from "../db.ts";
import { createDataSource, deleteDataSource, listDataSources } from "./data-sources.ts";

describe("data source records", () => {
  beforeEach(() => {
    process.env.DASH_SECRET = "unit-test-secret";
    process.env.DASH_SEED_DEMO = "false";
    process.env.DASH_DATABASE_PATH = join(
      mkdtempSync(join(tmpdir(), "dash-ds-")),
      "test.sqlite",
    );
    closeDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("adds and removes a data source", async () => {
    const admin = await createUser({
      email: "admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "Finance warehouse",
      description: "Quarterly metrics",
      config: { kind: "demo" },
      createdBy: admin.id,
    });
    expect(created.name).toBe("Finance warehouse");
    expect(listDataSources().map((source) => source.id)).toContain(created.id);
    expect(deleteDataSource(created.id)).toBe(true);
    expect(listDataSources()).toEqual([]);
    expect(deleteDataSource(created.id)).toBe(false);
  });

  it("summarizes a Snowflake source without exposing the password", async () => {
    const admin = await createUser({
      email: "snowflake-admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "Snowflake analytics",
      description: "Warehouse",
      config: {
        kind: "snowflake",
        account: "xy12345.us-east-1",
        user: "analyst",
        warehouse: "COMPUTE_WH",
        database: "ANALYTICS",
        schema: "PUBLIC",
      },
      createdBy: admin.id,
    });
    expect(created.kind).toBe("snowflake");
    expect(created.summary).toEqual({
      account: "xy12345.us-east-1",
      warehouse: "COMPUTE_WH",
      database: "ANALYTICS",
      schema: "PUBLIC",
      role: "",
    });
    expect(created.summary).not.toHaveProperty("password");
  });

  it("summarizes a MySQL source without the password", async () => {
    const admin = await createUser({
      email: "mysql-admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "MySQL analytics",
      description: "Warehouse",
      config: {
        kind: "mysql",
        host: "mysql.internal",
        port: 3306,
        database: "analytics",
        user: "reader",
        password: "super-secret",
        ssl: true,
      },
      createdBy: admin.id,
    });
    expect(created.kind).toBe("mysql");
    expect(created.summary).toEqual({
      host: "mysql.internal",
      port: 3306,
      database: "analytics",
      user: "reader",
      ssl: true,
    });
    expect(JSON.stringify(created.summary)).not.toContain("super-secret");

    const fromUri = createDataSource({
      name: "MySQL URI",
      description: "URI",
      config: {
        kind: "mysql",
        connectionString: "mysql://reader:super-secret@mysql.internal:3306/analytics",
      },
      createdBy: admin.id,
    });
    expect(fromUri.summary).toEqual({
      host: "mysql.internal",
      port: 3306,
      database: "analytics",
      user: "reader",
      ssl: false,
    });
    expect(JSON.stringify(fromUri.summary)).not.toContain("super-secret");

    const malformed = createDataSource({
      name: "MySQL malformed",
      description: "Malformed URI",
      config: {
        kind: "mysql",
        connectionString: "mysql://reader:super/secret@mysql.internal/analytics",
      },
      createdBy: admin.id,
    });
    expect(malformed.summary).toEqual({
      host: "(connection string)",
      database: "",
      user: "",
      ssl: false,
    });
    expect(JSON.stringify(malformed.summary)).not.toContain("secret");
  });

  it("summarizes a MongoDB source without the password", async () => {
    const admin = await createUser({
      email: "mongo-admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "Events",
      description: "App events",
      config: {
        kind: "mongodb",
        host: "mongo.internal",
        port: 27017,
        database: "events",
        user: "reader",
        password: "super-secret",
        authSource: "admin",
        tls: true,
      },
      createdBy: admin.id,
    });
    expect(created.kind).toBe("mongodb");
    expect(created.summary).toEqual({
      host: "mongo.internal",
      port: 27017,
      database: "events",
      user: "reader",
      tls: true,
    });
    expect(JSON.stringify(created.summary)).not.toContain("super-secret");

    const fromUri = createDataSource({
      name: "Events URI",
      description: "URI",
      config: {
        kind: "mongodb",
        connectionString: "mongodb://reader:super-secret@mongo.internal:27017/events?authSource=admin",
        tls: true,
      },
      createdBy: admin.id,
    });
    expect(fromUri.summary).toEqual({
      host: "(connection string)",
      database: "events",
      user: "",
      tls: true,
    });
    expect(JSON.stringify(fromUri.summary)).not.toContain("super-secret");

    const malformed = createDataSource({
      name: "Events malformed",
      description: "Malformed URI",
      config: {
        kind: "mongodb",
        connectionString: "mongodb://reader:super/secret@mongo.internal/events",
      },
      createdBy: admin.id,
    });
    expect(malformed.summary.database).toBe("");
    expect(JSON.stringify(malformed.summary)).not.toContain("secret");

    const srv = createDataSource({
      name: "Events SRV",
      description: "SRV",
      config: {
        kind: "mongodb",
        connectionString: "mongodb+srv://reader:super-secret@cluster.example.net/events",
      },
      createdBy: admin.id,
    });
    expect(srv.summary).toMatchObject({
      database: "events",
      tls: true,
    });
    expect(JSON.stringify(srv.summary)).not.toContain("super-secret");

    const replica = createDataSource({
      name: "Events replica",
      description: "Replica set",
      config: {
        kind: "mongodb",
        connectionString: "mongodb://reader:super-secret@h1:27017,h2:27017/analytics?replicaSet=rs0",
        database: "analytics",
      },
      createdBy: admin.id,
    });
    expect(replica.summary.database).toBe("analytics");
    expect(replica.summary.tls).toBe(false);
    expect(JSON.stringify(replica.summary)).not.toContain("super-secret");
  });

  it("summarizes a BigQuery source without the service account key", async () => {
    const admin = await createUser({
      email: "bq-admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "Warehouse",
      description: "BigQuery",
      config: {
        kind: "bigquery",
        projectId: "dash-prod",
        dataset: "analytics",
        location: "US",
        credentials: {
          client_email: "dash@example.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\nsecret-key-material\n-----END PRIVATE KEY-----\n",
        },
      },
      createdBy: admin.id,
    });
    expect(created.kind).toBe("bigquery");
    expect(created.summary).toEqual({
      project: "dash-prod",
      dataset: "analytics",
      location: "US",
      endpoint: "bigquery.googleapis.com",
      auth: "service-account",
    });
    expect(JSON.stringify(created.summary)).not.toContain("secret-key-material");
    expect(JSON.stringify(created.summary)).not.toContain("PRIVATE KEY");

    const emulator = createDataSource({
      name: "Local BigQuery",
      description: "Emulator",
      config: {
        kind: "bigquery",
        projectId: "dash",
        dataset: "analytics",
        apiEndpoint: "http://127.0.0.1:9059",
      },
      createdBy: admin.id,
    });
    expect(emulator.summary).toEqual({
      project: "dash",
      dataset: "analytics",
      location: "",
      endpoint: "127.0.0.1:9059",
      auth: "anonymous",
    });

    const google = createDataSource({
      name: "Google BigQuery",
      description: "ADC",
      config: {
        kind: "bigquery",
        projectId: "dash-prod",
        apiEndpoint: "https://bigquery.googleapis.com",
      },
      createdBy: admin.id,
    });
    expect(google.summary.auth).toBe("adc");
    expect(google.summary.endpoint).toBe("bigquery.googleapis.com");
  });

  it("summarizes a Redshift source without the password", async () => {
    const admin = await createUser({
      email: "redshift-admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "Warehouse",
      description: "Redshift",
      config: {
        kind: "redshift",
        connectionString:
          "redshift://reader:super-secret@example.redshift.amazonaws.com:5439/analytics?sslmode=require",
      },
      createdBy: admin.id,
    });
    expect(created.kind).toBe("redshift");
    expect(created.summary).toEqual({
      host: "example.redshift.amazonaws.com",
      port: 5439,
      database: "analytics",
      user: "reader",
      ssl: true,
    });
    expect(JSON.stringify(created.summary)).not.toContain("super-secret");

    const rejected = createDataSource({
      name: "Broken",
      description: "Redshift",
      config: {
        kind: "redshift",
        connectionString: "redshift://reader:super-secret@example.redshift.amazonaws.com/analytics?options=-c",
      },
      createdBy: admin.id,
    });
    expect(JSON.stringify(rejected.summary)).not.toContain("super-secret");
    expect(rejected.summary.password).toBeUndefined();
  });

  it("summarizes a Databricks SQL source without the token", async () => {
    const admin = await createUser({
      email: "databricks-admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "Lakehouse",
      description: "Databricks SQL",
      config: {
        kind: "databricks",
        host: "adb-1.12.azuredatabricks.net",
        httpPath: "/sql/1.0/warehouses/abc",
        token: "dapi-secret-value",
        catalog: "main",
        schema: "analytics",
      },
      createdBy: admin.id,
    });
    expect(created.kind).toBe("databricks");
    expect(created.summary).toEqual({
      host: "adb-1.12.azuredatabricks.net",
      warehouse: "abc",
      catalog: "main",
      schema: "analytics",
      endpoint: "adb-1.12.azuredatabricks.net",
    });
    expect(JSON.stringify(created.summary)).not.toContain("dapi-secret-value");

    const malformed = createDataSource({
      name: "Broken warehouse",
      description: "Bad URI",
      config: {
        kind: "databricks",
        connectionString: "databricks://token:super-secret@/not-a-path",
      },
      createdBy: admin.id,
    });
    expect(malformed.summary).toEqual({
      host: "",
      warehouse: "",
      catalog: "",
      schema: "",
      endpoint: "",
    });
    expect(JSON.stringify(malformed.summary)).not.toContain("super-secret");
  });
});
