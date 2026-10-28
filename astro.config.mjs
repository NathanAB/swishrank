// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

const publicSans = { provider: fontProviders.google(), name: 'Public Sans', weights: [400, 500, 600, 700] };

// The pages that only redirect an old URL to its new page, in every season that had them: graph.astro,
// fixtures.astro, results/ and teams/index.astro under src/pages/[...season]/.
const MOVED = /\/(graph|fixtures|results(\/[^/]+)?|teams)\/$/;

// https://astro.build/config
export default defineConfig({
  site: 'https://swishrank.com',
  // Stylesheets as files the pages share and the browser caches, rather than a copy inside each of some fifteen
  // thousand pages (https://docs.astro.build/en/reference/configuration-reference/#buildinlinestylesheets).
  build: { inlineStylesheets: 'never' },
  // Astro downloads the face at build time and serves it from the site, with metric-matched fallbacks.
  fonts: [
    { ...publicSans, cssVariable: '--font-public-sans' },
    // The share images' copy, as woff because Satori cannot read woff2. Google serves each format as its own
    // faces, so woff in the entry above would put eight more files in every page's preloads; no page loads this one.
    { ...publicSans, cssVariable: '--font-public-sans-share', styles: ['normal'], formats: ['woff'] },
  ],
  // The integration already leaves out the 404 page.
  integrations: [sitemap({ filter: (page) => !MOVED.test(new URL(page).pathname) })],
});
