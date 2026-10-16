// /admin/*  Odds or Even back office (for Matt only). English only, hidden from search engines.
//   /admin/login     ask for a one-time login link (sent only to the admin address)
//   /admin/auth      the link from the email: sets a 12-hour cookie
//   /admin/          overview: members by status, founding places, this month's income, failed payments, newest
//   /admin/members   search and list; ?format=csv downloads the list
//   /admin/member    one member: details, resend their links, take them out of Telegram, open in Stripe
//   /admin/logout
import { ADMIN_EMAIL, ensureTables, loginLink, useLink, recentLinks, sessionCookie, clearCookie, isAdmin, sameOrigin, page, go, esc } from "../_lib/admin.js";
import { memberBy, sendWelcome, removeFromChannel, FOUNDING_PLACES, foundingTaken, nowIso } from "../_lib/members.js";
import { validEmail } from "../_lib/places.js";

const PRICE_EUR = 10;
const LABEL = { active: "Active", ending: "Cancelling", past_due: "Card problem", ended: "Ended", pending: "Checkout not paid" };
const day = (s) => (s ? String(s).slice(0, 10) : "–");

function route(url) {
  return url.pathname.replace(/^\/admin\/?/, "").replace(/\/$/, "");
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const r = route(url);
  await ensureTables(env.DB);
  if (request.method === "POST" && !sameOrigin(request)) return page("Refused", "<p>Refused.</p>", { status: 403, nav: false });

  if (r === "login") return login(request, env, url);
  if (r === "auth") {
    const ok = await useLink(env, url.searchParams.get("n"), url.searchParams.get("e"), url.searchParams.get("s"));
    if (!ok) return page("Link expired", `<h1 class="h1">This link doesn't work</h1><p>It may be older than 15 minutes or already used.</p><p><a href="/admin/login">Ask for a new one →</a></p>`, { nav: false, status: 403 });
    return go("/admin/", { "set-cookie": await sessionCookie(env) });
  }
  if (r === "logout") return go("/admin/login", { "set-cookie": clearCookie() });

  if (!(await isAdmin(env, request))) return go("/admin/login");
  if (r === "") return overview(env);
  if (r === "members") return members(env, url);
  if (r === "member") return request.method === "POST" ? memberAction(request, env, url) : member(env, url);
  return page("Not found", "<p>Not found.</p>", { status: 404 });
}

// ------------------------------------------------------------------ login
async function login(request, env, url) {
  const form = (msg) =>
    page("Log in", `<h1 class="h1">Back office</h1>${msg ? `<p class="adm-ok">${esc(msg)}</p>` : ""}
<form class="subform adm-login" method="post" action="/admin/login"><label for="ae" class="vh">Email</label>
<input id="ae" name="email" type="email" required autocomplete="email" placeholder="Admin email"><button type="submit">Send me a login link</button></form>
<p class="sm">The link works once, for 15 minutes, and keeps you logged in on this browser for 12 hours.</p>`, { nav: false });
  if (request.method !== "POST") return form("");
  let email = "";
  try {
    email = String((await request.formData()).get("email") || "").trim().toLowerCase();
  } catch (e) {}
  if (validEmail(email) && email === ADMIN_EMAIL(env) && (await recentLinks(env.DB)) < 3) {
    const link = await loginLink(env, url.origin);
    await mail(env, ADMIN_EMAIL(env), "Your back office login link",
      `Log in to the Odds or Even back office (works once, for 15 minutes):\n${link}\n\nDidn't ask for this? Ignore it; nobody can log in without this link.`);
  }
  return form("If that's the admin address, a login link is on its way. Check the inbox.");   // same answer either way
}

async function mail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Odds or Even <contact@oddsoreven.com>", to: [to], subject, text }),
  });
}

