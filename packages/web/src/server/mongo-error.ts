import { MongoNetworkError, MongoServerError, MongoServerSelectionError } from "mongodb";

function scrub(message: string): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    return message;
  }
  return message.split(uri).join("[redacted]");
}

function serverError(error: unknown): MongoServerError | undefined {
  if (error instanceof MongoServerError) {
    return error;
  }
  return undefined;
}

/** Turn driver failures into an operator-facing message with no connection string. */
export function explainDatabaseError(error: unknown, databaseName: string): Error {
  if (error instanceof Error && error.message.startsWith("MongoDB user cannot write")) {
    return error;
  }
  const mongo = serverError(error);
  if (mongo && (mongo.code === 13 || mongo.codeName === "Unauthorized")) {
    return new Error(
      `MongoDB user cannot write the "${databaseName}" database. Grant the readWrite role on ${databaseName} so Dash can store accounts and dashboards. The dbAdmin role does not include inserting documents.`,
    );
  }
  if (
    mongo &&
    (mongo.code === 18 || mongo.codeName === "AuthenticationFailed")
  ) {
    return new Error(
      "MongoDB rejected this user. Dash authenticates against the admin database unless MONGODB_URI sets authSource. Atlas SCRAM users are stored in admin.",
    );
  }
  if (error instanceof MongoServerSelectionError || error instanceof MongoNetworkError) {
    return new Error(
      "Could not reach MongoDB. Check MONGODB_URI, TLS, and the cluster network access list.",
    );
  }
  if (error instanceof Error) {
    return new Error(scrub(error.message));
  }
  return new Error("Could not connect to MongoDB");
}
