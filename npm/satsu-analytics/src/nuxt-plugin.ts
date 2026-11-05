import { install } from "./nuxt-install";

// Registered by the module under a `.client` filename, so it never runs on the server.
export default (nuxtApp: { $config: { public: Parameters<typeof install>[0] } }): void => {
  install(nuxtApp.$config.public);
};
