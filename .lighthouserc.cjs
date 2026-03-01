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
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 1.0 }],
        // Use bare audit IDs (no "audits:" namespace prefix -- that prefix
        // causes LHCI to look up a non-existent "audits" audit rather than
        // the intended audit, silently ignoring the assertion).
        //
        // /api/posts returns 200+[] when Supabase env vars are absent
        // (Lighthouse CI, local dev without .env.local), so no HTTP 500 is
        // issued and no network console error is logged.
        "errors-in-console": ["error", { minScore: 1 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
