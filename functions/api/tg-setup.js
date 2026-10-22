// GET /api/tg-setup  (open once in the browser after a deploy)
// Points the members bot at this site's /api/tg-webhook, for channel joins and leaves only.
// It refuses if the bot already reports to a different address, so a staging copy can never
// take the bot away from the live site; it can only (re)connect to the address it runs on.
import { json, tg, tgSecret } from "../_lib/members.js";

export async function onRequestGet({ request, env }) {
  const want = new URL(request.url).origin + "/api/tg-webhook";
  let info;
  try {
    info = await tg(env, "getWebhookInfo", {});
  } catch (e) {
    return json({ ok: false, error: "The bot token doesn't work: " + String(e).slice(0, 120) }, 500);
  }
  if (info.url && info.url !== want) return json({ ok: false, error: "The bot already reports to another address", current: info.url }, 409);
  await tg(env, "setWebhook", { url: want, secret_token: await tgSecret(env), allowed_updates: ["chat_member"], drop_pending_updates: true });
  const after = await tg(env, "getWebhookInfo", {});
  return json({ ok: after.url === want, connected_to: after.url, pending: after.pending_update_count, last_error: after.last_error_message || null });
}
