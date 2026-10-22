/* Odds or Even: margin calculator (22 Oct 2026, Founder.Desk 20261022-oe-08).
   Runs only in the visitor's browser: nothing is sent or stored (the decimal / American choice is the site's own,
   remembered by site.js). Margin removed in proportion to each outcome's chance (the standard method).
   Accepts decimal (1.91 or 1,91) and American (-110, +150) odds in any box. */
(function () {
  var box = document.getElementById("mc");
  if (!box) return;
  var comma = /^(it|es)/.test(document.documentElement.lang);
  var form = box.querySelector("form");
  var res = document.getElementById("mc-res");
  var bad = document.getElementById("mc-bad");

  function parseOdds(s) {
    s = (s || "").trim().replace(/−/g, "-").replace(",", ".");
    if (!s) return null;
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return NaN;
    var x = parseFloat(s);
    if (/^[+-]/.test(s) || Math.abs(x) >= 100) {            // American
      if (Math.abs(x) < 100) return NaN;
      return x > 0 ? 1 + x / 100 : 1 + 100 / -x;
    }
    return x > 1.0001 ? x : NaN;                              // decimal
  }
  function mode() {
    var b = document.querySelector('.switch button[aria-pressed="true"]');
    return b ? b.getAttribute("data-fmt") : "dec";
  }
  function fmtOdds(d) {
    if (mode() === "us") return d >= 2 ? "+" + Math.round((d - 1) * 100) : "−" + Math.round(100 / (d - 1));
    var s = d.toFixed(2);
    return comma ? s.replace(".", ",") : s;
  }
  function pct(p, dp) {
    var s = (100 * p).toFixed(dp);
    return (comma ? s.replace(".", ",") : s) + "%";
  }
  function ways() {
    var r = form.querySelector('input[name="ways"]:checked');
    return r ? parseInt(r.value, 10) : 2;
  }
  function layout() {
    var three = ways() === 3;
    box.classList.toggle("is-three", three);
    form.querySelectorAll(".mc-in").forEach(function (f) {
      var lab = f.querySelector(".mc-lab");
      lab.textContent = lab.getAttribute(three ? "data-three" : "data-two");
    });
  }
  function calc() {
    var n = ways(), odds = [], ok = true, any = false;
    var ins = (n === 3 ? ["mc-a", "mc-x", "mc-b"] : ["mc-a", "mc-b"]).map(function (id) { return document.getElementById(id); });
    for (var i = 0; i < n; i++) {
      var v = parseOdds(ins[i].value);
      if (v === null) { ok = false; continue; }
      any = true;
      if (isNaN(v)) { ok = false; ins[i].setAttribute("aria-invalid", "true"); continue; }
      ins[i].removeAttribute("aria-invalid");
      odds.push(v);
    }
    bad.hidden = ok || !any;
    if (!ok) { res.hidden = true; return; }
    var imp = odds.map(function (o) { return 1 / o; });
    var book = imp.reduce(function (a, b) { return a + b; }, 0);
    document.getElementById("mc-margin").textContent = pct(book - 1, 1);
    document.getElementById("mc-book").textContent = pct(book, 1);
    var rows = res.querySelectorAll("tbody tr");
    rows.forEach(function (tr, i) {
      tr.hidden = i >= n;
      if (i >= n) return;
      var lab = ins[i].closest(".mc-in").querySelector(".mc-lab").textContent;
      var p = imp[i] / book;
      tr.children[0].textContent = lab;
      tr.children[1].textContent = fmtOdds(odds[i]);
      tr.children[2].textContent = pct(imp[i], 1);
      tr.children[3].textContent = pct(p, 1);
      tr.children[4].textContent = fmtOdds(1 / p);
    });
    res.hidden = false;
  }
  form.addEventListener("input", calc);
  form.addEventListener("change", function () { layout(); calc(); });
  form.addEventListener("submit", function (e) { e.preventDefault(); calc(); });
  document.querySelectorAll(".switch button").forEach(function (b) {
    b.addEventListener("click", function () { setTimeout(calc, 0); });  /* site.js flips the switch first */
  });
  layout();
  calc();
})();

/* Value bet calculator (22 Oct 2026, Founder.Desk 20261022-oe-09): the sharp book's prices with the margin taken out
   (proportional) give the fair chance; the offered price on the chosen side against it gives the edge.
   Stake: a quarter of Kelly, never more than 2% of the bankroll. Nothing sent or stored. */
