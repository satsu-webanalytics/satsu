export default defineNuxtConfig({
  app: {
    head: {
      script: [
        { src: "https://track.satsu.pro/tracker.js", defer: true, "data-site": "YOUR_ID" },
      ],
    },
  },
});
