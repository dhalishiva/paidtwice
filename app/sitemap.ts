import type { MetadataRoute } from "next";
import { getGuides } from "@/lib/content";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number][] = [
    ["", 1],
    ["/scan", 0.9],
    ["/pricing", 0.8],
    ["/security", 0.7],
    ["/guides", 0.7],
    ["/contact", 0.5],
    ["/terms", 0.3],
    ["/privacy", 0.3],
    ["/refunds", 0.3],
  ];
  return [
    ...pages.map(([p, priority]) => ({ url: `${SITE.url}${p}`, changeFrequency: "monthly" as const, priority })),
    ...getGuides().map((g) => ({ url: `${SITE.url}/guides/${g.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
