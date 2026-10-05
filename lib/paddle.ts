"use client";

import type { Paddle, PaddleEventData } from "@paddle/paddle-js";

export type PaidPlan = "pass" | "pro_monthly" | "pro_yearly";

const ENV = process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PRICE_IDS: Record<PaidPlan, string> = {
  pass: process.env.NEXT_PUBLIC_PADDLE_PRICE_PASS ?? "",
  pro_monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY ?? "",
  pro_yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY ?? "",
};

export function paddleConfigured(): boolean {
  return Boolean(TOKEN);
}

export function checkoutReady(plan: PaidPlan): boolean {
  return Boolean(TOKEN && PRICE_IDS[plan]);
}

let paddlePromise: Promise<Paddle | undefined> | null = null;
const listeners = new Set<(e: PaddleEventData) => void>();

function getPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    // Loaded only when a checkout is actually needed, keeping it out of every page's bundle.
    paddlePromise = import("@paddle/paddle-js")
      .then(({ initializePaddle }) =>
        initializePaddle({
          environment: ENV,
          token: TOKEN,
          eventCallback: (e) => listeners.forEach((fn) => fn(e)),
        }),
      )
      .catch(() => {
        paddlePromise = null;
        return undefined;
      });
  }
  return paddlePromise;
}

/**
 * Loads Paddle.js. On the default payment link page this is all that is needed: Paddle.js opens
 * the checkout by itself when the address carries a `_ptxn` transaction id.
 */
export async function initPaddle(): Promise<boolean> {
  if (!TOKEN) return false;
  return Boolean(await getPaddle());
}

export type CheckoutOutcome = "completed" | "closed" | "error";

/**
 * Opens Paddle's overlay checkout. Resolves "completed" when the payment goes through,
 * "closed" if the buyer closes the overlay first, "error" if the checkout reports an error.
 */
export async function openCheckout(plan: PaidPlan, opts: { email: string; userId: string }): Promise<CheckoutOutcome> {
  const paddle = await getPaddle();
  if (!paddle) throw new Error("The checkout could not be loaded. Check your connection or try another browser.");
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    // The first event wins: "completed" fires while the success screen is still showing.
    const onEvent = (e: PaddleEventData) => {
      const name = String(e.name ?? "");
      if (name === "checkout.completed") settle("completed");
      if (name === "checkout.error") {
        listeners.delete(onEvent);
        settle("error");
      }
      if (name === "checkout.closed") {
        listeners.delete(onEvent);
        settle("closed");
      }
    };
    listeners.add(onEvent);
    try {
      paddle.Checkout.open({
        items: [{ priceId: PRICE_IDS[plan], quantity: 1 }],
        customer: { email: opts.email },
        customData: { user_id: opts.userId },
        settings: { displayMode: "overlay", theme: "light", allowLogout: false },
      });
    } catch {
      listeners.delete(onEvent);
      settle("error");
    }
  });
}
