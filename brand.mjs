#!/usr/bin/env node
// Applies site.config.json to every page. Rename = edit site.config.json, run `node brand.mjs`.
// Rewrites the regions between <!-- brand:X --> ... <!-- /brand:X --> markers.
import { readFileSync, writeFileSync } from "node:fs";
const c = JSON.parse(readFileSync(new URL("./site.config.json", import.meta.url)));
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fill = s => s.replace(/\{(\w+)\}/g, (_, k) => c[k] ?? "");
const wordmark = `<span class="logo-text">${esc(c.wordmark.base)}<span class="logo-accent">${esc(c.wordmark.accent)}</span></span>`;
for (const page of Object.keys(c.pages)) {
  const file = new URL(`./${page}.html`, import.meta.url);
  const p = c.pages[page], title = fill(p.title), desc = fill(p.description);
  const url = `${c.url}/${page === "index" ? "" : page + ".html"}`;
  const blocks = {
    head: `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="application-name" content="${esc(c.name)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(c.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:locale" content="${esc(c.locale)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">`,
    logo: `<a class="logo" href="index.html" aria-label="${esc(c.name)} home"><img class="logo-mark" src="assets/favicon.svg" alt="" width="32" height="32">${wordmark}</a>`,
    footer: `<div>${wordmark.replace('class="logo-text"','class="logo-text footer-mark"')} · ${esc(c.tagline)}</div>`,
    "sponsor-email": `<a href="mailto:${esc(c.sponsorEmail)}">${esc(c.sponsorEmail)}</a>`,
    "sponsor-btn": `<a class="btn secondary" href="mailto:${esc(c.sponsorEmail)}?subject=${encodeURIComponent("Sponsorship enquiry - " + c.name)}">Email about sponsorship</a>`,
  };
  let html = readFileSync(file, "utf8");
  for (const [k, v] of Object.entries(blocks))
    html = html.replace(new RegExp(`<!-- brand:${k} -->[\\s\\S]*?<!-- /brand:${k} -->`, "g"), `<!-- brand:${k} -->${v}<!-- /brand:${k} -->`);
  writeFileSync(file, html);
  console.log("branded", page + ".html");
}
