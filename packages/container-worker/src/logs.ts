/**
 * Structured log lines for Workers Logs. Objects passed to `console` are indexed
 * field by field, so each line carries a `message` plus the values worth filtering on.
 * Never put Worker secrets or container env values in these fields.
 */
export interface LogLine {
  level: "log" | "error";
  entry: Record<string, string | number>;
}

/** Same shape as `StopParams` from `@cloudflare/containers`, without loading `cloudflare:workers`. */
export interface ContainerStop {
  exitCode: number;
  reason: "exit" | "runtime_signal";
}

export function requestBlockedLog(reason: string): LogLine {
  return { level: "error", entry: { message: "request blocked", reason } };
}

export function containerStartLog(): LogLine {
  return { level: "log", entry: { message: "container started" } };
}

/**
 * A process that exits on its own with a non-zero code crashed. A runtime signal
 * is Cloudflare stopping the instance (sleep or a new rollout).
 */
export function containerStopLog(stop: ContainerStop): LogLine {
  const crashed = stop.reason === "exit" && stop.exitCode !== 0;
  return {
    level: crashed ? "error" : "log",
    entry: {
      message: crashed ? "container crashed" : "container stopped",
      exitCode: stop.exitCode,
      reason: stop.reason,
    },
  };
}

export function writeLog(line: LogLine): void {
  console[line.level](line.entry);
}
