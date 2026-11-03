import { checkDatabase } from "./db.ts";
import { json } from "./http.ts";

function databaseState(ok: boolean): "connected" | "disconnected" {
  return ok ? "connected" : "disconnected";
}

export async function healthResponse(): Promise<Response> {
  const check = await checkDatabase();
  return json(
    {
      status: check.ok ? "ok" : "error",
      database: databaseState(check.ok),
    },
    { status: check.ok ? 200 : 503 },
  );
}

export async function pingResponse(): Promise<Response> {
  const check = await checkDatabase();
  return json(
    {
      pong: check.ok,
      database: databaseState(check.ok),
    },
    { status: check.ok ? 200 : 503 },
  );
}
