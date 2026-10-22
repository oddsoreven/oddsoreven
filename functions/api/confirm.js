// GET /api/confirm?t=TOKEN  -> marks the place confirmed and sends the visitor to the thank-you page.
// The first 100 confirmed addresses are founding members; later ones go on the list.
import { redirect, nowIso, prefix, langOf, foundingTaken, FOUNDING_PLACES } from "../_lib/places.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") || "";
  const db = env.DB;
  const row = /^[0-9a-f]{48}$/.test(t)
    ? await db.prepare("SELECT id, lang, confirmed_at, founding FROM places WHERE token = ?").bind(t).first()
    : null;
  if (!row) return redirect(url.origin, "/link-expired/");
  const lang = langOf(row.lang);
  if (row.confirmed_at) return redirect(url.origin, prefix(lang) + (row.founding ? "/reserved/" : "/listed/"));
  const founding = (await foundingTaken(db)) < FOUNDING_PLACES ? 1 : 0;
  await db
    .prepare("UPDATE places SET confirmed_at = ?, founding = ?, ip_hash = NULL WHERE id = ? AND confirmed_at IS NULL")
    .bind(nowIso(), founding, row.id)
    .run();
  return redirect(url.origin, prefix(lang) + (founding ? "/reserved/" : "/listed/"));
}
