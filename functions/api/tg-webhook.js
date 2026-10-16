// POST /api/tg-webhook  (Telegram calls this for joins and leaves in the members channel; set up by /api/tg-setup)
// Someone joins through a member's invite -> that Telegram account is the member's (one account each:
// a new one replaces the old, which is taken out). A join through a member's link when the membership
// has lapsed is taken out at once. People added by hand (the owner, admins) are left alone.
import { json, nowIso, tgSecret, channelId, memberBy, isLive, removeFromChannel } from "../_lib/members.js";

export async function onRequestPost({ request, env }) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== (await tgSecret(env))) return json({ ok: false }, 401);
  let u;
  try {
    u = await request.json();
  } catch (e) {
    return json({ ok: true });
  }
  const cm = u && u.chat_member;
  if (!cm || String(cm.chat && cm.chat.id) !== String(channelId(env))) return json({ ok: true });
  const db = env.DB;
  const user = cm.new_chat_member && cm.new_chat_member.user;
  const st = cm.new_chat_member && cm.new_chat_member.status;
  if (!user || user.is_bot) return json({ ok: true });

  if (st === "member") {
    const name = (cm.invite_link && cm.invite_link.name) || "";
    const id = /^m(\d+)$/.test(name) ? Number(name.slice(1)) : null;
    if (!id) return json({ ok: true }); // added by hand or through an admin link
    const m = await memberBy(db, "id", id);
    if (!isLive(m)) {
      await removeFromChannel(env, user.id);
      return json({ ok: true });
    }
    if (m.tg_user_id && Number(m.tg_user_id) !== Number(user.id)) await removeFromChannel(env, m.tg_user_id);
    // the same Telegram account can't belong to two memberships
    await db.prepare("UPDATE members SET tg_user_id = NULL WHERE tg_user_id = ? AND id != ?").bind(user.id, m.id).run();
    await db.prepare("UPDATE members SET tg_user_id = ?, tg_joined_at = ?, updated_at = ? WHERE id = ?").bind(user.id, nowIso(), nowIso(), m.id).run();
  } else if (st === "left" || st === "kicked") {
    await db.prepare("UPDATE members SET tg_user_id = NULL, updated_at = ? WHERE tg_user_id = ?").bind(nowIso(), user.id).run();
  }
  return json({ ok: true });
}

export async function onRequest() {
  return json({ ok: false, error: "method" }, 405, { allow: "POST" });
}
