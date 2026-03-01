module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm run build && pnpm run start",
      url: ["http://localhost:3000"],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        "categories:performance": [
          "error",
          { minScore: process.env.LHCI_MOBILE ? 0.75 : 0.9 },
        ],
        "categories:accessibility": ["error", { minScore: 1.0 }],
        // CI has no real Supabase URL; /api/posts returns HTTP 500, which browsers
        // log as a network error (errors-in-console). This only occurs in CI —
        // production deployments with valid credentials are not affected.
        "categories:best-practices": ["error", { minScore: 0.95 }],
        // robots.ts intentionally disallows all crawlers — this is an internal
        // community-helper tool, not a public-facing product. The is-crawlable
        // audit correctly flags this, reducing the SEO score to ~0.63.
        "categories:seo": ["error", { minScore: 0.6 }],
        // Downgraded to warn: CI dummy Supabase URL causes /api/posts to return
        // 500; Chrome logs it as a network error. Not a bug in production.
        "audits:errors-in-console": "warn",
        // Downgraded to warn: robots.ts intentionally disallows all user agents.
        "audits:is-crawlable": "warn",
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
