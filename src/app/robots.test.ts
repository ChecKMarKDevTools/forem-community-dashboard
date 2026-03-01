import { describe, it, expect } from "vitest";
import robots from "./robots";

const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "anthropic-ai",
  "Claude-Web",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Cohere-ai",
  "YouBot",
];

describe("robots", () => {
  it("returns an array of rules", () => {
    const result = robots();
    expect(Array.isArray(result.rules)).toBe(true);
  });

  it("sets the canonical host", () => {
    const result = robots();
    expect(result.host).toBe("https://dev-signal.checkmarkdevtools.dev");
  });

  it("blocks all general crawlers via wildcard rule", () => {
    const result = robots();
    const rules = result.rules as Array<{
      userAgent: string;
      disallow?: string;
    }>;
    const wildcardRule = rules.find((r) => r.userAgent === "*");
    expect(wildcardRule).toBeDefined();
    expect(wildcardRule?.disallow).toBe("/");
  });

  it.each(AI_CRAWLERS)("allows AI crawler %s to access all paths", (agent) => {
    const result = robots();
    const rules = result.rules as Array<{
      userAgent: string;
      allow?: string;
    }>;
    const rule = rules.find((r) => r.userAgent === agent);
    expect(rule).toBeDefined();
    expect(rule?.allow).toBe("/");
  });

  it("covers all expected AI crawlers", () => {
    const result = robots();
    const rules = result.rules as Array<{ userAgent: string }>;
    const definedAgents = rules
      .map((r) => r.userAgent)
      .filter((a) => a !== "*");
    expect(definedAgents).toEqual(AI_CRAWLERS);
  });
});
