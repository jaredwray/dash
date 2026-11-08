import { contactHref, site } from "~/lib/site";

export type NavLink = {
  label: string;
  href: string;
  /** True when the link leaves the site. */
  external?: boolean;
};

/** Links in the site header. Internal links end with a slash. */
export const navLinks: readonly NavLink[] = [
  { label: "Product", href: "/#product" },
  { label: "Open source", href: "/open-source/" },
  { label: "Pricing", href: "/pricing/" },
  { label: "GitHub", href: site.github, external: true },
];

export type FooterGroup = {
  title: string;
  links: readonly NavLink[];
};

/** Link groups in the site footer. */
export const footerGroups: readonly FooterGroup[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#product" },
      { label: "MCP server", href: "/#mcp" },
      { label: "Data sources", href: "/#data-sources" },
      { label: "Pricing", href: "/pricing/" },
    ],
  },
  {
    title: "Open source",
    links: [
      { label: "Why open source", href: "/open-source/" },
      { label: "Quick start", href: "/open-source/#quick-start" },
      { label: "Architecture", href: "/open-source/#architecture" },
      { label: "MIT license", href: site.licenseUrl, external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: site.github, external: true },
      { label: "Issues", href: site.githubIssues, external: true },
      { label: "Contributing", href: site.contributing, external: true },
    ],
  },
  {
    title: "Dash Cloud",
    links: [
      { label: "Sign in", href: site.cloudSignIn, external: true },
      { label: "Create an account", href: site.cloudSignUp, external: true },
      { label: "Contact", href: contactHref, external: true },
    ],
  },
];
