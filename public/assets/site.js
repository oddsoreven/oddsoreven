/* Odds or Even: decimal / American switch (remembered in this browser) and kick-off times in the visitor's own time zone.
   Without this script the page still shows decimal odds and Central European times. */
(function () {
  var KEY = "oe-odds";
  function fmt(d, mode, comma) {
    if (mode === "us") {
      var a = d >= 2 ? "+" + Math.round((d - 1) * 100) : "−" + Math.round(100 / (d - 1));
      return a;
    }
    var s = d.toFixed(2);
    return comma ? s.replace(".", ",") : s;
  }
  function apply(mode) {
    var comma = /^(it|es)/.test(document.documentElement.lang);
    document.querySelectorAll(".o[data-d]").forEach(function (el) {
      var d = parseFloat(el.getAttribute("data-d"));
      if (d > 1) el.textContent = fmt(d, mode, comma);
    });
    document.querySelectorAll(".switch button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-fmt") === mode ? "true" : "false");
    });
  }
  function load() { try { return localStorage.getItem(KEY) || "dec"; } catch (e) { return "dec"; } }
  function save(m) { try { localStorage.setItem(KEY, m); } catch (e) {} }
  function localTimes() {
    var lang = document.documentElement.lang || "en";
    var zone;
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return; }
    if (!zone || zone === "Europe/Rome" || zone === "Europe/Madrid" || zone === "Europe/Paris" || zone === "Europe/Berlin") return;
    document.querySelectorAll("time[data-utc]").forEach(function (t) {
      var d = new Date(t.getAttribute("data-utc"));
      if (isNaN(d)) return;
      try {
        t.textContent = d.toLocaleString(lang, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" });
      } catch (e) {}
    });
  }
  /* Scores strip (18 Oct 2026): each card's state from the reader's clock, the same rule as oe_build.py strip_state.
     up = before tip-off, live = LIVE link to the official game page, soon = RESULT SOON until graded,
     final = FINAL and our score, gone = off the strip. Times shown short, in the visitor's own time zone. */
  var LIVE_H = 2.5, FINAL_KEEP_H = 24, SOON_DROP_H = 72, AHEAD_DAYS = 9, HOUR = 3600e3;
  function stripState(li, now) {
    var t = Date.parse(li.getAttribute("data-tip"));
    if (isNaN(t)) return null;
    if (li.getAttribute("data-final") === "1") return now > t + (LIVE_H + FINAL_KEEP_H) * HOUR ? "gone" : "final";
    if (now < t) return t - now > AHEAD_DAYS * 24 * HOUR ? "gone" : "up";
    if (now < t + LIVE_H * HOUR) return "live";
    return now > t + SOON_DROP_H * HOUR ? "gone" : "soon";
  }
  function strip() {
    var bar = document.querySelector(".sstrip");
    if (!bar) return;
    var now = Date.now(), shown = 0, first = null;
    bar.querySelectorAll(".sc").forEach(function (li) {
      var s = stripState(li, now);
      if (!s) return;
      li.className = "sc s-" + s;
      if (s !== "gone") { shown++; if (!first && s !== "final") first = li; }
    });
    bar.classList.toggle("is-empty", shown === 0);
    return first;
  }
  function stripTimes() {
    var lang = document.documentElement.lang || "en", zone;
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return; }
    if (!zone || zone === "Europe/Rome" || zone === "Europe/Madrid" || zone === "Europe/Paris" || zone === "Europe/Berlin") return;
    document.querySelectorAll(".sc-t[data-utcs]").forEach(function (t) {
      var d = new Date(t.getAttribute("data-utcs"));
      if (isNaN(d)) return;
      try { t.textContent = d.toLocaleString(lang, { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); } catch (e) {}
    });
  }
  /* Team news ticker (18 Oct 2026): items leave at their game's tip-off; with none left, the quiet "Next tip-off"
     line shows instead. Scrolls right to left when it doesn't fit (pauses on hover/touch); never moves for
     readers who ask for reduced motion - they swipe it. */
  function ticker() {
    var bar = document.querySelector(".tbar");
    if (!bar) return;
    var now = Date.now(), left = 0;
    bar.querySelectorAll(".tk-track > .tk:not(.tk-copy)").forEach(function (li) {
      var t = Date.parse(li.getAttribute("data-tip"));
      var gone = !isNaN(t) && now >= t;
      li.classList.toggle("s-gone", gone);
      if (!gone) left++;
    });
    var first = null;
    bar.querySelectorAll(".tk-next").forEach(function (n) {
      var t = Date.parse(n.getAttribute("data-tip"));
      var ok = !left && !first && !isNaN(t) && t > now;
      if (ok) first = n;
      n.classList.toggle("is-on", ok);
    });
    bar.classList.toggle("is-quiet", !left);
    bar.classList.toggle("is-empty", !left && !first);
    var track = bar.querySelector(".tk-track"), view = bar.querySelector(".tk-view");
    track.querySelectorAll(".tk-copy").forEach(function (c) { c.remove(); });
    track.classList.remove("is-moving");
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (left && !still && track.scrollWidth > view.clientWidth) {
      var w = track.scrollWidth;
      track.querySelectorAll(".tk:not(.s-gone)").forEach(function (li) {
        var c = li.cloneNode(true); c.classList.add("tk-copy"); c.setAttribute("aria-hidden", "true");
        c.querySelectorAll("a").forEach(function (a) { a.setAttribute("tabindex", "-1"); });
        track.appendChild(c);
      });
      track.style.setProperty("--tk-dur", Math.max(20, Math.round(w / 45)) + "s");
      track.classList.add("is-moving");
    }
  }
  function stripStart() {
    ticker();
    setInterval(ticker, 60000);
    var first = strip();
    stripTimes();
    var list = document.querySelector(".ss-list");
    if (list && first && list.scrollWidth > list.clientWidth) {     /* open on the live / next game, finals to its left */
      var prev = first.previousElementSibling;
      while (prev && prev.classList.contains("s-gone")) prev = prev.previousElementSibling;
      list.scrollLeft = Math.max(0, (prev || first).offsetLeft - 4);     /* .ss-list is position:relative */
    }
    setInterval(strip, 60000);
  }
  document.addEventListener("DOMContentLoaded", function () {
    apply(load());
    localTimes();
    stripStart();
    document.querySelectorAll(".switch button").forEach(function (b) {
      b.addEventListener("click", function () { var m = b.getAttribute("data-fmt"); save(m); apply(m); });
    });
  });
})();