// ------------------------------------------------------------------ overview
async function overview(env) {
  const db = env.DB;
  const rows = (await db.prepare("SELECT status, COUNT(*) AS n FROM members GROUP BY status").all()).results || [];
  const c = Object.fromEntries(rows.map((x) => [x.status, x.n]));
  const n = (k) => c[k] || 0;
  const paying = n("active") + n("past_due") + n("ending");
  const left = Math.max(0, FOUNDING_PLACES - (await foundingTaken(db)));
  const inTg = (await db.prepare("SELECT COUNT(*) AS n FROM members WHERE tg_user_id IS NOT NULL AND status IN ('active','past_due','ending')").first()).n;
  const cut = new Date(Date.now() - 30 * 864e5).toISOString();
  const failed = (await db.prepare("SELECT id, email, payment_failed_at, status FROM members WHERE payment_failed_at > ? ORDER BY payment_failed_at DESC LIMIT 20").bind(cut).all()).results || [];
  const newest = (await db.prepare("SELECT id, email, lang, paid_at, founding_no, status FROM members WHERE paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 10").all()).results || [];
  const tile = (num, label) => `<div><div class="num">${esc(num)}</div><div class="sm">${esc(label)}</div></div>`;
  const list = (xs, f) => (xs.length ? `<ul class="adm-list">${xs.map(f).join("")}</ul>` : `<p class="sm">None.</p>`);
  const who = (m) => `<a href="/admin/member?id=${m.id}">${esc(m.email)}</a>`;
  const body = `<h1 class="h1">Overview</h1>
<div class="box adm-tiles">${tile(paying, "paying members")}${tile("€" + paying * PRICE_EUR, "this month (" + paying + " × €" + PRICE_EUR + ")")}${tile(n("active"), "renewing next month")}${tile(left + " of " + FOUNDING_PLACES, "founding places left")}</div>
<div class="box adm-tiles">${tile(n("active"), "active")}${tile(n("ending"), "cancelling")}${tile(n("past_due"), "card problem")}${tile(n("ended"), "ended")}${tile(inTg + " of " + paying, "in the Telegram channel")}</div>
<h2 class="h2">Failed payments, last 30 days</h2>${list(failed, (m) => `<li>${who(m)} · ${day(m.payment_failed_at)} · ${esc(LABEL[m.status] || m.status)}</li>`)}
<h2 class="h2">Newest members</h2>${list(newest, (m) => `<li>${who(m)} · ${esc(m.lang.toUpperCase())} · joined ${day(m.paid_at)}${m.founding_no ? " · founding no. " + m.founding_no : ""} · ${esc(LABEL[m.status] || m.status)}</li>`)}
<p class="sm">Refunds, free months, receipts and payouts: in Stripe. Takings for the accountant: Stripe → Reports.</p>`;
  return page("Overview", body);
}

