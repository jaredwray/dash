import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { contactHref, site, sitePaths } from "~/lib/site";
import NotFound from "./not-found";
import OpenSourcePage from "./open-source/page";
import HomePage from "./page";
import PricingPage from "./pricing/page";

type SitePath = (typeof sitePaths)[number];

const pages: Record<SitePath, ComponentType> = {
  "/": HomePage,
  "/pricing/": PricingPage,
  "/open-source/": OpenSourcePage,
};

/** Renders a page inside the shared header and footer, as the root layout does. */
function render(Page: ComponentType): string {
  return renderToStaticMarkup(
    <>
      <SiteHeader />
      <main id="main">
        <Page />
      </main>
      <SiteFooter />
    </>,
  );
}

const rendered = new Map<string, string>([
  ...sitePaths.map((path) => [path, render(pages[path])] as const),
  ["404", render(NotFound)],
]);

function attributeValues(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );
}

// An address that changes before launch must change in `src/lib/site.ts` only.
const allowedExternal = new Set<string>([
  ...Object.values(site).filter((value) => /^https?:\/\//.test(value)),
  contactHref,
]);

describe.each([...rendered.keys()])("page %s", (key) => {
  const html = rendered.get(key) ?? "";

  test("each internal link opens a page of the site, and each anchor exists there", () => {
    const internal = attributeValues(html, "href").filter((href) => /^[/#]/.test(href));
    expect(internal.length).toBeGreaterThan(0);

    for (const href of internal) {
      const [path = "", hash] = href.split("#");
      const target = path === "" ? key : path;
      expect(sitePaths, `${href} opens no page`).toContain(target);
      if (hash) {
        const ids = attributeValues(rendered.get(target) ?? "", "id");
        expect(ids, `${href} points to no element`).toContain(hash);
      }
    }
  });

  test("each external link uses an address from src/lib/site.ts", () => {
    const external = attributeValues(html, "href").filter((href) => !/^[/#]/.test(href));
    for (const href of external) {
      expect(allowedExternal, `${href} is not in src/lib/site.ts`).toContain(href);
    }
  });

  test("the page has exactly one h1", () => {
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });
});
