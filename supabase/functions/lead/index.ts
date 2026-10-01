// POST /functions/v1/lead
// Stores a sales enquiry (invoice billing, Firm plan, questions). Optionally emails the
// owner through Resend when RESEND_API_KEY and LEAD_NOTIFY_EMAIL are set.
import { admin, allow, clean, clientIp, corsHeaders, EMAIL_RE, json, sha256Hex } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send a JSON body." }, 400);
  }
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const email = clean(body.email, 320)?.toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address." }, 400);
  const lead = {
    email,
    name: clean(body.name, 200),
    company: clean(body.company, 200),
    country: clean(body.country, 100),
    topic: clean(body.topic, 100),
    message: clean(body.message, 5000),
    source: clean(body.source, 200),
    user_id: null as string | null,
  };

  const db = admin();
  const ipHash = (await sha256Hex(clientIp(req))).slice(0, 32);
  if (!(await allow(db, `lead:ip:${ipHash}`, 8, "1 hour"))) {
    return json({ error: "Too many messages from this network. Try again later." }, 429);
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (token && token.split(".").length === 3) {
    const { data } = await db.auth.getUser(token);
    if (data?.user) lead.user_id = data.user.id;
  }

  const { error } = await db.from("leads").insert(lead);
  if (error) {
    console.error("lead insert failed", error.message);
    return json({ error: "Could not send your message. Try again shortly." }, 500);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const notify = Deno.env.get("LEAD_NOTIFY_EMAIL");
  const from = Deno.env.get("LEAD_FROM_EMAIL") ?? "PaidTwice <onboarding@resend.dev>";
  if (resendKey && notify) {
    const text = Object.entries(lead)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [notify], reply_to: email, subject: `PaidTwice enquiry: ${lead.topic ?? "general"}`, text }),
      });
    } catch (e) {
      console.error("lead notification failed", String(e));
    }
  }
  return json({ ok: true });
});
