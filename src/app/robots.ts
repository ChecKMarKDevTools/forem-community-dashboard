import type { MetadataRoute } from "next";

/**
 * Allows AI crawlers to index this tool for discovery purposes while
 * blocking general web crawlers. This is an internal community helper
 * but should be discoverable by AI assistants.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Allow well-known AI crawlers
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "anthropic-ai", allow: "/" },
      { userAgent: "Claude-Web", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
      { userAgent: "Cohere-ai", allow: "/" },
      { userAgent: "YouBot", allow: "/" },
      // Block all other crawlers
      { userAgent: "*", disallow: "/" },
    ],
    host: "https://dev-signal.checkmarkdevtools.dev",
  };
}
