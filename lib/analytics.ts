// Analytics rules shared by the layout components, the drop zone and the checkout.
//
// - Vercel Web Analytics and Speed Insights are first-party and cookieless. They run on production
//   deployments and only ever see the page path, with record ids masked and query strings removed
//   except utm_ campaign tags.
// - Google Analytics 4 runs only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set, only after the visitor
//   allows analytics cookies, and only on public pages.
//
// When Google Analytics is configured, public pages are served with a Content Security Policy that
// allows Google's analytics hosts, and private pages (lib/private-routes.ts) with the strict one.
// A browser keeps the policy of the page it first loaded for as long as it stays on that document,
// so a document that started on a public page must never show a private page: links into private
// pages become full page loads, a file picked on such a page is handed to a fresh scan page
// (lib/handoff.ts), and anything that slips through is caught by a reload.

import { isPrivatePath } from "./private-routes";
import { isGoogleAnalyticsId } from "./security-headers";

const RAW_GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

/** Google Analytics 4 measurement ID (G-XXXXXXXXXX), or "" when Google Analytics is off. */
export const GA_ID = isGoogleAnalyticsId(RAW_GA_ID) ? RAW_GA_ID : "";

// ---------------------------------------------------------------------------------------------
// Address clean-up for Vercel Web Analytics and Speed Insights

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Keeps only what analytics needs from a page address: the path, with record ids replaced by
 * "[id]", plus utm_ campaign tags. Other query parameters (sign-in redirects, payment references,
 * hand-over keys) and the fragment (password-reset links carry tokens there) are dropped.
 */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const keep = new URLSearchParams();
    u.searchParams.forEach((value, key) => {
      if (/^utm_[a-z_]{1,20}$/.test(key)) keep.append(key, value.slice(0, 100));
    });
    const query = keep.toString();
    return `${u.origin}${u.pathname.replace(UUID, "[id]")}${query ? `?${query}` : ""}`;
  } catch {
    return raw.split(/[?#]/)[0].replace(UUID, "[id]");
  }
}

// ---------------------------------------------------------------------------------------------
// Consent, remembered in this browser for a year

export type Consent = "granted" | "denied";
export const CONSENT_KEY = "paidtwice-analytics-consent";
const CONSENT_DAYS = 365;

export function readConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { choice?: string; at?: number };
    if ((v.choice !== "granted" && v.choice !== "denied") || typeof v.at !== "number") return null;
    if (Date.now() - v.at > CONSENT_DAYS * 86_400_000) return null;
    return v.choice;
  } catch {
    return null;
  }
}

export function writeConsent(choice: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: Date.now() }));
  } catch {
    /* private mode or storage blocked: the banner simply shows again next time */
  }
}

// ---------------------------------------------------------------------------------------------
// This document

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let gaLoaded = false;
let guardInstalled = false;
let firstPath: string | null = null;

/** The path this document was first loaded at, which decided its Content Security Policy. */
function documentPath(): string {
  if (firstPath === null) {
    let url = window.location.href;
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav?.name) url = nav.name;
    } catch {
      /* older browsers: the current address is the first one while this module first runs */
    }
    try {
      firstPath = new URL(url).pathname;
    } catch {
      firstPath = window.location.pathname;
    }
  }
  return firstPath;
}

/**
 * True when Google Analytics is configured and this document started on a public page, so its
 * policy allows Google's hosts. Private pages must then open as fresh documents.
 */
export function needsFreshPageForPrivate(): boolean {
  return Boolean(GA_ID) && typeof window !== "undefined" && !isPrivatePath(documentPath());
}

/** True once Google's script has been added to this document. */
export function analyticsLoaded(): boolean {
  return gaLoaded;
}

/** Google Analytics may start: configured, allowed, and on a public page of a public-page document. */
export function mayLoadGoogleAnalytics(pathname: string, consent: Consent | null): boolean {
  return consent === "granted" && needsFreshPageForPrivate() && !isPrivatePath(pathname);
}

/** True when this document is showing a private page it must not show (see the comment at the top). */
export function mustReloadFor(pathname: string): boolean {
  return isPrivatePath(pathname) && needsFreshPageForPrivate();
}

export function loadGoogleAnalytics(): void {
  if (gaLoaded || !GA_ID) return;
  gaLoaded = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js reads the arguments object itself, not a copy of it.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
}

/** Stops Google Analytics in this document after consent is withdrawn (the page then reloads). */
export function stopGoogleAnalytics(): void {
  if (!GA_ID) return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
}

/** Turns clicks on links to private pages into full page loads in documents that need it. */
export function installNavigationGuard(): void {
  if (guardInstalled || !needsFreshPageForPrivate()) return;
  guardInstalled = true;
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      const a = target?.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || !isPrivatePath(url.pathname)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.location.assign(url.href);
    },
    true,
  );
}

/** Goes to a page, with a full page load when it is private and this document needs that. */
export function navigateSafely(href: string, clientNavigate: (href: string) => void): void {
  let pathname = href;
  try {
    pathname = new URL(href, window.location.href).pathname;
  } catch {
    /* treat as a path */
  }
  if (isPrivatePath(pathname) && needsFreshPageForPrivate()) window.location.assign(href);
  else clientNavigate(href);
}

/** Removes Google Analytics cookies (_ga, _ga_<id>) for this site. */
export function clearGoogleAnalyticsCookies(): void {
  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (!name || !/^_ga(_|$)/.test(name)) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d}`;
  }
}
