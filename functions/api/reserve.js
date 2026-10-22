// POST /api/reserve  (email, lang, adult, agree, website = honeypot)
// Saves the email (unconfirmed) and sends the confirmation link. Always answers "check your inbox" for a
// valid request, so the reply never tells anyone whether an address is already on the list.
import { json, redirect, token, sha, nowIso, validEmail, langOf, prefix, sendConfirm } from "../_lib/places.js";

const RESEND_GAP_MS = 2 * 60 * 1000;   // no second confirmation email to the same address within 2 minutes
const PER_IP_HOUR = 5;                 // new sign-ups from one connection per hour

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
  const reply = (body, status, page) =>
    wantsJson ? json(body, status) : redirect(url.origin, prefix(lang) + page);

  if (String(f.get("website") || "")) return reply({ ok: true, state: "check" }, 200, "/check-inbox/");   // bots
  const email = String(f.get("email") || "").trim().toLowerCase();
  if (!validEmail(email)) return reply({ ok: false, error: "invalid" }, 400, "/try-again/");
  if (!f.get("adult") || !f.get("agree")) return reply({ ok: false, error: "consent" }, 400, "/try-again/");

  const db = env.DB;
  const now = nowIso();
  const ipHash = await sha((request.headers.get("cf-connecting-ip") || "") + "|" + (env.IP_SALT || "oe-places"));
  const row = await db.prepare("SELECT id, token, confirmed_at, last_sent_at FROM places WHERE email = ?").bind(email).first();

  let tok;
  if (row) {
    if (row.confirmed_at) return reply({ ok: true, state: "check" }, 200, "/check-inbox/");
    if (row.last_sent_at && Date.now() - Date.parse(row.last_sent_at) < RESEND_GAP_MS)
      return reply({ ok: true, state: "check" }, 200, "/check-inbox/");
    tok = row.token;
    await db.prepare("UPDATE places SET lang = ?, last_sent_at = ?, sends = sends + 1 WHERE id = ?").bind(lang, now, row.id).run();
  } else {
    const hour = new Date(Date.now() - 3600 * 1000).toISOString();
    const n = await db.prepare("SELECT COUNT(*) AS n FROM places WHERE ip_hash = ? AND created_at > ?").bind(ipHash, hour).first();
    if (n && n.n >= PER_IP_HOUR) return reply({ ok: false, error: "busy" }, 429, "/try-again/");
    tok = token();
    await db
      .prepare("INSERT INTO places (email, lang, token, created_at, consent, ip_hash, last_sent_at, sends) VALUES (?, ?, ?, ?, ?, ?, ?, 1)")
      .bind(email, lang, tok, now, "18+ and privacy note v1", ipHash, now)
      .run();
  }

  const confirmUrl = `${url.origin}/api/confirm?t=${tok}`;
  const leaveUrl = `${url.origin}/api/leave?t=${tok}`;
  const sent = await sendConfirm(env, { to: email, lang, confirmUrl, leaveUrl });
  if (!sent.ok) return reply({ ok: false, error: "mail" }, 502, "/try-again/");
  const body = { ok: true, state: "check" };
  if (sent.dev) Object.assign(body, { dev_confirm: confirmUrl, dev_leave: leaveUrl });
  return reply(body, 200, "/check-inbox/");
}

export async function onRequest() {
  return json({ ok: false, error: "method" }, 405, { allow: "POST" });
}
