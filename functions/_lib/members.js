// Odds or Even: paid members. Shared code for /api/join, /api/invite, /api/telegram, /api/manage,
// /api/stripe-webhook, /api/tg-webhook, /api/tg-setup and /api/spots.
// Needs, in the Cloudflare Pages project settings (Preview = staging, Production = the public site):
//   D1 binding  DB                      (tables in members_schema.sql)
//   Secrets     STRIPE_SECRET_KEY       (sk_test_... on Preview; sk_live_... only once the business side is done)
//               STRIPE_WEBHOOK_SECRET   (whsec_... of the Stripe event destination for that site)
//               TELEGRAM_BOT_TOKEN      (the members bot, admin of the members channel)
//               RESEND_API_KEY          (already there for the founding places)
// Optional plain variables (defaults below are the TEST set-up):
//               STRIPE_PRICE_ID, TELEGRAM_CHANNEL_ID, MAIL_FROM
import { sha, token, nowIso, langOf, prefix, json } from "./places.js";

export const FOUNDING_PLACES = 100;
const TEST_PRICE = "price_1URFTp6RYeCmSq2zM7AHk67V";        // Odds or Even membership, €10 a month (Stripe sandbox)
const TEST_CHANNEL = "-1003855171369";                      // "Odds or Even · TEST members"
const LIVE_STATES = ["active", "past_due", "ending"];        // still inside a paid period: keeps the channel

export const priceId = (env) => env.STRIPE_PRICE_ID || TEST_PRICE;
export const channelId = (env) => env.TELEGRAM_CHANNEL_ID || TEST_CHANNEL;
export const isLive = (m) => !!m && LIVE_STATES.includes(m.status);
export const okToken = (t) => typeof t === "string" && /^[0-9a-f]{48}$/.test(t);
export { json, nowIso, langOf, prefix, token };

// ------------------------------------------------------------------ Stripe (plain HTTPS, no library)
function form(obj, pre, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out;
}

export async function stripe(env, method, path, params) {
  const init = { method, headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY } };
  let url = "https://api.stripe.com/v1/" + path;
  if (params && method === "GET") url += "?" + form(params).join("&");
  else if (params) {
    init.body = form(params).join("&");
    init.headers["content-type"] = "application/x-www-form-urlencoded";
  }
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("stripe " + path + " " + r.status + " " + ((body.error && body.error.message) || ""));
  return body;
}

const enc = new TextEncoder();
function hex(buf) {
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Checks the Stripe-Signature header against the raw body (HMAC-SHA256, 5 minutes tolerance).
export async function stripeEvent(env, raw, header, now = Date.now()) {
  const parts = {};
  const v1 = [];
  for (const p of String(header || "").split(",")) {
    const [k, v] = p.split("=");
    if (k === "t") parts.t = v;
    if (k === "v1" && v) v1.push(v);
  }
  if (!parts.t || !v1.length || !env.STRIPE_WEBHOOK_SECRET) return null;
  if (Math.abs(now / 1000 - Number(parts.t)) > 300) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, enc.encode(parts.t + "." + raw)));
  if (!v1.some((s) => same(s, want))) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------------ Telegram
export async function tg(env, method, params) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  const body = await r.json().catch(() => ({}));
  if (!body.ok) throw new Error("telegram " + method + " " + (body.description || r.status));
  return body.result;
}

// The secret Telegram sends back with every update, derived from the bot token (nothing extra to store).
export async function tgSecret(env) {
  return (await sha(String(env.TELEGRAM_BOT_TOKEN || "") + "|oe-members-webhook")).slice(0, 32);
}

// A fresh one-person invite, valid 1 hour, named after the member so the join can be matched to them.
export async function inviteLink(env, m) {
  const r = await tg(env, "createChatInviteLink", {
    chat_id: channelId(env),
    name: "m" + m.id,
    member_limit: 1,
    expire_date: Math.floor(Date.now() / 1000) + 3600,
  });
  return r.invite_link;
}

// Takes someone out of the channel without a lasting ban (they can come back if they subscribe again).
export async function removeFromChannel(env, userId) {
  if (!userId) return;
  try {
    await tg(env, "banChatMember", { chat_id: channelId(env), user_id: userId });
    await tg(env, "unbanChatMember", { chat_id: channelId(env), user_id: userId, only_if_banned: true });
  } catch (e) {
    console.log("remove failed", userId, String(e));
  }
}

// ------------------------------------------------------------------ the member record
export async function memberBy(db, col, val) {
  if (!val) return null;
  const cols = { id: 1, email: 1, token: 1, stripe_sub: 1, stripe_customer: 1, checkout_session: 1, tg_user_id: 1 };
  if (!cols[col]) throw new Error("bad column");
  return db.prepare(`SELECT * FROM members WHERE ${col} = ?`).bind(val).first();
}

