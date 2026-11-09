import { readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { expect, test } from "vitest";
import { accountPaths, site } from "~/lib/site";
import sitemap from "./sitemap";

/** Returns the route of each `page.tsx` below `src/app`, with a trailing slash. */
function pageRoutes(): string[] {
  const appDir = import.meta.dirname;
  return readdirSync(appDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file === "page.tsx" || file.endsWith(`${sep}page.tsx`))
    .map((file) => {
      const dir = dirname(file);
      return dir === "." ? "/" : `/${join(dir).split(sep).join("/")}/`;
    })
    .sort();
}

test("each account path has a page", () => {
  expect(pageRoutes()).toEqual(expect.arrayContaining([...accountPaths]));
});

test("the sitemap lists each public page once, with an absolute URL and a trailing slash", () => {
  const accounts: readonly string[] = accountPaths;
  const urls = sitemap().map((entry) => entry.url);
  const expected = pageRoutes()
    .filter((route) => !accounts.includes(route))
    .map((route) => `${site.url}${route}`);

  expect(expected.length).toBeGreaterThan(1);
  expect([...urls].sort()).toEqual(expected);
});
