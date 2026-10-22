// Odds or Even: founding places. Shared helpers for the /api/* functions.
// Needs, in the Cloudflare Pages project settings:
//   D1 binding        DB              (database holding the "places" table, schema in places_schema.sql)
//   Secret            RESEND_API_KEY  (Resend API key, sending domain oddsoreven.com)
// Optional:          MAIL_FROM       (default "Odds or Even <contact@oddsoreven.com>")
//                    DEV = "1"       (local testing only: no email is sent, the links come back in the reply)

export const FOUNDING_PLACES = 100;
const LANGS = ["en", "it", "es"];

export function langOf(x) {
  return LANGS.includes(x) ? x : "en";
}

export function prefix(lang) {
  return lang === "en" ? "" : "/" + lang;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

export function redirect(origin, path) {
  return new Response(null, { status: 303, headers: { location: origin + path, "cache-control": "no-store" } });
}

export function token() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function nowIso() {
  return new Date().toISOString();
}

export function validEmail(e) {
  return typeof e === "string" && e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(e);
}

export async function foundingTaken(db) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM places WHERE confirmed_at IS NOT NULL AND founding = 1").first();
  return r ? r.n : 0;
}

// ------------------------------------------------------------------ email texts (EN / IT / ES)
const MAIL = {
  en: {
    subject: "Confirm your founding place · Odds or Even",
    intro: "Click the link below to confirm your founding place:",
    deal: "The first 100 confirmed members lock €10 a month for life when membership opens. Nothing to pay now.",
    ignore: "Didn't ask for this? Ignore this email and nothing happens.",
    leave: "Leave this list and delete your details:",
    button: "Confirm my place",
  },
  it: {
    subject: "Conferma il tuo posto da socio fondatore · Odds or Even",
    intro: "Clicca il link qui sotto per confermare il tuo posto da socio fondatore:",
    deal: "I primi 100 iscritti confermati bloccano €10 al mese per sempre quando apre l'abbonamento. Oggi non paghi nulla.",
    ignore: "Non l'hai chiesto tu? Ignora questa email e non succede nulla.",
    leave: "Esci dalla lista e cancella i tuoi dati:",
    button: "Conferma il mio posto",
  },
  es: {
    subject: "Confirma tu plaza de miembro fundador · Odds or Even",
    intro: "Haz clic en el enlace de abajo para confirmar tu plaza de miembro fundador:",
    deal: "Los primeros 100 miembros confirmados fijan 10 € al mes para siempre cuando abra la suscripción. Hoy no pagas nada.",
    ignore: "¿No lo has pedido tú? Ignora este correo y no pasará nada.",
    leave: "Salir de la lista y borrar tus datos:",
    button: "Confirmar mi plaza",
  },
};

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export async function sendConfirm(env, { to, lang, confirmUrl, leaveUrl }) {
  const T = MAIL[lang] || MAIL.en;
  const text = `${T.intro}\n${confirmUrl}\n\n${T.deal}\n\n${T.ignore}\n\nOdds or Even · oddsoreven.com\n${T.leave} ${leaveUrl}\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#17141a;max-width:520px">
<p>${escHtml(T.intro)}</p>
<p><a href="${escHtml(confirmUrl)}" style="display:inline-block;background:#E08A4E;color:#17141a;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">${escHtml(T.button)}</a></p>
<p>${escHtml(T.deal)}</p>
<p style="color:#6b6470;font-size:14px">${escHtml(T.ignore)}</p>
<p style="color:#6b6470;font-size:13px">Odds or Even · <a href="https://oddsoreven.com" style="color:#9C4E1C">oddsoreven.com</a><br>${escHtml(T.leave)} <a href="${escHtml(leaveUrl)}" style="color:#9C4E1C">${escHtml(leaveUrl)}</a></p>
</div>`;
  if (env.DEV === "1" && !env.RESEND_API_KEY) return { ok: true, dev: true };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Odds or Even <contact@oddsoreven.com>",
      to: [to],
      subject: T.subject,
      text,
      html,
      headers: { "List-Unsubscribe": `<${leaveUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  return { ok: r.ok, status: r.status };
}
