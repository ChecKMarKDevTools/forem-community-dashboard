const config = {
  extends: ["@commitlint/config-conventional"],
  plugins: ["@checkmarkdevtools/commitlint-plugin-rai"],
  rules: {
    "rai-footer-exists": [2, "always"],
    "signed-off-by": [1, "always", "Signed-off-by:"],
  },
};

export default config;
