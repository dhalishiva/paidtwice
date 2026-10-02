import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanUrl } from "../lib/analytics";
import { isPrivatePath, privateRouteSources } from "../lib/private-routes";
import { contentSecurityPolicy, securityHeaderRules } from "../lib/security-headers";

const SUPABASE = "https://alytxtpmnohqowvlazai.supabase.co";
const csp = (rules: ReturnType<typeof securityHeaderRules>, source: string) =>
  rules
    .filter((r) => r.source === source)
    .flatMap((r) => r.headers)
    .filter((h) => h.key === "Content-Security-Policy")
    .map((h) => h.value)
    .at(-1);

describe("cleanUrl", () => {
  it("keeps the path and utm tags only", () => {
    expect(cleanUrl("https://paidtwice.app/pricing?buy=pass&utm_source=newsletter#top")).toBe("https://paidtwice.app/pricing?utm_source=newsletter");
    expect(cleanUrl("https://paidtwice.app/pay?_ptxn=txn_01h123")).toBe("https://paidtwice.app/pay");
    expect(cleanUrl("https://paidtwice.app/reset/update#access_token=abc&type=recovery")).toBe("https://paidtwice.app/reset/update");
  });

  it("replaces record ids", () => {
    expect(cleanUrl("https://paidtwice.app/app/audits/6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b")).toBe("https://paidtwice.app/app/audits/[id]");
  });

  it("copes with a relative or broken address", () => {
    expect(cleanUrl("/contact?topic=firm")).toBe("/contact");
  });
});

describe("private routes", () => {
  it("covers the scanner, audits, account, sign-in and payment pages", () => {
    for (const p of ["/scan", "/app", "/app/audits/1", "/account", "/login", "/signup", "/reset", "/reset/update", "/pay"]) {
      expect(isPrivatePath(p), p).toBe(true);
    }
  });

  it("leaves public pages alone, including look-alike paths", () => {
    for (const p of ["/", "/pricing", "/security", "/guides", "/guides/xero-duplicate-bills", "/privacy", "/contact", "/scanner", "/apply"]) {
      expect(isPrivatePath(p), p).toBe(false);
    }
  });
});

describe("security headers", () => {
  it("without Google Analytics, every page gets one strict policy", () => {
    const rules = securityHeaderRules({ supabaseUrl: SUPABASE });
    expect(rules).toHaveLength(1);
    const policy = csp(rules, "/(.*)")!;
    expect(policy).toContain(`connect-src 'self' ${SUPABASE} wss://alytxtpmnohqowvlazai.supabase.co https://*.paddle.com`);
    expect(policy).not.toMatch(/google/);
  });

  it("an invalid measurement id leaves Google Analytics off", () => {
    expect(securityHeaderRules({ supabaseUrl: SUPABASE, gaMeasurementId: "UA-1234-1" })).toHaveLength(1);
  });

  it("with Google Analytics, only public pages may reach Google", () => {
    const rules = securityHeaderRules({ supabaseUrl: SUPABASE, gaMeasurementId: "G-ABC123XYZ9" });
    expect(csp(rules, "/(.*)")).toContain("https://*.googletagmanager.com");
    const strict = contentSecurityPolicy({ supabaseUrl: SUPABASE, allowGoogleAnalytics: false });
    for (const source of privateRouteSources()) expect(csp(rules, source), source).toBe(strict);
    // The private overrides come after the catch-all rule, because the last match wins.
    expect(rules[0].source).toBe("/(.*)");
  });
});

describe("privacy policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("describes Google Analytics only when it is configured", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    const off = (await import("../lib/content")).getLegal("privacy");
    expect(off).not.toContain("_ga");
    expect(off).toContain("No analytics or advertising cookies");
    expect(off).not.toMatch(/<!--|if:ga|endif/);

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-ABC123XYZ9");
    const on = (await import("../lib/content")).getLegal("privacy");
    expect(on).toContain("<code>_ga</code>");
    expect(on).toContain('id="cookies-and-analytics"');
    expect(on).not.toContain("No analytics or advertising cookies");
    expect(on).not.toMatch(/<!--|if:ga|endif/);
  });
});
