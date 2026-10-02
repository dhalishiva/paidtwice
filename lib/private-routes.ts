// Pages where customer data lives (the file being scanned, saved audits) or where people sign in,
// manage their account or pay. Third-party scripts such as Google Analytics never run on these
// pages, and when Google Analytics is configured they get a stricter Content Security Policy
// than the public pages (see next.config.ts). No imports here: next.config.ts reads this file.

export const PRIVATE_ROUTE_PREFIXES = ["/scan", "/app", "/account", "/login", "/signup", "/reset", "/pay"] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Path patterns in the syntax of next.config.ts `headers()`. */
export function privateRouteSources(): string[] {
  return PRIVATE_ROUTE_PREFIXES.flatMap((p) => [p, `${p}/:path*`]);
}
