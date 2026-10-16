// GET /api/spots -> {"left": n, "of": 100}   (the "X of 100 founding places left" counter, counting paying members)
import { json, foundingTaken, FOUNDING_PLACES } from "../_lib/members.js";

export async function onRequestGet({ env }) {
  const taken = await foundingTaken(env.DB);
  return json({ left: Math.max(0, FOUNDING_PLACES - taken), of: FOUNDING_PLACES }, 200, { "cache-control": "public, max-age=30" });
}
