// @vitest-environment node
import { expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { track } from "../src/index";
import { Satsu } from "../src/react";

it("track is a server no-op", () => {
  expect(() => track("newsletter")).not.toThrow();
});

it("renders nothing on the server, with or without a site", () => {
  expect(renderToString(createElement(Satsu, { site: "s" }))).toBe("");
  expect(renderToString(createElement(Satsu))).toBe("");
});
