// Shared helpers + page renderers. No build step, no dependencies.
(function () {
  "use strict";

  var CATEGORIES = [
    "WhatsApp & customer chat",
    "Accounts/GST & invoicing",
    "Sales & CRM",
    "Marketing & content",
    "Documents/OCR",
    "Operations & factory",
    "Hiring/HR",
    "Translation/Indian languages",
    "Agents & automation"
  ];
  var CAT_COLORS = ["#1a7f4b", "#1f3a8a", "#2f54c9", "#e8792b", "#6b3fb8", "#9a5b13", "#b83f6b", "#0f7a8a", "#16181d"];
  var NEW_DAYS = 7;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(u) {
    return /^https:\/\//i.test(u || "") ? u : "#";
  }

  function getJSON(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + " → HTTP " + r.status);
      return r.json();
    });
  }

  function loadError(el, err) {
    el.innerHTML =
      '<p class="empty">Couldn’t load data (' + esc(err.message) + "). " +
      "Open this site through a local web server, e.g. <code>python3 -m http.server</code>, not as a file.</p>";
  }

  // "Today" is the newest lastChecked date in the data, so the "new" window stays
  // stable for a static snapshot even if nobody has run update.mjs today.
  function referenceDate(tools) {
    var max = tools.reduce(function (m, t) { return t.lastChecked > m ? t.lastChecked : m; }, "");
    var today = new Date().toISOString().slice(0, 10);
    return new Date((max && max < today ? max : today) + "T00:00:00Z");
  }

  function isNew(tool, ref) {
    if (!tool.addedOn) return false;
    var added = new Date(tool.addedOn + "T00:00:00Z");
    var diff = (ref - added) / 86400000;
    return diff >= 0 && diff < NEW_DAYS;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }

  var PRICING_LABEL = { free: "Free", freemium: "Free plan", paid: "Paid", unknown: "Pricing: unverified" };

  function toolCard(t, ref) {
    var ci = CATEGORIES.indexOf(t.category);
    var color = CAT_COLORS[ci < 0 ? 8 : ci];
    var price = t.priceINR != null ? " · from ₹" + esc(t.priceINR) : "";
    return (
      '<article class="card">' +
        '<div class="card-top">' +
          '<div class="avatar" style="background:' + color + '" aria-hidden="true">' + esc(t.name.charAt(0)) + "</div>" +
          "<div style=\"min-width:0\"><h3>" + esc(t.name) + "</h3>" +
          '<div class="cat">' + esc(t.category) + "</div></div>" +
        "</div>" +
        (isNew(t, ref) ? '<div><span class="new-badge">New this week</span></div>' : "") +
        '<p class="one">' + esc(t.oneLiner) + "</p>" +
        '<p class="use"><b>Use it for</b>' + esc(t.smeUseCase) + "</p>" +
        '<div class="card-foot">' +
          '<div class="tags"><span class="tag ' + esc(t.pricing) + '">' + esc(PRICING_LABEL[t.pricing] || t.pricing) + price + "</span></div>" +
          '<a class="visit" href="' + esc(safeUrl(t.url)) + '" target="_blank" rel="noopener nofollow">Visit ↗</a>' +
        "</div>" +
        '<div class="checked">Link checked ' + esc(fmtDate(t.lastChecked)) + "</div>" +
      "</article>"
    );
  }

  // ---------- index.html ----------
  function initDirectory() {
    var grid = document.getElementById("tool-grid");
    if (!grid) return;
    var strip = document.getElementById("new-strip");
    var chipsEl = document.getElementById("chips");
    var search = document.getElementById("search");
    var countEl = document.getElementById("result-count");
    var state = { q: "", cat: "All" };
    var tools = [];
    var ref;

    var params = new URLSearchParams(location.search);
    if (params.get("q")) state.q = params.get("q");
    if (params.get("cat") && CATEGORIES.indexOf(params.get("cat")) >= 0) state.cat = params.get("cat");
    search.value = state.q;

    function renderChips() {
      var counts = {};
      tools.forEach(function (t) { counts[t.category] = (counts[t.category] || 0) + 1; });
      chipsEl.innerHTML = ["All"].concat(CATEGORIES).map(function (c) {
        var n = c === "All" ? tools.length : counts[c] || 0;
        return '<button type="button" class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (state.cat === c) + '">' +
          esc(c) + " <span style=\"opacity:.6\">" + n + "</span></button>";
      }).join("");
    }

    function render() {
      var q = state.q.trim().toLowerCase();
      var list = tools.filter(function (t) {
        if (state.cat !== "All" && t.category !== state.cat) return false;
        if (!q) return true;
        return [t.name, t.category, t.oneLiner, t.smeUseCase].join(" ").toLowerCase().indexOf(q) >= 0;
      });
      grid.innerHTML = list.length
        ? list.map(function (t) { return toolCard(t, ref); }).join("")
        : '<p class="empty">No tools match “' + esc(state.q) + "”. Try “GST”, “WhatsApp” or “Hindi”.</p>";
      countEl.textContent = list.length + " of " + tools.length + " tools";
      Array.prototype.forEach.call(chipsEl.children, function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-cat") === state.cat));
      });
      var p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      if (state.cat !== "All") p.set("cat", state.cat);
      var qs = p.toString();
      history.replaceState(null, "", qs ? "?" + qs : location.pathname);
    }

    chipsEl.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      state.cat = b.getAttribute("data-cat");
      render();
    });
    search.addEventListener("input", function () { state.q = search.value; render(); });

    getJSON("data/tools.json").then(function (data) {
      tools = data.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      ref = referenceDate(tools);
      var fresh = tools.filter(function (t) { return isNew(t, ref); })
        .sort(function (a, b) { return b.addedOn.localeCompare(a.addedOn); });
      strip.innerHTML = fresh.length
        ? fresh.map(function (t) { return toolCard(t, ref); }).join("")
        : '<p class="empty">Nothing new this week — check back tomorrow.</p>';
      document.getElementById("tool-total").textContent = tools.length;
      document.getElementById("new-total").textContent = fresh.length;
      var last = tools.reduce(function (m, t) { return t.lastChecked > m ? t.lastChecked : m; }, "");
      document.getElementById("last-updated").textContent = fmtDate(last);
      renderChips();
      render();
    }).catch(function (err) { loadError(grid, err); strip.innerHTML = ""; });
  }

  // ---------- use-cases.html ----------
  function initUseCases() {
    var wrap = document.getElementById("playbooks");
    if (!wrap) return;
    var toc = document.getElementById("toc");

    Promise.all([getJSON("data/usecases.json"), getJSON("data/tools.json").catch(function () { return []; })])
      .then(function (res) {
        var cases = res[0];
        var byName = {};
        res[1].forEach(function (t) { byName[t.name.toLowerCase()] = t; });

        toc.innerHTML = cases.map(function (u, i) {
          return '<a class="chip" href="#' + esc(u.id) + '" style="text-decoration:none">' + (i + 1) + ". " + esc(u.title.split(/[:(]/)[0]) + "</a>";
        }).join("");

        wrap.innerHTML = cases.map(function (u, i) {
          var tools = (u.tools || []).map(function (n) {
            var t = byName[n.toLowerCase()];
            return t
              ? '<a href="' + esc(safeUrl(t.url)) + '" target="_blank" rel="noopener nofollow">' + esc(t.name) + " ↗</a>"
              : '<a href="index.html?q=' + encodeURIComponent(n) + '">' + esc(n) + "</a>";
          }).join("");
          return (
            '<article class="card playbook" id="' + esc(u.id) + '">' +
              '<div class="num">Playbook ' + String(i + 1).padStart(2, "0") + "</div>" +
              "<h3>" + esc(u.title) + "</h3>" +
              '<div class="meta"><span class="tag">' + esc(u.category) + '</span><span class="tag unknown">' + esc(u.difficulty) + "</span></div>" +
              '<p class="problem">' + esc(u.problem) + "</p>" +
              '<ol class="steps">' + u.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
              (u.prompt
                ? '<div class="prompt-head"><span>Starter prompt</span><button type="button" class="copy" data-copy="' + i + '">Copy</button></div>' +
                  '<pre class="prompt" id="prompt-' + i + '">' + esc(u.prompt) + "</pre>"
                : "") +
              (u.caution ? '<p class="caution"><strong>Watch out:</strong> ' + esc(u.caution) + "</p>" : "") +
              '<div><div class="cat" style="margin-bottom:6px">Tools to try</div><div class="tool-links">' + tools + "</div></div>" +
            "</article>"
          );
        }).join("");

        if (location.hash) {
          var target = document.getElementById(location.hash.slice(1));
          if (target) target.scrollIntoView();
        }
      })
      .catch(function (err) { loadError(wrap, err); });

    wrap.addEventListener("click", function (e) {
      var b = e.target.closest(".copy");
      if (!b) return;
      var text = document.getElementById("prompt-" + b.getAttribute("data-copy")).textContent;
      var done = function () { b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { b.textContent = "Select & copy"; });
      else b.textContent = "Select & copy";
    });
  }

  // ---------- signup placeholder (no backend) ----------
  function initSignup() {
    var form = document.getElementById("signup-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = document.getElementById("signup-msg");
      var email = form.querySelector("input[type=email]");
      if (!email.checkValidity()) { msg.textContent = "Please enter a valid email."; return; }
      msg.textContent = "Thanks! Signups aren’t live yet. Nothing was sent or stored.";
      form.reset();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    initDirectory();
    initUseCases();
    initSignup();
  });
})();