(function () {
  var box = document.getElementById("vc");
  if (!box) return;
  var comma = /^(it|es)/.test(document.documentElement.lang);
  var form = box.querySelector("form");
  var res = document.getElementById("vc-res");
  var bad = document.getElementById("vc-bad");
  var CAP = 0.02, FRACTION = 0.25;
  function parseOdds(s) {
    s = (s || "").trim().replace(/−/g, "-").replace(",", ".");
    if (!s) return null;
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return NaN;
    var x = parseFloat(s);
    if (/^[+-]/.test(s) || Math.abs(x) >= 100) {
      if (Math.abs(x) < 100) return NaN;
      return x > 0 ? 1 + x / 100 : 1 + 100 / -x;
    }
    return x > 1.0001 ? x : NaN;
  }
  function parseNum(s) {
    s = (s || "").trim().replace(/\s/g, "");
    if (!s) return null;
    s = comma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    var x = parseFloat(s);
    return isFinite(x) && x > 0 ? x : NaN;
  }
  function mode() {
    var b = document.querySelector('.switch button[aria-pressed="true"]');
    return b ? b.getAttribute("data-fmt") : "dec";
  }
  function fmtOdds(d) {
    if (mode() === "us") return d >= 2 ? "+" + Math.round((d - 1) * 100) : "−" + Math.round(100 / (d - 1));
    var s = d.toFixed(2);
    return comma ? s.replace(".", ",") : s;
  }
  function pct(p, dp, sign) {
    var s = (100 * Math.abs(p)).toFixed(dp);
    if (comma) s = s.replace(".", ",");
    return (sign ? (p > 0 ? "+" : p < 0 ? "−" : "") : (p < 0 ? "−" : "")) + s + "%";
  }
  function money(x) {
    var s = x.toFixed(x < 100 ? 2 : 0);
    if (comma) s = s.replace(".", ",");
    return s;
  }
  function ways() {
    var r = form.querySelector('input[name="vways"]:checked');
    return r ? parseInt(r.value, 10) : 2;
  }
  function ids() { return ways() === 3 ? ["vc-a", "vc-x", "vc-b"] : ["vc-a", "vc-b"]; }
  function layout() {
    var three = ways() === 3;
    box.classList.toggle("is-three", three);
    form.querySelectorAll(".mc-in .mc-lab[data-two]").forEach(function (lab) {
      lab.textContent = lab.getAttribute(three ? "data-three" : "data-two");
    });
    var sel = document.getElementById("vc-side"), keep = sel.value;
    sel.innerHTML = "";
    ids().forEach(function (id) {
      var o = document.createElement("option");
      o.value = id;
      o.textContent = document.querySelector('label[for="' + id + '"] .mc-lab').textContent;
      sel.appendChild(o);
    });
    if ([].some.call(sel.options, function (o) { return o.value === keep; })) sel.value = keep;
  }
  function calc() {
    var list = ids(), odds = [], ok = true, any = false;
    list.forEach(function (id) {
      var el = document.getElementById(id), v = parseOdds(el.value);
      if (v === null) { ok = false; return; }
      any = true;
      if (isNaN(v)) { ok = false; el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid");
      odds.push(v);
    });
    var offEl = document.getElementById("vc-offer"), off = parseOdds(offEl.value);
    if (off === null) ok = false; else if (isNaN(off)) { ok = false; offEl.setAttribute("aria-invalid", "true"); any = true; } else offEl.removeAttribute("aria-invalid");
    var bankEl = document.getElementById("vc-bank"), bank = parseNum(bankEl.value);
    if (bank !== null && isNaN(bank)) { bankEl.setAttribute("aria-invalid", "true"); bank = null; } else bankEl.removeAttribute("aria-invalid");
    bad.hidden = ok || !any;
    if (!ok) { res.hidden = true; return; }
    var imp = odds.map(function (o) { return 1 / o; }), book = imp.reduce(function (a, b) { return a + b; }, 0);
    var i = list.indexOf(document.getElementById("vc-side").value);
    if (i < 0) i = 0;
    var p = imp[i] / book, fairO = 1 / p, edge = p * off - 1;
    document.getElementById("vc-edge").textContent = pct(edge, 1, true);
    res.classList.toggle("is-value", edge > 0);
    res.classList.toggle("is-novalue", edge <= 0);
    document.getElementById("vc-verdict").textContent = res.getAttribute(edge > 0 ? "data-yes" : "data-no");
    document.getElementById("vc-fair").textContent = fmtOdds(fairO);
    document.getElementById("vc-chance").textContent = pct(p, 1);
    document.getElementById("vc-margin").textContent = pct(book - 1, 1);
    document.getElementById("vc-above").textContent = res.getAttribute("data-above").replace("{o}", fmtOdds(fairO));
    var st = document.getElementById("vc-stake-row"), stEl = document.getElementById("vc-stake");
    if (edge > 0) {
      var f = Math.min(FRACTION * edge / (off - 1), CAP);
      stEl.textContent = bank ? money(bank * f) : pct(f, 2);
      var sub = document.getElementById("vc-stake-sub");
      sub.textContent = bank ? res.getAttribute("data-ofbank").replace("{p}", pct(f, 2)) : "";
      sub.hidden = !bank;
      st.hidden = false;
    } else {
      st.hidden = true;
    }
    document.getElementById("vc-big").hidden = !(edge > 0.15);
    res.hidden = false;
  }
  form.addEventListener("input", calc);
  form.addEventListener("change", function (e) { if (e.target.name === "vways") layout(); calc(); });
  form.addEventListener("submit", function (e) { e.preventDefault(); calc(); });
  document.querySelectorAll(".switch button").forEach(function (b) {
    b.addEventListener("click", function () { setTimeout(calc, 0); });
  });
  layout();
  calc();
})();
