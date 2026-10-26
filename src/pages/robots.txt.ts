// robots.txt, naming the sitemap @astrojs/sitemap writes, as that integration's guide builds it
// (https://docs.astro.build/en/guides/integrations-guide/sitemap/): from the config's site, here with the base
// in front, since the sitemap sits under it too.
import type { APIRoute } from "astro";
import { withBase } from "../lib/routes.ts";

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("astro.config.mjs has no site to make the sitemap's URL absolute");
  const sitemap = new URL(withBase("/sitemap-index.xml"), site);
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`);
};
