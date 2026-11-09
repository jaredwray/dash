import type { Metadata } from "next";
import { site } from "./site";

type PageMetadataInput = {
  title: string;
  description: string;
  /** Site path with a trailing slash, for example "/pricing/". */
  path: string;
  /** False for a page that search engines must not index. The default is true. */
  index?: boolean;
};

/**
 * Builds the metadata for one page.
 * Next does not merge nested `openGraph` objects, so each page passes the full set.
 */
export function pageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataInput): Metadata {
  const fullTitle = `${title} · ${site.name}`;
  const image = { url: "/og.png", width: 1200, height: 630, alt: `${site.name} — ${site.tagline}` };
  return {
    title,
    description,
    alternates: { canonical: path },
    ...(index ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      siteName: site.name,
      title: fullTitle,
      description,
      url: path,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [image.url],
    },
  };
}
