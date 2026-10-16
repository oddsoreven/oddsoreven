// GET /api/invite?s=CHECKOUT_SESSION_ID  (used by the thank-you page right after paying)
// Asks Stripe whether that checkout is paid, activates the member if the webhook hasn't yet, and answers
// {ok, tg: "/api/telegram?t=...", founding, n}. Only the person who just paid has the session code.
import { json, stripe, activate } from "../_lib/members.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const s = url.searchParams.get("s") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(s)) return json({ ok: false, error: "invalid" }, 400);
  let session;
  try {
    session = await stripe(env, "GET", "checkout/sessions/" + s);
  } catch (e) {
    return json({ ok: false, error: "unknown" }, 404);
  }
  const m = await activate(env, url.origin, session);
  if (!m) return json({ ok: false, error: "unpaid" }, 402);
  return json({ ok: true, tg: "/api/telegram?t=" + m.token, founding: !!m.founding, n: m.founding_no || null });
}
