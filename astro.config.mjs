// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://nathanab.github.io',
  base: '/nba-elo',
  // Astro downloads the face at build time and serves it from the site, with metric-matched fallbacks.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Public Sans',
      cssVariable: '--font-public-sans',
      weights: [400, 500, 600, 700],
    },
  ],
});
