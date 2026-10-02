"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuth, type Plan } from "./auth-provider";
import { navigateSafely } from "@/lib/analytics";
import { checkoutReady, openCheckout, type PaidPlan } from "@/lib/paddle";

export interface CheckoutState {
  busy: PaidPlan | null;
  message: string | null;
  error: string | null;
}

const PLAN_TOPIC: Record<PaidPlan, string> = { pass: "audit-pass", pro_monthly: "pro", pro_yearly: "pro-yearly" };

/**
 * Starts a purchase. Not signed in: sends the buyer to create an account first and back to
 * `returnTo` with ?buy=<plan>. Checkout not configured yet: sends them to the contact form so
 * the sale can still happen by payment link or invoice.
 */
export function useCheckout(returnTo: string) {
  const router = useRouter();
  const { user, refreshPlan } = useAuth();
  const [state, setState] = useState<CheckoutState>({ busy: null, message: null, error: null });

  const buy = useCallback(
    async (plan: PaidPlan): Promise<Plan | null> => {
      if (!user) {
        const sep = returnTo.includes("?") ? "&" : "?";
        // Sign-up is a private page: a full page load when this document needs one (lib/analytics.ts).
        navigateSafely(`/signup?next=${encodeURIComponent(`${returnTo}${sep}buy=${plan}`)}`, (href) => router.push(href));
        return null;
      }
      if (!checkoutReady(plan)) {
        router.push(`/contact?topic=${PLAN_TOPIC[plan]}`);
        return null;
      }
      setState({ busy: plan, message: null, error: null });
      try {
        const outcome = await openCheckout(plan, { email: user.email ?? "", userId: user.id });
        if (outcome === "error") {
          setState({ busy: null, message: null, error: "The checkout reported a problem. Nothing was charged; please try again or contact us." });
          return null;
        }
        if (outcome !== "completed") {
          setState({ busy: null, message: null, error: null });
          return null;
        }
        setState({ busy: plan, message: "Payment received. Unlocking your account…", error: null });
        // The payment provider notifies our server a few seconds after checkout.
        for (let i = 0; i < 40; i++) {
          const p = await refreshPlan();
          if (p !== "free") {
            setState({ busy: null, message: "Your account is unlocked.", error: null });
            return p;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        setState({
          busy: null,
          message: null,
          error: "Your payment went through but your account has not updated yet. Refresh the page in a minute, or contact us if it stays locked.",
        });
        return null;
      } catch (e) {
        setState({ busy: null, message: null, error: e instanceof Error ? e.message : "The checkout could not be opened." });
        return null;
      }
    },
    [user, router, returnTo, refreshPlan],
  );

  return { buy, state };
}
