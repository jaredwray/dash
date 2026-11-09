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
  adapterGuide: "https://github.com/jaredwray/dash/blob/main/docs/data-adapters.md",
  licenseUrl: "https://github.com/jaredwray/dash/blob/main/LICENSE",
  contactEmail: "hello@dash.io",
  license: "MIT",
} as const;

export const contactHref = `mailto:${site.contactEmail}`;

/** Labels for the two primary calls to action. Keep them identical on each page. */
export const cta = {
  selfHost: { label: "Self-host for free", href: site.github },
  cloud: { label: "Start on Dash Cloud", href: "/register/" },
  signIn: { label: "Sign in", href: "/login/" },
  contact: { label: "Contact us", href: contactHref },
} as const;

/** Public pages of the site. Each path ends with a slash to match `trailingSlash: true`. */
export const sitePaths = ["/", "/pricing/", "/open-source/"] as const;

/**
 * Dash Cloud account pages. Dash Cloud runs in this site, not on a separate host.
 * Search engines do not index these pages, so the sitemap does not list them.
 */
export const accountPaths = [cta.signIn.href, cta.cloud.href] as const;
