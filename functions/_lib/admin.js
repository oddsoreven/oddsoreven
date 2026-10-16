// Odds or Even back office: login by one-time email link (only ADMIN_EMAIL, default contact@oddsoreven.com),
// a signed 12-hour cookie, and the HTML shell for the /admin pages. Nothing extra to set up in Cloudflare:
// the signing key is derived from the secrets already there.
import { sha, token, nowIso } from "./places.js";

export const ADMIN_EMAIL = (env) => String(env.ADMIN_EMAIL || "contact@oddsoreven.com").toLowerCase();
const COOKIE = "oe_admin";
const SESSION_H = 12;
const LINK_MIN = 15;
const enc = new TextEncoder();

async function key(env) {
  const base = String(env.STRIPE_WEBHOOK_SECRET || "") + "|" + String(env.TELEGRAM_BOT_TOKEN || "") + "|oe-admin-v1";
  if (base.length < 30) throw new Error("admin key missing");
  return crypto.subtle.importKey("raw", enc.encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function mac(env, s) {
  const b = await crypto.subtle.sign("HMAC", await key(env), enc.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function ensureTables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS admin_logins (nonce TEXT PRIMARY KEY, created_at TEXT NOT NULL, used_at TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS resend_log (who TEXT NOT NULL, at TEXT NOT NULL)").run();
}

// ---- login link: /admin/auth?n=NONCE&e=EXPIRY&s=SIGNATURE, used once, valid 15 minutes
export async function loginLink(env, origin) {
  const n = token();
  const e = Date.now() + LINK_MIN * 60000;
  await env.DB.prepare("INSERT INTO admin_logins (nonce, created_at) VALUES (?, ?)").bind(n, nowIso()).run();
  return `${origin}/admin/auth?n=${n}&e=${e}&s=${await mac(env, "link|" + n + "|" + e)}`;
}

export async function useLink(env, n, e, s) {
  if (!/^[0-9a-f]{48}$/.test(n || "") || !/^\d{13}$/.test(e || "") || Number(e) < Date.now()) return false;
  if (!same(String(s || ""), await mac(env, "link|" + n + "|" + e))) return false;
  const r = await env.DB.prepare("UPDATE admin_logins SET used_at = ? WHERE nonce = ? AND used_at IS NULL").bind(nowIso(), n).run();
  return !!(r && (r.meta ? r.meta.changes : r.changes));
}

export async function recentLinks(db) {
  const cut = new Date(Date.now() - LINK_MIN * 60000).toISOString();
  const r = await db.prepare("SELECT COUNT(*) AS n FROM admin_logins WHERE created_at > ?").bind(cut).first();
  return r ? r.n : 0;
}

// ---- session cookie
export async function sessionCookie(env) {
  const exp = Date.now() + SESSION_H * 3600000;
  const v = exp + "." + (await mac(env, "session|" + exp));
  // Lax, not Strict: with Strict the browser holds the cookie back on the first page after clicking the
  // emailed link (it counts as arriving from Gmail). Every action is a POST from our own page, checked by sameOrigin.
  return `${COOKIE}=${v}; Path=/admin; Max-Age=${SESSION_H * 3600}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = () => `${COOKIE}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export async function isAdmin(env, request) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=(\\d{13})\\.([0-9a-f]{64})"));
  if (!m || Number(m[1]) < Date.now()) return false;
  return same(m[2], await mac(env, "session|" + m[1]));
}

// POSTs must come from our own pages (with SameSite=Strict this is belt and braces)
export function sameOrigin(request) {
  const o = request.headers.get("origin");
  if (o && o !== "null") return o === new URL(request.url).origin;
  // no usable Origin (some browsers send "null"): fall back on the browser's own same-site marker
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

// ---- HTML
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function page(title, body, opts = {}) {
  const nav = opts.nav === false ? "" : `<nav class="nav" aria-label="Back office"><a href="/admin/">Overview</a><a href="/admin/members">Members</a><a href="/admin/logout">Log out</a></nav>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Odds or Even back office</title>
<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/admin.css"></head>
<body class="adm"><header class="top"><div class="wrap top-in"><a class="brand" href="/admin/"><span>Odds <em>or</em> Even · back office</span></a>${nav}</div></header>
<main class="wrap">${opts.flash ? `<p class="adm-flash">${esc(opts.flash)}</p>` : ""}${body}</main></body></html>`;
  return new Response(html, {
    status: opts.status || 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "same-origin",       // "no-referrer" made browsers send Origin: null on our own forms
      "x-frame-options": "DENY",
      ...(opts.headers || {}),
    },
  });
}

export const go = (location, extra = {}) =>
  new Response(null, { status: 303, headers: { location, "cache-control": "no-store", ...extra } });

export { sha, nowIso };
