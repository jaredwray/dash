import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { resolveMongoTarget, scrubSecrets, toPlain } from "./adapter.ts";

describe("resolveMongoTarget", () => {
  it("keeps discrete credentials out of the URI", () => {
    const target = resolveMongoTarget({
      kind: "mongodb",
      host: "127.0.0.1",
      port: 27029,
      database: "dash",
      user: "dash",
      password: "s3cret",
      authSource: "admin",
      tls: true,
    });
    expect(target.uri).toBe("mongodb://127.0.0.1:27029");
    expect(target.uri).not.toContain("s3cret");
    expect(target.database).toBe("dash");
    expect(target.options.auth).toEqual({ username: "dash", password: "s3cret" });
    expect(target.options.authSource).toBe("admin");
    expect(target.options.tls).toBe(true);
    expect(target.options.serverSelectionTimeoutMS).toBe(10_000);
  });

  it("reads the database from a connection string and rejects URI injection", () => {
    const target = resolveMongoTarget({
      kind: "mongodb",
      connectionString: "mongodb://dash:s3cret@127.0.0.1:27029/events?authSource=admin",
    });
    expect(target.database).toBe("events");
    expect(target.options.auth).toBeUndefined();

    const srv = resolveMongoTarget({
      kind: "mongodb",
      connectionString: "mongodb+srv://dash:s3cret@cluster.example.net/events",
    });
    expect(srv.database).toBe("events");
    expect(srv.uri.startsWith("mongodb+srv://")).toBe(true);

    expect(() =>
      resolveMongoTarget({
        kind: "mongodb",
        host: "127.0.0.1/admin?",
        database: "dash",
      }),
    ).toThrow(/host/i);
    expect(() =>
      resolveMongoTarget({
        kind: "mongodb",
        connectionString: "http://127.0.0.1/dash",
      }),
    ).toThrow(/scheme/i);
    expect(() =>
      resolveMongoTarget({
        kind: "mongodb",
        host: "127.0.0.1",
        port: 0,
        database: "dash",
      }),
    ).toThrow(/port/i);
    expect(() =>
      resolveMongoTarget({
        kind: "mongodb",
        connectionString: "mongodb://127.0.0.1:27029",
      }),
    ).toThrow(/database/i);
  });
});

describe("scrubSecrets", () => {
  it("removes the password and the raw connection string", () => {
    const message = scrubSecrets(
      "connect failed for mongodb://dash:s3cret@127.0.0.1/dash using s3cret",
      ["s3cret", "mongodb://dash:s3cret@127.0.0.1/dash"],
    );
    expect(message).not.toContain("s3cret");
    expect(message).toContain("[redacted]");
  });
});

describe("toPlain", () => {
  it("turns BSON values into JSON values", () => {
    const id = new ObjectId("656e6f5f6e6f5f6e6f5f6e6f");
    const plain = toPlain({
      _id: id,
      when: new Date("2026-01-02T03:04:05.000Z"),
      nested: { amount: { _bsontype: "Int32", toString: () => "10" } },
      tags: [id],
    }) as {
      _id: string;
      when: string;
      nested: { amount: number };
      tags: string[];
    };
    expect(plain._id).toBe("656e6f5f6e6f5f6e6f5f6e6f");
    expect(plain.when).toBe("2026-01-02T03:04:05.000Z");
    expect(plain.nested.amount).toBe(10);
    expect(plain.tags).toEqual(["656e6f5f6e6f5f6e6f5f6e6f"]);
  });
});
