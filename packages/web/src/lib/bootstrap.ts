export interface DemoLogin {
  email: string;
  password: string;
}

export interface AuthBootstrap {
  seedDemo: boolean;
  needsSetup: boolean;
  allowRegistration: boolean;
  allowedEmailDomains: string[];
  demoLogin: DemoLogin | null;
}
