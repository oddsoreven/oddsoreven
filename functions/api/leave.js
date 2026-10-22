// /api/leave?t=TOKEN
//   GET  -> the "leave the list?" page (one button), so email scanners that open links can't remove anyone
//   POST -> deletes the row at once (the button, and mail apps' one-click unsubscribe), then the "you've left" page
import { redirect, prefix, langOf, json } from "../_lib/places.js";

const ok = (t) => /^[0-9a-f]{48}$/.test(t);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") || "";
  const row = ok(t) ? await env.DB.prepare("SELECT lang FROM places WHERE token = ?").bind(t).first() : null;
  const lang = langOf(row ? row.lang : "en");
  if (!row) return redirect(url.origin, prefix(lang) + "/left/");
  return redirect(url.origin, prefix(lang) + "/leave/?t=" + t);
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  let t = url.searchParams.get("t") || "";
  if (!ok(t)) {
    try {
      const f = await request.formData();
      t = String(f.get("t") || "");
    } catch (e) {}
  }
  let lang = "en";
  if (ok(t)) {
    const row = await env.DB.prepare("SELECT lang FROM places WHERE token = ?").bind(t).first();
    if (row) lang = langOf(row.lang);
    await env.DB.prepare("DELETE FROM places WHERE token = ?").bind(t).run();
  }
  if ((request.headers.get("accept") || "").includes("application/json")) return json({ ok: true });
  return redirect(url.origin, prefix(lang) + "/left/");
}
