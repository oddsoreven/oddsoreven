/* Odds or Even: founding-places sign-up. Loaded only when the sign-up is switched on.
   Without this script the form still works (plain post, then the check-your-inbox page). */
(function () {
  function msg(el, text, state) {
    if (!el) return;
    el.textContent = text;
    el.setAttribute("data-state", state || "");
  }
  function counter() {
    var els = document.querySelectorAll("[data-places]");
    if (!els.length) return;
    fetch("/api/places", { headers: { accept: "application/json" } })
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
      if (!f.querySelector("input[name=adult]").checked || !f.querySelector("input[name=agree]").checked) { msg(out, out.getAttribute("data-consent"), "err"); return; }
      btn.setAttribute("aria-busy", "true"); btn.disabled = true;
      fetch(f.action, { method: "POST", body: new FormData(f), headers: { accept: "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: "error" }; }); })
        .then(function (d) {
          if (d && d.ok) { msg(out, out.getAttribute("data-check"), "ok"); box.classList.add("done"); return; }
          var k = d && d.error;
          msg(out, out.getAttribute("data-" + (k === "invalid" || k === "consent" || k === "busy" ? k : "error")), "err");
        })
        .catch(function () { msg(out, out.getAttribute("data-error"), "err"); })
        .then(function () { btn.removeAttribute("aria-busy"); btn.disabled = false; });
    });
    f.querySelectorAll("input").forEach(function (i) { i.addEventListener("input", function () { if (out.getAttribute("data-state") === "err") msg(out, "", ""); }); });
  }
  document.addEventListener("DOMContentLoaded", function () {
    counter();
    document.querySelectorAll(".found-form").forEach(form);
    var q = new URLSearchParams(location.search);
    var t = q.get("t"), lf = document.querySelector(".leave-form input[name=t]");  // leave page: carry the link's token into the button
    if (t && lf) lf.value = t;
  });
})();
