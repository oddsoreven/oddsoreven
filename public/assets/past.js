/* Odds or Even: Past picks filters (18 Oct). Without this script every pick is listed and the rounds open and close. */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.querySelector(".pfilters");
    if (!form) return;
    var none = document.querySelector(".pnomatch");
    function apply() {
      var f = {};
      form.querySelectorAll("select[data-f]").forEach(function (s) { f[s.getAttribute("data-f")] = s.value; });
      var active = Object.keys(f).some(function (k) { return f[k]; });
      var shown = 0;
      document.querySelectorAll(".pround").forEach(function (d) {
        var n = 0;
        d.querySelectorAll("tbody tr").forEach(function (tr) {
          var ok = (!f.r || tr.getAttribute("data-r") === f.r) &&
                   (!f.t || (" " + tr.getAttribute("data-t") + " ").indexOf(" " + f.t + " ") >= 0) &&
                   (!f.m || tr.getAttribute("data-m") === f.m) &&
                   (!f.res || tr.getAttribute("data-res") === f.res);
          tr.hidden = !ok;
          if (ok) n++;
        });
        d.hidden = n === 0;
        if (active && n) d.open = true;
        shown += n;
      });
      if (none) none.hidden = shown > 0;
    }
    form.addEventListener("change", apply);
    form.addEventListener("submit", function (e) { e.preventDefault(); });
  });
})();
