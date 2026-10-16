// POST /api/join  (email, lang, adult, agree, website = honeypot)
// Keeps the email as "pending" and opens Stripe's own checkout page (€10 a month). With JavaScript the page gets
// {ok, url} and goes there; without it, a plain redirect. Payment details never touch this site.
import { json, nowIso, langOf, prefix, token, stripe, priceId, memberBy, isLive, tidy } from "../_lib/members.js";
import { validEmail, redirect } from "../_lib/places.js";

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const wantsJson = (request.headers.get("accept") || "").includes("application/json");
  let f;
  try {
    f = await request.formData();
  } catch (e) {
    return json({ ok: false, error: "invalid" }, 400);
  }
  const lang = langOf(String(f.get("lang") || ""));
  const fail = (error, status, page) => (wantsJson ? json({ ok: false, error }, status) : redirect(url.origin, prefix(lang) + page));

  if (String(f.get("website") || "")) return fail("invalid", 400, "/try-again/"); // bots
  const email = String(f.get("email") || "").trim().toLowerCase();
  if (!validEmail(email)) return fail("invalid", 400, "/try-again/");
  if (!f.get("adult") || !f.get("agree")) return fail("consent", 400, "/try-again/");

  const db = env.DB;
  await tidy(db);
  const now = nowIso();
  let m = await memberBy(db, "email", email);
  if (m && isLive(m)) return fail("member", 409, "/already-member/");
  if (m) {
    await db.prepare("UPDATE members SET lang = ?, consent = ?, updated_at = ? WHERE id = ?").bind(lang, "18+ and privacy note v2", now, m.id).run();
  } else {
    await db
      .prepare("INSERT INTO members (email, lang, token, status, consent, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)")
      .bind(email, lang, token(), "18+ and privacy note v2", now, now)
      .run();
    m = await memberBy(db, "email", email);
  }

  // Which payment methods show (cards, Apple/Google Pay, Link; Klarna and Satispay off, Matt 16 Oct) is set in the
  // Stripe dashboard (Settings -> Payment methods): Stripe no longer accepts payment_method_types here (16 Oct, 400).
  const testMode = String(env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
  let session;
  try {
    session = await stripe(env, "POST", "checkout/sessions", {
      mode: "subscription",
      line_items: [{ price: priceId(env), quantity: 1 }],
      customer_email: m.stripe_customer ? undefined : email,
      customer: m.stripe_customer || undefined,
      client_reference_id: m.token,
      locale: lang,
      metadata: { lang },
      subscription_data: { metadata: { lang, member: String(m.id) } },
      success_url: `${url.origin}${prefix(lang)}/joined/?s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}${prefix(lang)}/#founding`,
    });
  } catch (e) {
    console.log(String(e));
    if (wantsJson && testMode) return json({ ok: false, error: "error", detail: String(e) }, 502); // test mode only: Stripe's reason
    return fail("error", 502, "/try-again/");
  }
  await db.prepare("UPDATE members SET checkout_session = ?, updated_at = ? WHERE id = ?").bind(session.id, now, m.id).run();
  if (wantsJson) return json({ ok: true, url: session.url });
  return new Response(null, { status: 303, headers: { location: session.url, "cache-control": "no-store" } });
}

export async function onRequest() {
  return json({ ok: false, error: "method" }, 405, { allow: "POST" });
}
