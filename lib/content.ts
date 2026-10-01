// Build-time content loading for guides and legal pages (server only).
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { SITE } from "./site";

export interface Guide {
  slug: string;
  title: string;
  description: string;
  html: string;
  minutes: number;
}

const ROOT = path.join(process.cwd(), "content");

function parseFrontMatter(src: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: src.slice(m[0].length) };
}

function render(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true }) as string;
  // External links open in a new tab and pass no referrer details.
  return html.replace(/<a href="(https?:\/\/[^"]+)"/g, (_m, href: string) =>
    href.startsWith(SITE.url) ? `<a href="${href}"` : `<a href="${href}" target="_blank" rel="noopener noreferrer"`,
  );
}

const ORDER = [
  "find-duplicate-payments-quickbooks-online",
  "xero-duplicate-bills",
  "sap-duplicate-invoice-check",
  "recover-duplicate-payment-from-vendor",
];

let guidesCache: Guide[] | null = null;

export function getGuides(): Guide[] {
  if (guidesCache) return guidesCache;
  const dir = path.join(ROOT, "guides");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const guides = files.map((file) => {
    const { data, body } = parseFrontMatter(fs.readFileSync(path.join(dir, file), "utf8"));
    const words = body.split(/\s+/).filter(Boolean).length;
    return {
      slug: data.slug || file.replace(/\.md$/, ""),
      title: data.title || file,
      description: data.description || "",
      html: render(body),
      minutes: Math.max(3, Math.round(words / 230)),
    };
  });
  guides.sort((a, b) => {
    const ia = ORDER.indexOf(a.slug);
    const ib = ORDER.indexOf(b.slug);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  guidesCache = guides;
  return guides;
}

export function getGuide(slug: string): Guide | undefined {
  return getGuides().find((g) => g.slug === slug);
}

export type LegalPage = "terms" | "privacy" | "refunds";

export function getLegal(page: LegalPage): string {
  const src = fs.readFileSync(path.join(ROOT, "legal", `${page}.md`), "utf8");
  const filled = src
    .replace(/\{\{COMPANY\}\}/g, SITE.company)
    .replace(/\{\{COUNTRY\}\}/g, SITE.country)
    .replace(/\{\{ADDRESS\}\}/g, SITE.address)
    .replace(/\{\{EMAIL\}\}/g, `[${SITE.email}](mailto:${SITE.email})`)
    .replace(/\{\{SITE\}\}/g, SITE.url.replace(/^https?:\/\//, ""))
    .replace(/\{\{UPDATED\}\}/g, SITE.legalUpdated);
  return render(filled);
}
