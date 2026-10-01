"use client";

import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";

export type PaidPlan = "pass" | "pro_monthly" | "pro_yearly";

const ENV = process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PRICE_IDS: Record<PaidPlan, string> = {
  pass: process.env.NEXT_PUBLIC_PADDLE_PRICE_PASS ?? "",
  pro_monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY ?? "",
  pro_yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY ?? "",
};

export function checkoutReady(plan: PaidPlan): boolean {
  return Boolean(TOKEN && PRICE_IDS[plan]);
}

let paddlePromise: Promise<Paddle | undefined> | null = null;
const listeners = new Set<(e: PaddleEventData) => void>();

function getPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      environment: ENV,
      token: TOKEN,
      eventCallback: (e) => listeners.forEach((fn) => fn(e)),
    });
  }
  return paddlePromise;
}

/**
 * Opens Paddle's overlay checkout. Resolves "completed" when the payment goes through,
 * "closed" if the buyer closes the overlay first.
 */
export async function openCheckout(plan: PaidPlan, opts: { email: string; userId: string }): Promise<"completed" | "closed"> {
  const paddle = await getPaddle();
  if (!paddle) throw new Error("The checkout could not be loaded. Check your connection or try another browser.");
  return new Promise((resolve) => {
    // The first event wins: "completed" fires while the success screen is still showing.
    const onEvent = (e: PaddleEventData) => {
      const name = String(e.name ?? "");
      if (name === "checkout.completed") resolve("completed");
      if (name === "checkout.closed") {
        listeners.delete(onEvent);
        resolve("closed");
      }
    };
    listeners.add(onEvent);
    paddle.Checkout.open({
      items: [{ priceId: PRICE_IDS[plan], quantity: 1 }],
      customer: { email: opts.email },
      customData: { user_id: opts.userId },
      settings: { displayMode: "overlay", theme: "light", allowLogout: false },
    });
  });
}
