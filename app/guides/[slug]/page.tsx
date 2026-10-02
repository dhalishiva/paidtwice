import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuide, getGuides } from "@/lib/content";
import { SITE } from "@/lib/site";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return {};
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: "article", title: g.title, description: g.description, url: `${SITE.url}/guides/${g.slug}` },
  };
}

export default async function GuidePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();
  const others = getGuides().filter((x) => x.slug !== g.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    mainEntityOfPage: `${SITE.url}/guides/${g.slug}`,
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
  };

  return (
    <article className="wrap py-14 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold">
          <Link href="/guides" className="text-green-ink no-underline hover:underline">
            Guides
          </Link>
          <span className="text-ink-3"> · {g.minutes} minute read</span>
        </p>
        <h1 className="h2 mt-3">{g.title}</h1>
        <p className="lede mt-4">{g.description}</p>
        <div className="prose mt-10" dangerouslySetInnerHTML={{ __html: g.html }} />

        <aside className="mt-14 border-y-2 border-ink py-8">
          <p className="text-xl font-bold">Check your own export in a few minutes.</p>
          <p className="mt-2 max-w-[40em] text-ink-2">
            PaidTwice runs these checks on your file in your browser. The file is never uploaded, and the free scan shows the total at stake.
          </p>
          <Link href="/scan" className="btn btn-primary mt-5">
            Scan a file
          </Link>
        </aside>

        {others.length > 0 && (
          <nav aria-labelledby="more-guides" className="mt-14">
            <h2 id="more-guides" className="h3">
              More guides
            </h2>
            <ul className="mt-4 grid gap-3">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/guides/${o.slug}`} className="link font-semibold">
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </article>
  );
}
