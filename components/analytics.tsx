"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import {
  GA_ID,
  analyticsLoaded,
  clearGoogleAnalyticsCookies,
  cleanUrl,
  installNavigationGuard,
  loadGoogleAnalytics,
  mayLoadGoogleAnalytics,
  mustReloadFor,
  readConsent,
  stopGoogleAnalytics,
  writeConsent,
  type Consent,
} from "@/lib/analytics";
import { purgeStaleHandoffs } from "@/lib/handoff";
import { isPrivatePath } from "@/lib/private-routes";

const OPEN_EVENT = "paidtwice:cookie-settings";

/** Vercel Web Analytics and Speed Insights: first-party and cookieless, addresses cleaned. */
export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={(event) => ({ ...event, url: cleanUrl(event.url) })} />
      <SpeedInsights beforeSend={(event) => ({ ...event, url: cleanUrl(event.url) })} />
    </>
  );
}

/**
 * Google Analytics with an opt-in banner. Renders nothing unless NEXT_PUBLIC_GA_MEASUREMENT_ID is
 * set. Never loads on private pages (see lib/analytics.ts for the rules).
 */
export function GoogleAnalytics() {
  const pathname = usePathname() ?? "/";
  // undefined until the stored choice has been read after hydration.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    // Even with Google Analytics switched off again, a file handed over earlier must not linger.
    // Runs once the browser is idle so it never competes with the first paint or first tap.
    const purge = () => void purgeStaleHandoffs(Boolean(GA_ID));
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(purge, { timeout: 4000 });
    else window.setTimeout(purge, 2000);
    if (!GA_ID) return;
    const stored = readConsent();
    setConsent(stored);
    installNavigationGuard();
    // Leftovers from an earlier, withdrawn consent.
    if (stored !== "granted") clearGoogleAnalyticsCookies();
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (!GA_ID) return;
    // Safety net behind the link guard: a private page must only ever show in a document that
    // was loaded as a private page, with the strict policy and without Google's script.
    if (mustReloadFor(pathname)) {
      window.location.reload();
      return;
    }
    if (consent !== undefined && mayLoadGoogleAnalytics(pathname, consent)) loadGoogleAnalytics();
  }, [pathname, consent]);

  if (!GA_ID || consent === undefined || isPrivatePath(pathname)) return null;
  if (consent !== null && !reopened) return null;

  const decide = (choice: Consent) => {
    writeConsent(choice);
    setReopened(false);
    setConsent(choice);
    if (choice === "denied") {
      // Stop Google's script before removing its cookies so it cannot write them again, then
      // reload: a script cannot be unloaded, and the fresh page leaves it out.
      stopGoogleAnalytics();
      clearGoogleAnalyticsCookies();
      if (analyticsLoaded()) window.location.reload();
    }
  };

  return (
    <div role="region" aria-label="Cookie choice" className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-5">
      <div className="sheet mx-auto flex max-w-3xl flex-col gap-4 p-4 shadow-[0_8px_30px_rgba(20,33,61,0.16)] sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <p className="text-[0.9375rem] text-ink-2">
          <strong className="text-ink">May we use analytics cookies?</strong> Google Analytics would show us which pages help people. It
          never runs on the scan page, your saved audits or your account pages, and never sees your files.{" "}
          <Link href="/privacy#cookies-and-analytics" className="link text-ink">
            Privacy policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide("denied")}>
            No thanks
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide("granted")}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

/** Footer link that reopens the cookie choice. Shown only when Google Analytics is configured. */
export function CookieSettingsLink({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  if (!GA_ID || isPrivatePath(pathname)) return null;
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}
