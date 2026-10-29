import { describe, expect, it } from "vitest";
import { parseBigQueryUri } from "./bigquery-uri.ts";

describe("parseBigQueryUri", () => {
  it("reads project, dataset, location, and endpoint", () => {
    expect(
      parseBigQueryUri(
        "  bigquery://dash/analytics?location=US&endpoint=http://127.0.0.1:9059  ",
      ),
    ).toEqual({
      projectId: "dash",
      dataset: "analytics",
      location: "US",
      apiEndpoint: "http://127.0.0.1:9059",
    });
  });

  it("allows a project with no dataset", () => {
    expect(parseBigQueryUri("bigquery://my-project")).toEqual({
      projectId: "my-project",
      dataset: undefined,
      location: undefined,
      apiEndpoint: undefined,
    });
  });

  it("accepts apiEndpoint as an alias", () => {
    expect(parseBigQueryUri("bigquery://dash?apiEndpoint=https://bigquery.googleapis.com").apiEndpoint).toBe(
      "https://bigquery.googleapis.com",
    );
  });

  it("rejects other schemes, secrets, and unknown parameters", () => {
    expect(() => parseBigQueryUri("postgres://localhost/analytics")).toThrow(/bigquery:\/\//);
    expect(() => parseBigQueryUri("bigquery://user:secret@dash/analytics")).toThrow(/service account/i);
    expect(() => parseBigQueryUri("bigquery://dash/analytics?keyfile=/tmp/sa.json")).toThrow(
      /unsupported/i,
    );
    expect(() => parseBigQueryUri("bigquery://dash/analytics/orders")).toThrow(/one dataset/);
    expect(() => parseBigQueryUri("bigquery:///analytics")).toThrow(/project id/i);
  });
});
