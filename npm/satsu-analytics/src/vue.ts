import { defineComponent, onMounted } from "vue";
import { start, viteSite } from "./dom";

/** Vue 3: renders nothing; the tracker is injected once after mount. */
export const Satsu = defineComponent({
  name: "Satsu",
  props: {
    /** Site ID; falls back to VITE_SATSU_SITE. */
    site: { type: String, default: undefined },
    /** Log instead of loading the tracker. */
    debug: { type: Boolean, default: false },
  },
  setup(props) {
    onMounted(() => start(props.site || viteSite(), props.debug));
    return () => null;
  },
});
