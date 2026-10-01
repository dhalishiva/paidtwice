"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./logo";
import { useAuth } from "./auth-provider";

const NAV = [
  { href: "/#checks", label: "What it catches" },
  { href: "/security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guides", label: "Guides" },
];

export function SiteHeader() {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="wrap flex h-16 items-center gap-6">
        <Link href="/" className="no-underline" aria-label="PaidTwice home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-[0.9375rem] md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-ink-2 no-underline hover:text-ink" aria-current={pathname === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {ready && user ? (
            <Link href="/app" className="hidden text-[0.9375rem] font-semibold no-underline sm:inline">
              Your audits
            </Link>
          ) : (
            <Link href="/login" className="hidden text-[0.9375rem] font-semibold no-underline sm:inline">
              Sign in
            </Link>
          )}
          <Link href="/scan" className="btn btn-primary btn-sm">
            Scan a file
          </Link>
          <button
            type="button"
            className="btn btn-quiet btn-sm md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-rule bg-paper md:hidden">
          <ul className="wrap grid py-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block py-3 font-semibold no-underline">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={user ? "/app" : "/login"} className="block py-3 font-semibold no-underline">
                {user ? "Your audits" : "Sign in"}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
