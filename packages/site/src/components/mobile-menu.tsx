"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { NavLink } from "~/content/nav";
import { cta } from "~/lib/site";

type MobileMenuProps = {
  links: readonly NavLink[];
};

/** The header menu for narrow screens. It opens below the header bar. */
export function MobileMenu({ links }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Close the menu on Escape.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-10 items-center justify-center rounded-full text-paper ring-1 ring-inset ring-white/10 hover:bg-white/[0.06]"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-ink px-5 pt-2 pb-6 shadow-2xl"
      >
        <nav aria-label="Mobile">
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                {link.external ? (
                  <a
                    href={link.href}
                    className="block rounded-lg px-3 py-3 text-base font-medium text-paper hover:bg-white/[0.06]"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-3 text-base font-medium text-paper hover:bg-white/[0.06]"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-4">
          <a
            href={cta.signIn.href}
            className="inline-flex h-11 items-center justify-center rounded-full text-base font-medium text-paper ring-1 ring-inset ring-white/15"
          >
            {cta.signIn.label}
          </a>
          <a
            href={cta.cloud.href}
            className="inline-flex h-11 items-center justify-center rounded-full bg-accent text-base font-medium text-ink"
          >
            {cta.cloud.label}
          </a>
        </div>
      </div>
    </div>
  );
}
