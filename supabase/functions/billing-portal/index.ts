// POST /functions/v1/billing-portal   (JWT verification OFF; the user's token is checked here)
//
// Creates an authenticated Paddle customer portal session for the signed-in user, where they
// can update their card, download invoices or cancel. Sessions are created on demand and never
// cached, as Paddle recommends.
// https://developer.paddle.com/build/customers/integrate-customer-portal
//
// Secrets: PADDLE_API_KEY (needs customer_portal_session.write), PADDLE_ENV=production|sandbox
import { admin, corsHeaders, json } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in first." }, 401);
  const db = admin();
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  if (authErr || !auth?.user) return json({ error: "Your session has expired. Sign in again." }, 401);

  const apiKey = Deno.env.get("PADDLE_API_KEY");
  if (!apiKey) {
    return json({ error: "Billing management is not set up yet. Use the link in your Paddle receipt email, or contact us." }, 503);
  }
  const { data: ent } = await db
    .from("entitlements")
    .select("paddle_customer_id, paddle_subscription_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!ent?.paddle_customer_id) return json({ error: "There are no payments on this account yet." }, 404);

  const base = Deno.env.get("PADDLE_ENV") === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const body = ent.paddle_subscription_id ? { subscription_ids: [ent.paddle_subscription_id] } : {};
  let res: Response;
  try {
    res = await fetch(`${base}/customers/${encodeURIComponent(ent.paddle_customer_id)}/portal-sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ error: "Could not reach the billing provider. Try again shortly." }, 502);
  }
  if (!res.ok) {
    console.error("portal session failed", res.status, (await res.text()).slice(0, 300));
    return json({ error: "Could not open billing management. Try again shortly." }, 502);
  }
  const urls = (await res.json())?.data?.urls ?? {};
  const sub = Array.isArray(urls.subscriptions) ? urls.subscriptions[0] : null;
  return json({
    ok: true,
    url: urls.general?.overview ?? null,
    cancelUrl: sub?.cancel_subscription ?? null,
    updatePaymentUrl: sub?.update_subscription_payment_method ?? null,
  });
});
