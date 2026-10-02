import type { LegalPage } from "@/lib/content";
import { getLegal } from "@/lib/content";

/** A legal page rendered from content/legal/*.md with the operator's details filled in. */
export function LegalDoc({ page, title, intro }: { page: LegalPage; title: string; intro?: string }) {
  const html = getLegal(page);
  return (
    <article className="wrap py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h1 className="h2">{title}</h1>
        {intro && <p className="lede mt-4">{intro}</p>}
        <div className="prose mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </article>
  );
}
