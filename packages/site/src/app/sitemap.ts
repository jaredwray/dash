import type { MetadataRoute } from "next";
import { site, sitePaths } from "~/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return sitePaths.map((path) => ({
    url: `${site.url}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
