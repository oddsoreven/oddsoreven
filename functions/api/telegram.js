// GET /api/telegram?t=MEMBER_TOKEN  (the button in the welcome email and on the thank-you page)
// For a paid-up member: makes a fresh one-person invite (valid 1 hour) and sends them straight to it.
// Anyone else: the "membership not active" page.
import { okToken, memberBy, isLive, inviteLink, prefix, langOf } from "../_lib/members.js";
import { redirect } from "../_lib/places.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") || "";
  const m = okToken(t) ? await memberBy(env.DB, "token", t) : null;
  if (!isLive(m)) return redirect(url.origin, prefix(langOf(m && m.lang)) + "/not-active/");
  let link;
  try {
    link = await inviteLink(env, m);
  } catch (e) {
    console.log(String(e));
    return redirect(url.origin, prefix(langOf(m.lang)) + "/try-again/");
  }
  return new Response(null, { status: 303, headers: { location: link, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
