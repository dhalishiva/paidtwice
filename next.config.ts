import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // Content Security Policy and other security headers; see lib/security-headers.ts.
    return securityHeaderRules({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    });
  },
};

export default nextConfig;
