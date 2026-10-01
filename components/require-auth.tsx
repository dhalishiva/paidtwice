"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  if (!ready || !user) {
    return (
      <div className="wrap py-20 text-ink-2" role="status">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}

export function planLabel(plan: "free" | "pass" | "pro"): string {
  return plan === "pro" ? "Pro" : plan === "pass" ? "Audit Pass" : "Free";
}