// ------------------------------------------------------------------ list
async function members(env, url) {
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 100);
  const st = url.searchParams.get("status") || "";
  const where = [], args = [];
  if (q) { where.push("email LIKE ?"); args.push("%" + q.replace(/[%_]/g, "") + "%"); }
  if (LABEL[st]) { where.push("status = ?"); args.push(st); }
  const sql = "SELECT * FROM members" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 2000";
  const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  if (url.searchParams.get("format") === "csv") {
    const cols = ["email", "lang", "status", "founding_no", "paid_at", "period_end", "ended_at", "payment_failed_at", "in_telegram", "stripe_customer"];
    const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = [cols.join(",")].concat(rows.map((m) => cols.map((k) => cell(k === "in_telegram" ? (m.tg_user_id ? "yes" : "no") : m[k])).join(","))).join("\r\n");
    return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="oddsoreven-members-${nowIso().slice(0, 10)}.csv"`, "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  const opt = (v, t) => `<option value="${v}"${v === st ? " selected" : ""}>${t}</option>`;
  const tr = rows.map((m) => `<tr><td><a href="/admin/member?id=${m.id}">${esc(m.email)}</a></td><td>${esc(m.lang.toUpperCase())}</td><td>${esc(LABEL[m.status] || m.status)}</td><td>${m.founding_no || "–"}</td><td>${day(m.paid_at)}</td><td>${day(m.period_end)}</td><td>${m.tg_user_id ? "yes" : "no"}</td></tr>`).join("");
  const csvLink = "/admin/members?" + new URLSearchParams({ q, status: st, format: "csv" }).toString();
  const body = `<h1 class="h1">Members</h1>
<form class="subform adm-search" method="get" action="/admin/members"><label for="aq" class="vh">Search</label><input id="aq" name="q" value="${esc(q)}" placeholder="Search by email">
<label for="as" class="vh">Status</label><select id="as" name="status">${opt("", "Any status")}${Object.entries(LABEL).map(([k, t]) => opt(k, t)).join("")}</select><button type="submit">Search</button></form>
<p class="sm">${rows.length} shown · <a href="${esc(csvLink)}">Download as CSV</a></p>
<div class="tablebox"><table class="t"><thead><tr><th>Email</th><th>Lang</th><th>Status</th><th>Founding</th><th>Joined</th><th>Paid until</th><th>Telegram</th></tr></thead><tbody>${tr || '<tr><td colspan="7">Nobody yet.</td></tr>'}</tbody></table></div>`;
  return page("Members", body);
}

// ------------------------------------------------------------------ one member
async function member(env, url) {
  const m = await memberBy(env.DB, "id", Number(url.searchParams.get("id")) || 0);
  if (!m) return page("Not found", "<p>No such member.</p><p><a href='/admin/members'>Back to members</a></p>", { status: 404 });
  const test = String(env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
  const stripeUrl = m.stripe_customer ? `https://dashboard.stripe.com/${test ? "test/" : ""}customers/${encodeURIComponent(m.stripe_customer)}` : "";
  const flash = { resent: "Welcome email sent again.", removed: "Taken out of the Telegram channel.", notlive: "Not sent: this membership isn't active.", failed: "That didn't work. Try again in a minute." }[url.searchParams.get("done")] || "";
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const live = ["active", "past_due", "ending"].includes(m.status);
  const body = `<p class="crumbs"><a href="/admin/members">Members</a></p><h1 class="h1 adm-email">${esc(m.email)}</h1>
<div class="tablebox"><table class="t adm-kv"><tbody>
${row("Status", esc(LABEL[m.status] || m.status) + (m.status === "ending" ? " · keeps access until " + day(m.period_end) : ""))}
${row("Language", esc(m.lang.toUpperCase()))}
${row("Founding", m.founding_no ? "no. " + m.founding_no + (m.founding ? "" : " (deal lost on cancelling)") : "–")}
${row("Joined", day(m.paid_at))}${row("Paid until", day(m.period_end))}${row("Ended", day(m.ended_at))}
${row("Last failed payment", day(m.payment_failed_at))}
${row("Telegram", m.tg_user_id ? "in the channel since " + day(m.tg_joined_at) : "not in the channel")}
${row("Welcome email", m.welcome_sent_at ? "sent " + day(m.welcome_sent_at) : "not sent")}
</tbody></table></div>
<div class="btns adm-actions">
${live ? `<form method="post" action="/admin/member?id=${m.id}"><input type="hidden" name="action" value="resend"><button class="btn" type="submit">Resend their links</button></form>` : ""}
${m.tg_user_id ? `<form method="post" action="/admin/member?id=${m.id}"><input type="hidden" name="action" value="remove"><button class="btn btn2" type="submit">Remove from Telegram now</button></form>` : ""}
${stripeUrl ? `<a class="btn btn2" href="${esc(stripeUrl)}" rel="noopener" target="_blank">Open in Stripe</a>` : ""}
</div>
<p class="sm">Refund, free month, cancel or change the plan: use "Open in Stripe". The site follows what Stripe reports.</p>`;
  return page(m.email, body, { flash });
}

async function memberAction(request, env, url) {
  const id = Number(url.searchParams.get("id")) || 0;
  const m = await memberBy(env.DB, "id", id);
  if (!m) return go("/admin/members");
  let action = "";
  try {
    action = String((await request.formData()).get("action") || "");
  } catch (e) {}
  let done = "failed";
  if (action === "resend") {
    if (!["active", "past_due", "ending"].includes(m.status)) done = "notlive";
    else if ((await sendWelcome(env, url.origin, m)).ok) done = "resent";
  } else if (action === "remove" && m.tg_user_id) {
    await removeFromChannel(env, m.tg_user_id);
    await env.DB.prepare("UPDATE members SET tg_user_id = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), m.id).run();
    done = "removed";
  }
  return go(`/admin/member?id=${m.id}&done=${done}`);
}
