import Link from "next/link";
import { footerGroups } from "~/content/nav";
import { site } from "~/lib/site";
import { GitHubIcon } from "./icons";
import { Logo } from "./logo";

/** The site footer with link groups, the license, and the GitHub link. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-line bg-ink">
      <div className="container-x py-14 sm:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          <div className="col-span-2 max-w-xs lg:col-span-1">
            <Logo />
            <p className="mt-4 text-sm leading-6 text-mist">{site.tagline}.</p>
            <p className="mt-1 text-sm leading-6 text-mist">
              Self-host it for free, or run it on Dash Cloud.
            </p>
            <a
              href={site.github}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3.5 py-2 text-sm font-medium text-paper ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.09]"
            >
              <GitHubIcon className="size-4" />
              jaredwray/dash
            </a>
          </div>

          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-sm font-semibold text-paper">{group.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-sm text-mist transition-colors hover:text-paper"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-mist transition-colors hover:text-paper"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-6 text-sm text-mist sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}. Released under the{" "}
            <a href={site.licenseUrl} className="text-mist-2 underline-offset-4 hover:underline">
              {site.license} license
            </a>
            .
          </p>
          <p>
            <a href={`mailto:${site.contactEmail}`} className="hover:text-paper">
              {site.contactEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
