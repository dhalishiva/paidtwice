// HTTP security headers, used by next.config.ts. No imports beyond private-routes, so the
// Next.js config loader can read this file, and tests can call it with any settings.
//
// The scan runs in the browser. The Content Security Policy is the browser-enforced promise behind
// "your file is never uploaded": pages may only talk to this site (including Vercel's first-party
// analytics under /_vercel/*), the Supabase API and Paddle's checkout. When Google Analytics is
// configured, public pages may also reach Google's analytics hosts; private pages (the scanner,
// saved audits, sign-in, account and payment pages) never can.

import { privateRouteSources } from "./private-routes";

export function contentSecurityPolicy({ supabaseUrl, allowGoogleAnalytics }: { supabaseUrl: string; allowGoogleAnalytics: boolean }): string {
  const ga = allowGoogleAnalytics
    ? {
        script: " https://*.googletagmanager.com",
        img: " https://*.google-analytics.com https://*.googletagmanager.com",
        connect: " https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
      }
    : { script: "", img: "", connect: "" };
  const supabase = supabaseUrl ? ` ${supabaseUrl} ${supabaseUrl.replace("https://", "wss://")}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://cdn.paddle.com https://*.paddle.com${ga.script}`,
    "style-src 'self' 'unsafe-inline' https://*.paddle.com",
    `img-src 'self' data: blob: https://*.paddle.com${ga.img}`,
    "font-src 'self' data:",
    `connect-src 'self'${supabase} https://*.paddle.com${ga.connect}`,
    "frame-src https://*.paddle.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function isGoogleAnalyticsId(id: string | undefined): boolean {
  return /^G-[A-Z0-9]{4,20}$/.test(id ?? "");
}

export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** Header rules in next.config.ts `headers()` form. Later rules override earlier ones for the same header. */
export function securityHeaderRules({ supabaseUrl, gaMeasurementId }: { supabaseUrl: string; gaMeasurementId?: string }): HeaderRule[] {
  const googleAnalytics = isGoogleAnalyticsId(gaMeasurementId);
  const rules: HeaderRule[] = [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy({ supabaseUrl, allowGoogleAnalytics: googleAnalytics }) },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Permissions-Policy",
          value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://buy.paddle.com" "https://sandbox-buy.paddle.com")',
        },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    },
  ];
  if (googleAnalytics) {
    const strict = contentSecurityPolicy({ supabaseUrl, allowGoogleAnalytics: false });
    for (const source of privateRouteSources()) rules.push({ source, headers: [{ key: "Content-Security-Policy", value: strict }] });
  }
  return rules;
}
