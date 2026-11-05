import { flush, state, type Props } from "./core";

/**
 * Declare event names and their props once; `track` then only accepts those.
 *
 *   declare module "satsu-analytics" {
 *     interface Events { signup: { plan: string }; newsletter: undefined }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Events {}

type Declared = keyof Events extends never ? false : true;
type Name = Declared extends true ? keyof Events & string : string;
type Args<N extends string> = Declared extends true
  ? N extends keyof Events
    ? Events[N] extends undefined | void
      ? []
      : [props: Events[N]]
    : never
  : [props?: Props];

/** Custom event. Queued until the tracker exists; no-op on the server. */
export function track<N extends Name>(name: N, ...args: Args<N>): void {
  if (typeof window === "undefined") return;
  const props = args[0] as Props | undefined;
  if (state.mode !== "live") {
    console.info("[satsu] track (not sent)", name, props);
    return;
  }
  state.queue.push([name, props]);
  flush();
  if (state.queue.length && !state.timer) {
    let tries = 0;
    state.timer = window.setInterval(() => {
      flush();
      if (!state.queue.length || ++tries > 50) {
        clearInterval(state.timer);
        state.timer = undefined;
        if (tries > 50) state.queue.length = 0;
      }
    }, 200);
  }
}
