import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SatsuBadge } from "../src/react";

describe("SatsuBadge", () => {
  it("renders a linked lazy image with fixed size", () => {
    const html = renderToStaticMarkup(<SatsuBadge slug="abc" type="uptime" theme="dark" className="x" />);
    expect(html).toContain('href="https://satsu.pro/b/abc?type=uptime"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('width="232"');
    expect(html).toContain('height="22"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("theme=dark");
  });
});