export async function foundingTaken(db) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE founding_no IS NOT NULL").first();   // a place once taken never reopens
  return r ? r.n : 0;
}

const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);

// The subscription's current paid period end (field moved into the items in newer Stripe versions).
export function periodEnd(sub) {
  const s = sub && (sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end));
  return iso(s);
}

// Stripe status -> ours. "ending" = cancelled but still inside the paid month.
export function stateOf(sub) {
  if (!sub) return "pending";
  if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) return "ended";
  if (sub.status === "past_due") return "past_due";
  if (sub.status === "active" || sub.status === "trialing") return sub.cancel_at_period_end || sub.cancel_at ? "ending" : "active";
  return "pending";
}

// A paid checkout -> active member: founding number while places last, welcome email once. Safe to run twice
// (the webhook and the thank-you page both call it, whichever comes first).
export async function activate(env, origin, session) {
  if (!session || session.mode !== "subscription" || session.status !== "complete") return null;
  if (!["paid", "no_payment_required"].includes(session.payment_status)) return null;
  const db = env.DB;
  let m = (await memberBy(db, "token", session.client_reference_id)) || (await memberBy(db, "checkout_session", session.id));
  const email = String((session.customer_details && session.customer_details.email) || session.customer_email || "").toLowerCase();
  if (!m && email) m = await memberBy(db, "email", email);
  const now = nowIso();
  if (!m) {
    if (!email) return null;
    await db
      .prepare("INSERT INTO members (email, lang, token, status, consent, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)")
      .bind(email, langOf(session.locale || (session.metadata && session.metadata.lang)), token(), "checkout only", now, now)
      .run();
    m = await memberBy(db, "email", email);
  }
  const sub = typeof session.subscription === "string" ? session.subscription : session.subscription && session.subscription.id;
  const cus = typeof session.customer === "string" ? session.customer : session.customer && session.customer.id;
  if (!m.paid_at || m.status === "pending" || m.status === "ended") {
    await db
      .prepare(
        "UPDATE members SET status = 'active', paid_at = COALESCE(paid_at, ?), ended_at = NULL, stripe_sub = COALESCE(?, stripe_sub), " +
          "stripe_customer = COALESCE(?, stripe_customer), checkout_session = ?, updated_at = ? WHERE id = ?"
      )
      .bind(now, sub || null, cus || null, session.id, now, m.id)
      .run();
  }
  if (m.founding_no == null) {
    // one statement, so two payments at the same moment can't both take place no. 100. A member who cancelled
    // and comes back keeps no founding deal (Matt, 15 Oct: kept while subscribed, lost on cancelling).
    await db
      .prepare(
        "UPDATE members SET founding = 1, founding_no = (SELECT COUNT(*) FROM members WHERE founding_no IS NOT NULL) + 1 " +
          "WHERE id = ? AND founding_no IS NULL AND (SELECT COUNT(*) FROM members WHERE founding_no IS NOT NULL) < ?"
      )
      .bind(m.id, FOUNDING_PLACES)
      .run();
  }
  m = await memberBy(db, "id", m.id);
  if (!m.welcome_sent_at) {
    const sent = await sendWelcome(env, origin, m);
    if (sent.ok) await db.prepare("UPDATE members SET welcome_sent_at = ? WHERE id = ?").bind(nowIso(), m.id).run();
  }
  return memberBy(db, "id", m.id);
}

// A subscription change from Stripe -> status, paid-until date; out of the channel once it has really ended.
export async function applySubscription(env, sub) {
  const db = env.DB;
  let m = (await memberBy(db, "stripe_sub", sub.id)) || (await memberBy(db, "stripe_customer", sub.customer));
  if (!m) return null;
  const st = stateOf(sub);
  const now = nowIso();
  if (st === "pending") return m;
  await db
    .prepare(
      "UPDATE members SET status = ?, stripe_sub = ?, period_end = COALESCE(?, period_end), ended_at = ?, " +
        "founding = CASE WHEN ? = 'ended' THEN 0 ELSE founding END, updated_at = ? WHERE id = ?"
    )
    .bind(st, sub.id, periodEnd(sub), st === "ended" ? m.ended_at || now : null, st, now, m.id)
    .run();
  if (st === "ended" && m.tg_user_id) {
    await removeFromChannel(env, m.tg_user_id);
    await db.prepare("UPDATE members SET tg_user_id = NULL WHERE id = ?").bind(m.id).run();
  }
  return memberBy(db, "id", m.id);
}

