import { describe, expect, it } from "vitest";
import { CONTAINER_PORT } from "./container-env.ts";
import { siteContainerEnv, siteStopLog, withNoIndex } from "./site-env.ts";

describe("siteContainerEnv", () => {
  it("makes Next.js listen on each interface at the container port", () => {
    const env = siteContainerEnv({});
    expect(env.HOSTNAME).toBe("0.0.0.0");
    expect(env.PORT).toBe(String(CONTAINER_PORT));
    expect(env.NODE_ENV).toBe("production");
  });

  it("forwards the Dash Cloud database URI only when the secret is set", () => {
    const uri = "mongodb+srv://user:pass@cluster.example.net/dash_cloud";
    expect(siteContainerEnv({ DASH_CLOUD_MONGODB_URI: ` ${uri} ` }).DASH_CLOUD_MONGODB_URI).toBe(
      uri,
    );
    expect(siteContainerEnv({})).not.toHaveProperty("DASH_CLOUD_MONGODB_URI");
    expect(siteContainerEnv({ DASH_CLOUD_MONGODB_URI: "  " })).not.toHaveProperty(
      "DASH_CLOUD_MONGODB_URI",
    );
  });
});

describe("withNoIndex", () => {
  it("adds the header and keeps the status, the headers, and the body", async () => {
    const response = withNoIndex(
      new Response("not here", {
        status: 404,
        headers: { "content-type": "text/plain", "set-cookie": "dash_cloud_session=abc" },
      }),
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("set-cookie")).toBe("dash_cloud_session=abc");
    expect(await response.text()).toBe("not here");
  });

  it("replaces a header value from the container", () => {
    const response = withNoIndex(new Response(null, { headers: { "x-robots-tag": "all" } }));
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("siteStopLog", () => {
  it("reports the Next.js exit after SIGTERM as a normal stop", () => {
    expect(siteStopLog({ exitCode: 143, reason: "exit" })).toEqual({
      level: "log",
      entry: { message: "container stopped", exitCode: 143, reason: "exit" },
    });
  });

  it("reports a different non-zero exit as a crash", () => {
    expect(siteStopLog({ exitCode: 1, reason: "exit" })).toEqual({
      level: "error",
      entry: { message: "container crashed", exitCode: 1, reason: "exit" },
    });
  });
});
