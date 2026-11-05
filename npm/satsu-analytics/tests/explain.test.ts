import { describe, expect, it } from "vitest";
import { explain } from "../src/mcp/client";

describe("explain 402", () => {
  it("names Pro only for plan_required", () => {
    expect(explain(402, { error: "plan_required", upgrade_url: "https://x.test/up" })).toBe("available on Pro: https://x.test/up");
  });

  it("calls a count limit a plan limit", () => {
    expect(explain(402, { error: { code: "plan_limit_reached", message: "Your plan allows 10 monitors." } })).toBe(
      "plan limit reached; see https://satsu.pro/pricing",
    );
  });
});
