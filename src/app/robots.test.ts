import { describe, it, expect } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("blocks all user agents from all paths", () => {
    const result = robots();

    expect(result.rules).toMatchObject({
      userAgent: "*",
      disallow: "/",
    });
  });
});
