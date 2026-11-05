import { expectTypeOf, test } from "vitest";
import { track } from "../src/index";

declare module "../src/index" {
  interface Events {
    signup: { plan: string };
    newsletter: undefined;
  }
}

test("declared events narrow names and props", () => {
  track("signup", { plan: "pro" });
  track("newsletter");
  // @ts-expect-error unknown name
  track("nope");
  // @ts-expect-error wrong prop shape
  track("signup", { plan: 1 });
  // @ts-expect-error props required
  track("signup");
  expectTypeOf(track).returns.toBeVoid();
});
