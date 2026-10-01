// POST /functions/v1/delete-account
// Lets a signed-in user delete their account. Saved audits and findings are removed by
// ON DELETE CASCADE. Billing records stay with Paddle as the merchant of record.
import { admin, corsHeaders, json } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in first." }, 401);
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Your session has expired. Sign in again." }, 401);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  if (body.confirm !== "DELETE") return json({ error: 'Type DELETE to confirm.' }, 400);
  const { error: delErr } = await db.auth.admin.deleteUser(data.user.id);
  if (delErr) {
    console.error("delete user failed", delErr.message);
    return json({ error: "Could not delete the account. Contact support." }, 500);
  }
  return json({ ok: true });
});
