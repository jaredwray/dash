/**
 * Site-wide constants. Import these in components. Do not hard-code URLs.
 */
export const site = {
  name: "Dash",
  tagline: "Open source, AI-first analytics",
  description:
    "Dash is an open source, AI-first analytics workspace. Build dashboards from the UI or from an agent over MCP. Self-host it for free, or run it on Dash Cloud.",
  url: "https://dash.io",
  github: "https://github.com/jaredwray/dash",
  githubIssues: "https://github.com/jaredwray/dash/issues",
  contributing: "https://github.com/jaredwray/dash/blob/main/CONTRIBUTING.md",
  licenseUrl: "https://github.com/jaredwray/dash/blob/main/LICENSE",
  cloudSignUp: "https://app.dash.io/register",
  cloudSignIn: "https://app.dash.io/login",
  contactEmail: "hello@dash.io",
  license: "MIT",
} as const;

export const contactHref = `mailto:${site.contactEmail}`;

/** Labels for the two primary calls to action. Keep them identical on each page. */
export const cta = {
  selfHost: { label: "Self-host for free", href: site.github },
  cloud: { label: "Start on Dash Cloud", href: site.cloudSignUp },
  signIn: { label: "Sign in", href: site.cloudSignIn },
  contact: { label: "Contact us", href: contactHref },
} as const;

/** Pages of the site. Each path ends with a slash to match `trailingSlash: true`. */
export const sitePaths = ["/", "/pricing/", "/open-source/"] as const;
