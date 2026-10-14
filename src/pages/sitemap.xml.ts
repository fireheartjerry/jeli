// The two pages worth indexing. Lab and social-card pages are left out.
import type { APIRoute } from "astro";
import { paper } from "../data/paper";

export const GET: APIRoute = ({ site }) => {
  const urls = ["/", paper.href].map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml" },
  });
};
