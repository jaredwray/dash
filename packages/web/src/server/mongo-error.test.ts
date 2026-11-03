import { MongoServerError } from "mongodb";
import { describe, expect, it } from "vitest";
import { explainDatabaseError } from "./mongo-error.ts";

describe("explainDatabaseError", () => {
  it("names the readWrite role when the user cannot insert", () => {
    const error = new MongoServerError({
      message: "not authorized on dash to execute command { insert: \"users\" }",
      code: 13,
      codeName: "Unauthorized",
    });
    expect(explainDatabaseError(error, "dash").message).toMatch(/readWrite role on dash/);
    expect(explainDatabaseError(error, "dash").message).toMatch(/dbAdmin/);
  });

  it("points authentication failures at the admin database", () => {
    const error = new MongoServerError({
      message: "Authentication failed.",
      code: 18,
      codeName: "AuthenticationFailed",
    });
    const message = explainDatabaseError(error, "dash").message;
    expect(message).toMatch(/admin database/);
    expect(message).not.toContain("mongodb://");
  });

  it("removes the connection string from other failures", () => {
    process.env.MONGODB_URI = "mongodb://dash:s3cret@127.0.0.1:27017/dash";
    const error = new Error("failed mongodb://dash:s3cret@127.0.0.1:27017/dash");
    expect(explainDatabaseError(error, "dash").message).not.toContain("s3cret");
    delete process.env.MONGODB_URI;
  });
});
