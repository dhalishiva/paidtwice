import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap py-24">
      <div className="max-w-xl">
        <p className="num text-sm font-bold text-pencil-dark">404</p>
        <h1 className="h2 mt-2">This page is not in the ledger.</h1>
        <p className="lede mt-4">The address may be mistyped, or the page has moved.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary">
            Go to the home page
          </Link>
          <Link href="/scan" className="btn btn-quiet">
            Scan a file
          </Link>
        </div>
      </div>
    </section>
  );
}
