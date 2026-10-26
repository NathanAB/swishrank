// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

const publicSans = { provider: fontProviders.google(), name: 'Public Sans', weights: [400, 500, 600, 700] };

// https://astro.build/config
export default defineConfig({
  site: 'https://nathanab.github.io',
  base: '/nba-elo',
  // Astro downloads the face at build time and serves it from the site, with metric-matched fallbacks.
  fonts: [
    { ...publicSans, cssVariable: '--font-public-sans' },
    // The share images' copy, as woff because Satori cannot read woff2. Google serves each format as its own
    // faces, so woff in the entry above would put eight more files in every page's preloads; no page loads this one.
    { ...publicSans, cssVariable: '--font-public-sans-share', styles: ['normal'], formats: ['woff'] },
  ],
});
