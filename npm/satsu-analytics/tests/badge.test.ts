import { describe, expect, it } from "vitest";
import { badgeUrl, badgeVerifyUrl } from "../src/badge";

describe("badge urls", () => {
  it("builds the minimal url", () => {
    expect(badgeUrl({ slug: "abc", type: "uptime" })).toBe("https://satsu.pro/badge/abc.svg?type=uptime");
  });
  it("adds options, brand only when false", () => {
    expect(badgeUrl({ slug: "abc", type: "a11y", theme: "dark", style: "flat-square", brand: false })).toBe(
      "https://satsu.pro/badge/abc.svg?type=a11y&theme=dark&style=flat-square&brand=0",
    );
    expect(badgeUrl({ slug: "abc", type: "a11y", brand: true })).not.toContain("brand");
  });
  it("honours origin and trims trailing slash", () => {
    expect(badgeUrl({ slug: "abc", type: "security", origin: "http://localhost:3000/" })).toBe(
      "http://localhost:3000/badge/abc.svg?type=security",
    );
    expect(badgeVerifyUrl({ slug: "a/b", type: "uptime", origin: "http://x.test" })).toBe(
      "http://x.test/b/a%2Fb?type=uptime",
    );
  });
});
