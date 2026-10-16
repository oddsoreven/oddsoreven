// POST /api/resend  (email, lang, website = honeypot)   "Lost your links?"
// If the email belongs to a paid-up member, their welcome email (Telegram + manage links) goes out again,
// only ever to that address. The answer is always the same, so nobody can learn who is a member.
// Limits: one email per address every 2 minutes, 3 an hour; 10 tries an hour from one connection.
import { json, nowIso, langOf, prefix, memberBy, isLive, sendWelcome } from "../_lib/members.js";
import { ensureTables } from "../_lib/admin.js";
import { validEmail, redirect, sha } from "../_lib/places.js";

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
  const done = () => (wantsJson ? json({ ok: true }) : redirect(url.origin, prefix(lang) + "/links-sent/"));
  const email = String(f.get("email") || "").trim().toLowerCase();
  if (String(f.get("website") || "")) return done();
  if (!validEmail(email)) return wantsJson ? json({ ok: false, error: "invalid" }, 400) : redirect(url.origin, prefix(lang) + "/help/#lost");

  const db = env.DB;
  await ensureTables(db);
  const now = Date.now();
  const hour = new Date(now - 3600e3).toISOString();
  await db.prepare("DELETE FROM resend_log WHERE at < ?").bind(new Date(now - 864e5).toISOString()).run();
  const ip = "ip:" + (await sha((request.headers.get("cf-connecting-ip") || "") + "|oe-resend"));
  const em = "em:" + (await sha(email + "|oe-resend"));
  const nIp = (await db.prepare("SELECT COUNT(*) AS n FROM resend_log WHERE who = ? AND at > ?").bind(ip, hour).first()).n;
  if (nIp >= 10) return wantsJson ? json({ ok: false, error: "busy" }, 429) : redirect(url.origin, prefix(lang) + "/try-again/");
  await db.prepare("INSERT INTO resend_log (who, at) VALUES (?, ?)").bind(ip, nowIso()).run();

  const m = await memberBy(db, "email", email);
  if (isLive(m)) {
    const last = await db.prepare("SELECT COUNT(*) AS n, MAX(at) AS at FROM resend_log WHERE who = ? AND at > ?").bind(em, hour).first();
    const tooSoon = last.at && now - Date.parse(last.at) < 120e3;
    if (last.n < 3 && !tooSoon) {
      const sent = await sendWelcome(env, url.origin, m);
      if (sent.ok) await db.prepare("INSERT INTO resend_log (who, at) VALUES (?, ?)").bind(em, nowIso()).run();
    }
  }
  return done();
}

export async function onRequest() {
  return json({ ok: false, error: "method" }, 405, { allow: "POST" });
}
