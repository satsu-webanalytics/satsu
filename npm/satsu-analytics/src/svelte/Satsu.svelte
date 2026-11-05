<script lang="ts">
  import { onMount } from "svelte";
  import { start } from "satsu-analytics/dom";

  /** Site ID; falls back to PUBLIC_SATSU_SITE. */
  export let site: string | undefined = undefined;
  /** Log instead of loading the tracker. */
  export let debug = false;

  onMount(() => start(site || import.meta.env.PUBLIC_SATSU_SITE, debug));
</script>
