// GET /api/manage?t=MEMBER_TOKEN  (the "manage my membership" link in the welcome email)
// Opens Stripe's own customer page: change card, see receipts, cancel. Nothing is changed on this site.
import { okToken, memberBy, stripe, prefix, langOf } from "../_lib/members.js";
import { redirect } from "../_lib/places.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") || "";
  const m = okToken(t) ? await memberBy(env.DB, "token", t) : null;
  if (!m || !m.stripe_customer) return redirect(url.origin, prefix(langOf(m && m.lang)) + "/not-active/");
  let portal;
  try {
    portal = await stripe(env, "POST", "billing_portal/sessions", {
      customer: m.stripe_customer,
      locale: langOf(m.lang),
      return_url: url.origin + prefix(langOf(m.lang)) + "/",
    });
  } catch (e) {
    console.log(String(e));
    return redirect(url.origin, prefix(langOf(m.lang)) + "/try-again/");
  }
  return new Response(null, { status: 303, headers: { location: portal.url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
