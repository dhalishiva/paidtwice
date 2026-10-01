// POST /functions/v1/signup
// Creates an account with email + password. Accounts are confirmed immediately so the
// product works before a custom SMTP sender is configured; rate limits keep it civil.
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

  // Honeypot field: real people never fill it in.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true }, 201);

  const email = clean(body.email, 320)?.toLowerCase() ?? "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = clean(body.fullName, 200);
  const company = clean(body.company, 200);

  if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid work email address." }, 400);
  if (password.length < 10) return json({ error: "Use a password of at least 10 characters." }, 400);
  if (password.length > 200) return json({ error: "That password is too long." }, 400);

  const db = admin();
  const ipHash = (await sha256Hex(clientIp(req))).slice(0, 32);
  if (!(await allow(db, `signup:ip:${ipHash}`, 5, "1 hour"))) {
    return json({ error: "Too many sign-ups from this network. Try again in an hour." }, 429);
  }
  if (!(await allow(db, "signup:all", 300, "1 hour"))) {
    return json({ error: "Sign-ups are busy right now. Try again in a few minutes." }, 429);
  }

  const { error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? undefined, company: company ?? undefined },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || (error as { status?: number }).status === 422) {
      return json({ error: "An account with this email already exists. Sign in instead." }, 409);
    }
    if (msg.includes("password")) return json({ error: error.message }, 400);
    console.error("createUser failed", error.message);
    return json({ error: "Could not create the account. Try again shortly." }, 500);
  }
  return json({ ok: true }, 201);
});
