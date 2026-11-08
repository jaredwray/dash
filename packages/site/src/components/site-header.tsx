import Link from "next/link";
import { navLinks } from "~/content/nav";
import { cta, site } from "~/lib/site";
import { ButtonLink } from "./button-link";
import { GitHubIcon } from "./icons";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";

/** The sticky site header with the logo, the main nav, and the primary calls to action. */
export function SiteHeader() {
  const textLinks = navLinks.filter((link) => !link.external);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/70">
      <div className="container-x relative flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label={`${site.name} home`} className="rounded-md">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {textLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-full px-3.5 py-2 text-sm font-medium text-mist-2 transition-colors hover:bg-white/[0.06] hover:text-paper"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={site.github}
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-mist-2 transition-colors hover:bg-white/[0.06] hover:text-paper"
              >
                <GitHubIcon className="size-4" />
                GitHub
              </a>
            </li>
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href={cta.signIn.href} variant="ghost" size="sm">
            {cta.signIn.label}
          </ButtonLink>
          <ButtonLink href={cta.cloud.href} size="sm">
            {cta.cloud.label}
          </ButtonLink>
        </div>

        <MobileMenu links={navLinks} />
      </div>
    </header>
  );
}
