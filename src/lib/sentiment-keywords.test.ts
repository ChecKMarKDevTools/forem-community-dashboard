import { describe, it, expect } from "vitest";
import {
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  HELP_WORDS,
  SUPPORT_SIGNAL_PHRASES,
  countSupportPhrases,
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

describe("SUPPORT_SIGNAL_PHRASES", () => {
  it("exports SUPPORT_SIGNAL_PHRASES as a non-empty array", () => {
    expect(Array.isArray(SUPPORT_SIGNAL_PHRASES)).toBe(true);
    expect(SUPPORT_SIGNAL_PHRASES.length).toBeGreaterThan(0);
  });

  it("contains expected distress/help-seeking phrases", () => {
    expect(SUPPORT_SIGNAL_PHRASES).toContain("burnout");
    expect(SUPPORT_SIGNAL_PHRASES).toContain("mental health");
    expect(SUPPORT_SIGNAL_PHRASES).toContain("i'm struggling");
    expect(SUPPORT_SIGNAL_PHRASES).toContain("feeling isolated");
    expect(SUPPORT_SIGNAL_PHRASES).toContain("imposter syndrome");
  });

  it("contains no duplicates", () => {
    expect(new Set(SUPPORT_SIGNAL_PHRASES).size).toBe(
      SUPPORT_SIGNAL_PHRASES.length,
    );
  });

  it("all phrases are lowercase", () => {
    for (const phrase of SUPPORT_SIGNAL_PHRASES) {
      expect(phrase).toBe(phrase.toLowerCase());
    }
  });
});

describe("countSupportPhrases", () => {
  it("returns 0 for text with no matching phrases", () => {
    expect(
      countSupportPhrases("This is a great technical post about React"),
    ).toBe(0);
  });

  it("returns 1 for text with one matching phrase", () => {
    expect(countSupportPhrases("I've been dealing with burnout lately")).toBe(
      1,
    );
  });

  it("returns 3 for text with three matching phrases", () => {
    expect(
      countSupportPhrases(
        "I'm struggling with burnout and feeling overwhelmed",
      ),
    ).toBe(3);
  });

  it("is case-insensitive", () => {
    expect(countSupportPhrases("I'M STRUGGLING with BURNOUT")).toBe(2);
  });

  it("returns 0 for empty text", () => {
    expect(countSupportPhrases("")).toBe(0);
  });
});
