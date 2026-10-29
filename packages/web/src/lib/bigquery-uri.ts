import { QueryValidationError, assertIdentifier } from "@dash/core";

const PROJECT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const LOCATION = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const KNOWN_PARAMS = new Set(["location", "endpoint", "apiEndpoint"]);

export interface ParsedBigQueryUri {
  projectId: string;
  dataset?: string;
  location?: string;
  apiEndpoint?: string;
}

export function parseBigQueryUri(value: string): ParsedBigQueryUri {
  const raw = value.trim();
  if (!raw) {
    throw new QueryValidationError("BigQuery connection URI is required");
  }
  if (raw.length > 2048) {
    throw new QueryValidationError("BigQuery connection URI is too long");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new QueryValidationError("Invalid BigQuery connection URI");
  }
  if (url.protocol !== "bigquery:") {
    throw new QueryValidationError("BigQuery connection URI must use the bigquery:// scheme");
  }
  if (url.username || url.password) {
    throw new QueryValidationError(
      "BigQuery connection URIs do not include a username or password. Paste the service account JSON separately.",
    );
  }
  const projectId = url.hostname;
  if (!PROJECT_ID.test(projectId)) {
    throw new QueryValidationError(`Invalid BigQuery project id: ${projectId || "(missing)"}`);
  }
  const segments = url.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  if (segments.length > 1) {
    throw new QueryValidationError("BigQuery connection URI can include one dataset");
  }
  const dataset = segments[0]
    ? assertIdentifier(decodeURIComponent(segments[0]), "dataset")
    : undefined;
  for (const key of url.searchParams.keys()) {
    if (!KNOWN_PARAMS.has(key)) {
      throw new QueryValidationError(`Unsupported BigQuery connection URI parameter: ${key}`);
    }
  }
  if (url.searchParams.has("endpoint") && url.searchParams.has("apiEndpoint")) {
    throw new QueryValidationError("BigQuery connection URI has both endpoint and apiEndpoint");
  }
  const locationParam = url.searchParams.get("location")?.trim();
  let location: string | undefined;
  if (locationParam) {
    if (!LOCATION.test(locationParam)) {
      throw new QueryValidationError(`Invalid BigQuery location: ${locationParam}`);
    }
    location = locationParam;
  }
  const endpointParam = (
    url.searchParams.get("endpoint") ?? url.searchParams.get("apiEndpoint")
  )?.trim();
  return {
    projectId,
    dataset,
    location,
    apiEndpoint: endpointParam || undefined,
  };
}
