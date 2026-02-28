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
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
