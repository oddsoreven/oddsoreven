/* Odds or Even: founding-places sign-up and (16 Oct) paid membership. Loaded only when the sign-up is switched on.
   Without this script the forms still work (plain post: check-your-inbox page, or straight to Stripe's checkout). */
(function () {
  function msg(el, text, state) {
    if (!el) return;
    el.textContent = text;
    el.setAttribute("data-state", state || "");
  }
  function counter() {
    var els = document.querySelectorAll("[data-places]");
    if (!els.length) return;
    fetch(els[0].getAttribute("data-src") || "/api/places", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || typeof d.left !== "number") return;
        els.forEach(function (el) {
          el.textContent = d.left > 0 ? el.getAttribute("data-left").replace("{n}", d.left) : el.getAttribute("data-full");
        });
      })
      .catch(function () {});
  }
  function form(f) {
    var box = f.closest(".found");
    var out = box && box.querySelector(".found-msg");
    var btn = f.querySelector("button[type=submit]");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = f.querySelector("input[name=email]");
      if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { msg(out, out.getAttribute("data-invalid"), "err"); email.focus(); return; }
      if (f.querySelector("input[name=adult]") && (!f.querySelector("input[name=adult]").checked || !f.querySelector("input[name=agree]").checked)) { msg(out, out.getAttribute("data-consent"), "err"); return; }
      btn.setAttribute("aria-busy", "true"); btn.disabled = true;
      fetch(f.action, { method: "POST", body: new FormData(f), headers: { accept: "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: "error" }; }); })
        .then(function (d) {
          if (d && d.ok && d.url) { location.href = d.url; return "away"; }       // membership: on to Stripe's checkout
          if (d && d.ok) { msg(out, out.getAttribute("data-check"), "ok"); box.classList.add("done"); return; }
          var k = d && d.error;
          msg(out, out.getAttribute("data-" + (k === "invalid" || k === "consent" || k === "busy" || k === "member" ? k : "error")) || out.getAttribute("data-error"), "err");
        })
        .catch(function () { msg(out, out.getAttribute("data-error"), "err"); })
        .then(function (state) { if (state !== "away") { btn.removeAttribute("aria-busy"); btn.disabled = false; } });
    });
    f.querySelectorAll("input").forEach(function (i) { i.addEventListener("input", function () { if (out.getAttribute("data-state") === "err") msg(out, "", ""); }); });
  }
  function joined(el) {        // thank-you page after paying: ask the site for the member's Telegram link
    var s = new URLSearchParams(location.search).get("s");
    var out = el.querySelector(".joined-msg"), a = el.querySelector(".joined-btn"), tries = 0;
    if (!s) { out.textContent = el.getAttribute("data-fail"); return; }
    (function ask() {
      fetch("/api/invite?s=" + encodeURIComponent(s), { headers: { accept: "application/json" } })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d && d.ok) {
            a.href = d.tg; a.hidden = false;
            out.textContent = d.founding && d.n ? el.getAttribute("data-founding").replace("{n}", d.n) : "";
            return;
          }
          if (d && d.error === "unpaid" && ++tries < 6) { setTimeout(ask, 2500); return; }   // the card can take a few seconds
          out.textContent = el.getAttribute("data-fail");
        })
        .catch(function () { out.textContent = el.getAttribute("data-fail"); });
    })();
  }
  document.addEventListener("DOMContentLoaded", function () {
    counter();
    document.querySelectorAll("[data-joined]").forEach(joined);
    document.querySelectorAll(".found-form").forEach(form);
    var q = new URLSearchParams(location.search);
    var t = q.get("t"), lf = document.querySelector(".leave-form input[name=t]");  // leave page: carry the link's token into the button
    if (t && lf) lf.value = t;
  });
})();
