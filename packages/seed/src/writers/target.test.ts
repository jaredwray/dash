import { describe, expect, it } from "vitest";
import { seedTarget } from "./target.ts";

describe("seedTarget", () => {
  it("names the engine, host, and database without credentials", () => {
    const targets = [
      seedTarget({ kind: "postgres", connectionString: "postgres://dash:s3cret@DB.example.com:6543/fernway" }),
      seedTarget({ kind: "postgres", host: "db.example.com", port: 6543, database: "fernway", user: "dash", password: "s3cret" }),
      seedTarget({ kind: "mongodb", connectionString: "mongodb://dash:s3cret@b.example.com:27017,a.example.com:27017/fernway?authSource=admin" }),
      seedTarget({ kind: "bigquery", projectId: "acme", apiEndpoint: "http://127.0.0.1:9059" }),
    ];
    expect(targets).toEqual([
      "postgres://db.example.com:6543/fernway",
      "postgres://db.example.com:6543/fernway",
      "mongodb://a.example.com:27017,b.example.com:27017/fernway",
      "bigquery://127.0.0.1:9059/acme",
    ]);
    for (const target of targets) expect(target).not.toContain("s3cret");
  });

  it("changes when a source points at another database or project", () => {
    expect(seedTarget({ kind: "mongodb", host: "127.0.0.1", port: 27029, database: "fernway" })).not.toBe(
      seedTarget({ kind: "mongodb", host: "127.0.0.1", port: 27029, database: "other" }),
    );
    expect(seedTarget({ kind: "bigquery", projectId: "acme" })).not.toBe(seedTarget({ kind: "bigquery", projectId: "other" }));
    expect(seedTarget({ kind: "mysql", host: "127.0.0.1" })).toBeNull();
  });
});
