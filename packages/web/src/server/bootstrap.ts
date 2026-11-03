import type { AuthBootstrap } from "../lib/bootstrap.ts";
import { countUsers, findUserByEmail } from "./auth.ts";
import { getEnv } from "./env.ts";
import { DEMO_LOGIN, ensureSeeded } from "./seed.ts";
import { getSettings } from "./services/settings.ts";

export async function getAuthBootstrap(): Promise<AuthBootstrap> {
  await ensureSeeded();
  const needsSetup = countUsers() === 0;
  const { seedDemo } = getEnv();
  const demoAccount = seedDemo && findUserByEmail(DEMO_LOGIN.email) ? DEMO_LOGIN : null;
  return {
    seedDemo,
    needsSetup,
    allowRegistration: needsSetup || getSettings().allowRegistration,
    demoLogin: demoAccount ? { email: demoAccount.email, password: demoAccount.password } : null,
  };
}
