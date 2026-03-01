module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm run build && pnpm run start",
      url: ["http://localhost:3000"],
      numberOfRuns: 1,
      settings: {
        // robots.ts intentionally blocks Googlebot (wildcard Disallow) while
        // allowing named AI crawlers. Lighthouse runs as Googlebot, so the
        // is-crawlable audit would always fail. Skip it at the runner level
        // so the SEO category can reach 100% on the remaining audits.
        skipAudits: ["is-crawlable"],
      },
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
        "categories:seo": ["error", { minScore: 1.0 }],
        // Use bare audit IDs (no "audits:" namespace prefix -- that prefix
        // causes LHCI to look up a non-existent "audits" audit rather than
        // the intended audit, silently ignoring the assertion).
        //
        // Downgraded to warn: CI Supabase 500 errors show up as console
        // errors. Not a bug in production.
        "errors-in-console": ["warn"],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
