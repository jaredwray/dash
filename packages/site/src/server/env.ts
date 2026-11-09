/** The Dash Cloud database is not set. Sign-up and sign-in cannot work without it. */
export class CloudNotConfiguredError extends Error {
  constructor() {
    super("DASH_CLOUD_MONGODB_URI is not set.");
    this.name = "CloudNotConfiguredError";
  }
}

/**
 * Returns the MongoDB connection string for Dash Cloud accounts.
 * The path of the URI is the database name, for example `mongodb://host/dash_cloud`.
 */
export function cloudMongoUri(): string {
  const uri = process.env.DASH_CLOUD_MONGODB_URI?.trim();
  if (!uri) throw new CloudNotConfiguredError();
  return uri;
}

/** True in a production build. Session cookies then require HTTPS. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
