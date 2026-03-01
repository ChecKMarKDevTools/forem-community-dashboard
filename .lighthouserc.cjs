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
        // CI has no real Supabase URL; /api/posts returns HTTP 500, which
        // browsers log as a network error (errors-in-console). This only
        // occurs in CI -- production with valid credentials is not affected.
        "categories:best-practices": ["error", { minScore: 0.95 }],
        // robots.ts blocks Googlebot via the wildcard Disallow rule; only
        // named AI crawlers are explicitly allowed. The is-crawlable audit
        // always fails because Lighthouse tests as Googlebot. Intentional.
        "categories:seo": ["error", { minScore: 0.6 }],
        // Use bare audit IDs (no "audits:" namespace prefix -- that prefix
        // causes LHCI to look up a non-existent "audits" audit rather than
        // the intended audit, silently ignoring the assertion).
        //
        // Downgraded to warn: CI Supabase 500 errors show up as console
        // errors. Not a bug in production.
        "errors-in-console": ["warn"],
        // Downgraded to warn: Googlebot is blocked by the wildcard Disallow
        // in robots.txt. Only named AI crawlers are allowed. Intentional.
        "is-crawlable": ["warn"],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
