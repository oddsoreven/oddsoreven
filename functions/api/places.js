// GET /api/places -> {"left": n, "of": 100}   (for the "X of 100 places left" counter)
import { json, foundingTaken, FOUNDING_PLACES } from "../_lib/places.js";

export async function onRequestGet({ env }) {
  const taken = await foundingTaken(env.DB);
  return json({ left: Math.max(0, FOUNDING_PLACES - taken), of: FOUNDING_PLACES }, 200, { "cache-control": "public, max-age=30" });
}
