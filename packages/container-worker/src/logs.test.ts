import { afterEach, describe, expect, it, vi } from "vitest";
import {
  containerStartLog,
  containerStopLog,
  requestBlockedLog,
  writeLog,
} from "./logs.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestBlockedLog", () => {
  it("logs the reason as an error", () => {
    expect(requestBlockedLog("MONGODB_URI is not configured")).toEqual({
      level: "error",
      entry: { message: "request blocked", reason: "MONGODB_URI is not configured" },
    });
  });
});

describe("containerStartLog", () => {
  it("logs the start at info level", () => {
    expect(containerStartLog()).toEqual({ level: "log", entry: { message: "container started" } });
  });
});

describe("containerStopLog", () => {
  it("reports a non-zero exit as a crash", () => {
    expect(containerStopLog({ exitCode: 1, reason: "exit" })).toEqual({
      level: "error",
      entry: { message: "container crashed", exitCode: 1, reason: "exit" },
    });
  });

  it("reports a clean exit or a runtime signal as a stop", () => {
    expect(containerStopLog({ exitCode: 0, reason: "exit" })).toEqual({
      level: "log",
      entry: { message: "container stopped", exitCode: 0, reason: "exit" },
    });
    expect(containerStopLog({ exitCode: 137, reason: "runtime_signal" })).toEqual({
      level: "log",
      entry: { message: "container stopped", exitCode: 137, reason: "runtime_signal" },
    });
  });
});

describe("writeLog", () => {
  it("passes the entry object to the matching console method", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    writeLog(containerStartLog());
    writeLog(requestBlockedLog("DASH_SECRET is not configured"));

    expect(log).toHaveBeenCalledWith({ message: "container started" });
    expect(error).toHaveBeenCalledWith({
      message: "request blocked",
      reason: "DASH_SECRET is not configured",
    });
  });
});
