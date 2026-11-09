import type { Metadata } from "next";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { accountPaths, contactHref, site, sitePaths } from "~/lib/site";
import LoginPage, { metadata as loginMetadata } from "./login/page";
import NotFound from "./not-found";
import OpenSourcePage, { metadata as openSourceMetadata } from "./open-source/page";
import HomePage, { metadata as homeMetadata } from "./page";
import PricingPage, { metadata as pricingMetadata } from "./pricing/page";
import RegisterPage, { metadata as registerMetadata } from "./register/page";

type PagePath = (typeof sitePaths)[number] | (typeof accountPaths)[number];

const pages: Record<PagePath, { Page: ComponentType; metadata: Metadata }> = {
  "/": { Page: HomePage, metadata: homeMetadata },
  "/pricing/": { Page: PricingPage, metadata: pricingMetadata },
  "/open-source/": { Page: OpenSourcePage, metadata: openSourceMetadata },
  "/login/": { Page: LoginPage, metadata: loginMetadata },
  "/register/": { Page: RegisterPage, metadata: registerMetadata },
};

const pagePaths: readonly string[] = [...sitePaths, ...accountPaths];

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
  ...Object.entries(pages).map(([path, { Page }]) => [path, render(Page)] as const),
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

/** Removes the query of a mailto link. A subject line does not change the address. */
function address(href: string): string {
  return href.startsWith("mailto:") ? (href.split("?")[0] ?? href) : href;
}

describe.each([...rendered.keys()])("page %s", (key) => {
  const html = rendered.get(key) ?? "";

  test("each internal link opens a page of the site, and each anchor exists there", () => {
    const internal = attributeValues(html, "href").filter((href) => /^[/#]/.test(href));
    expect(internal.length).toBeGreaterThan(0);

    for (const href of internal) {
      const [path = "", hash] = href.split("#");
      const target = path === "" ? key : path;
      expect(pagePaths, `${href} opens no page`).toContain(target);
      if (hash) {
        const ids = attributeValues(rendered.get(target) ?? "", "id");
        expect(ids, `${href} points to no element`).toContain(hash);
      }
    }
  });

  test("each external link uses an address from src/lib/site.ts", () => {
    const external = attributeValues(html, "href").filter((href) => !/^[/#]/.test(href));
    for (const href of external) {
      expect(allowedExternal, `${href} is not in src/lib/site.ts`).toContain(address(href));
    }
  });

  test("the page has exactly one h1", () => {
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });
});

test.each([...accountPaths])("search engines do not index the account page %s", (path) => {
  expect(pages[path].metadata.robots).toMatchObject({ index: false });
});

test.each([...sitePaths])("search engines can index the public page %s", (path) => {
  expect(pages[path].metadata.robots ?? {}).not.toMatchObject({ index: false });
});
