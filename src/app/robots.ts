import type { MetadataRoute } from "next";

/**
 * Blocks all crawlers from indexing this tool.
 * It is an internal community helper, not a public-facing product.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