// Abandoned checkouts: an email that never paid is not kept for more than 7 days.
export async function tidy(db) {
  const cut = new Date(Date.now() - 7 * 864e5).toISOString();
  await db.prepare("DELETE FROM members WHERE status = 'pending' AND paid_at IS NULL AND created_at < ?").bind(cut).run();
  const ev = new Date(Date.now() - 30 * 864e5).toISOString();
  await db.prepare("DELETE FROM stripe_events WHERE received_at < ?").bind(ev).run();
}

// ------------------------------------------------------------------ welcome email (EN / IT / ES)
const MAIL = {
  en: {
    subject: "Welcome to Odds or Even",
    hello: "You're in. Thank you for joining.",
    where: "Every pick goes to our private Telegram channel the moment it's published. Tap the button to join it:",
    button: "Join the members' channel",
    once: "The link is yours only. New phone or new Telegram account? Use the same link again; the old account is taken out.",
    founding: "You're founding member no. {n}: you keep €10 a month for life, for as long as you stay subscribed.",
    manage: "Change your card or cancel any time:",
    manage_link: "Manage my membership",
    help: "Questions? Just reply to this email, or see the help page:",
  },
  it: {
    subject: "Benvenuto in Odds or Even",
    hello: "Ci sei. Grazie per esserti iscritto.",
    where: "Ogni pick arriva nel nostro canale Telegram privato appena viene pubblicato. Tocca il pulsante per entrare:",
    button: "Entra nel canale iscritti",
    once: "Il link è solo tuo. Nuovo telefono o nuovo account Telegram? Usa di nuovo lo stesso link: il vecchio account viene tolto.",
    founding: "Sei il socio fondatore n. {n}: mantieni €10 al mese per sempre, finché resti abbonato.",
    manage: "Cambia la carta o disdici quando vuoi:",
    manage_link: "Gestisci il mio abbonamento",
    help: "Domande? Rispondi pure a questa email, oppure guarda la pagina di aiuto:",
  },
  es: {
    subject: "Bienvenido a Odds or Even",
    hello: "Ya estás dentro. Gracias por unirte.",
    where: "Cada pick llega a nuestro canal privado de Telegram en cuanto se publica. Pulsa el botón para entrar:",
    button: "Entrar en el canal de miembros",
    once: "El enlace es solo tuyo. ¿Móvil o cuenta de Telegram nuevos? Usa el mismo enlace otra vez: la cuenta anterior se retira.",
    founding: "Eres el miembro fundador n.º {n}: mantienes 10 € al mes para siempre, mientras sigas suscrito.",
    manage: "Cambia la tarjeta o cancela cuando quieras:",
    manage_link: "Gestionar mi suscripción",
    help: "¿Dudas? Responde a este correo o mira la página de ayuda:",
  },
};

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export async function sendWelcome(env, origin, m) {
  const T = MAIL[m.lang] || MAIL.en;
  const tgUrl = `${origin}/api/telegram?t=${m.token}`;
  const manUrl = `${origin}/api/manage?t=${m.token}`;
  const helpUrl = `${origin}${prefix(m.lang)}/help/`;
  const fnd = m.founding ? T.founding.replace("{n}", m.founding_no) : "";
  const text = `${T.hello}\n\n${T.where}\n${tgUrl}\n\n${T.once}\n\n${fnd ? fnd + "\n\n" : ""}${T.manage} ${manUrl}\n\n${T.help} ${helpUrl}\n\nOdds or Even · oddsoreven.com\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#17141a;max-width:520px">
<p><b>${escHtml(T.hello)}</b></p>
<p>${escHtml(T.where)}</p>
<p><a href="${escHtml(tgUrl)}" style="display:inline-block;background:#E08A4E;color:#17141a;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">${escHtml(T.button)}</a></p>
<p style="color:#6b6470;font-size:14px">${escHtml(T.once)}</p>
${fnd ? `<p>${escHtml(fnd)}</p>` : ""}
<p style="font-size:14px">${escHtml(T.manage)} <a href="${escHtml(manUrl)}" style="color:#9C4E1C">${escHtml(T.manage_link)}</a></p>
<p style="color:#6b6470;font-size:14px">${escHtml(T.help)} <a href="${escHtml(helpUrl)}" style="color:#9C4E1C">${escHtml(helpUrl.replace(/^https?:\/\//, ""))}</a></p>
<p style="color:#6b6470;font-size:13px">Odds or Even · <a href="https://oddsoreven.com" style="color:#9C4E1C">oddsoreven.com</a></p>
</div>`;
  if (!env.RESEND_API_KEY) return { ok: env.DEV === "1", dev: true };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Odds or Even <contact@oddsoreven.com>",
      reply_to: "contact@oddsoreven.com",
      to: [m.email],
      subject: T.subject,
      text,
      html,
    }),
  });
  return { ok: r.ok, status: r.status };
}
