import { describe, it, expect } from "vitest";
import {
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  HELP_WORDS,
} from "./sentiment-keywords";

describe("sentiment-keywords", () => {
  it("exports POSITIVE_WORDS as a non-empty Set", () => {
    expect(POSITIVE_WORDS).toBeInstanceOf(Set);
    expect(POSITIVE_WORDS.size).toBeGreaterThan(0);
  });

  it("exports NEGATIVE_WORDS as a non-empty Set", () => {
    expect(NEGATIVE_WORDS).toBeInstanceOf(Set);
    expect(NEGATIVE_WORDS.size).toBeGreaterThan(0);
  });

  it("has no overlap between positive and negative keywords", () => {
    for (const word of POSITIVE_WORDS) {
      expect(NEGATIVE_WORDS.has(word)).toBe(false);
    }
  });

  it("contains expected positive keywords", () => {
    expect(POSITIVE_WORDS.has("awesome")).toBe(true);
    expect(POSITIVE_WORDS.has("helpful")).toBe(true);
  });

  it("contains expected negative keywords", () => {
    expect(NEGATIVE_WORDS.has("terrible")).toBe(true);
    expect(NEGATIVE_WORDS.has("bug")).toBe(true);
  });
});

describe("HELP_WORDS", () => {
  it("exports HELP_WORDS as a non-empty array", () => {
    expect(Array.isArray(HELP_WORDS)).toBe(true);
    expect(HELP_WORDS.length).toBeGreaterThan(0);
  });

  it("contains expected help-seeking phrases", () => {
    expect(HELP_WORDS).toContain("need help");
    expect(HELP_WORDS).toContain("stuck");
    expect(HELP_WORDS).toContain("beginner question");
  });

  it("contains no duplicates", () => {
    expect(new Set(HELP_WORDS).size).toBe(HELP_WORDS.length);
  });

  it("has no overlap with POSITIVE_WORDS", () => {
    for (const phrase of HELP_WORDS) {
      expect(POSITIVE_WORDS.has(phrase)).toBe(false);
    }
  });
});
