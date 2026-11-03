import type { AuthBootstrap } from "../lib/bootstrap.ts";
import { countUsers, findUserByEmail } from "./auth.ts";
import { getEnv } from "./env.ts";
import { DEMO_LOGIN, ensureSeeded } from "./seed.ts";
import { getSettings } from "./services/settings.ts";

export async function getAuthBootstrap(): Promise<AuthBootstrap> {
  await ensureSeeded();
  const needsSetup = (await countUsers()) === 0;
  const { seedDemo } = getEnv();
  const settings = await getSettings();
  const demoAccount = seedDemo && (await findUserByEmail(DEMO_LOGIN.email)) ? DEMO_LOGIN : null;
  return {
    seedDemo,
    needsSetup,
    allowRegistration: needsSetup || settings.allowRegistration,
    demoLogin: demoAccount ? { email: demoAccount.email, password: demoAccount.password } : null,
  };
}
