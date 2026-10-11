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
  document.addEventListener("DOMContentLoaded", function () {
    apply(load());
    localTimes();
    document.querySelectorAll(".switch button").forEach(function (b) {
      b.addEventListener("click", function () { var m = b.getAttribute("data-fmt"); save(m); apply(m); });
    });
  });
})();
