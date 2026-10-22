// POST /api/stripe-webhook  (Stripe calls this; set up as an event destination in the Stripe dashboard)
// Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed.
// Every event is checked against STRIPE_WEBHOOK_SECRET and handled once only.
import { json, nowIso, stripeEvent, activate, applySubscription, memberBy } from "../_lib/members.js";

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const ev = await stripeEvent(env, raw, request.headers.get("stripe-signature"));
  if (!ev || !ev.id || !ev.type) return json({ ok: false, error: "signature" }, 400);
  const db = env.DB;
  const seen = await db.prepare("SELECT id FROM stripe_events WHERE id = ?").bind(ev.id).first();
  if (seen) return json({ ok: true, repeat: true });
  const origin = new URL(request.url).origin;
  const o = (ev.data && ev.data.object) || {};
  try {
    if (ev.type === "checkout.session.completed") {
      await activate(env, origin, o);
    } else if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
      await applySubscription(env, ev.type.endsWith("deleted") ? { ...o, status: "canceled" } : o);
    } else if (ev.type === "invoice.payment_failed") {
      const m = (await memberBy(db, "stripe_customer", o.customer)) || null;
      if (m) await db.prepare("UPDATE members SET payment_failed_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), m.id).run();
    }
  } catch (e) {
    console.log("webhook", ev.type, String(e));
    return json({ ok: false, error: "retry" }, 500); // Stripe tries again later
  }
  await db.prepare("INSERT OR IGNORE INTO stripe_events (id, type, received_at) VALUES (?, ?, ?)").bind(ev.id, ev.type, nowIso()).run();
  return json({ ok: true });
}

export async function onRequest() {
  return json({ ok: false, error: "method" }, 405, { allow: "POST" });
}
