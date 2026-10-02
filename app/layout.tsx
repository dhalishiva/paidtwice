import type { Metadata, Viewport } from "next";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { GoogleAnalytics, VercelInsights } from "@/components/analytics";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "PaidTwice: find duplicate payments in your accounts payable",
    template: "%s | PaidTwice",
  },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "PaidTwice: find the invoices you paid twice",
    description: SITE.description,
    url: SITE.url,
  },
  twitter: { card: "summary_large_image", title: "PaidTwice: find the invoices you paid twice", description: SITE.description },
  formatDetection: { telephone: false },
  // Google Search Console ownership check (HTML tag method).
  verification: SITE.googleSiteVerification ? { google: SITE.googleSiteVerification } : undefined,
};

export const viewport: Viewport = {
  themeColor: "#fbfcf9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AuthProvider>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </AuthProvider>
        <GoogleAnalytics />
        {/* Vercel serves its analytics scripts only on its own production deployments. */}
        {process.env.VERCEL_ENV === "production" && <VercelInsights />}
      </body>
    </html>
  );
}
