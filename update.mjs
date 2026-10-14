#!/usr/bin/env node
// Daily maintenance for RunOnAI (runonai.in). Node 18+, no dependencies.
//
//   node update.mjs                 check links + ingest data/candidates.json
//   node update.mjs --no-links      skip link checks (only ingest candidates)
//   node update.mjs --search "cmd"  run a shell command whose stdout is a JSON
//                                   array of candidates (same shape as candidates.json)
//   node update.mjs --dry-run       print what would change, write nothing
//   node update.mjs --no-curl       don't use system curl as a fallback checker
//
// What it does:
//   1. Checks every tool URL in data/tools.json (HEAD, then GET as a fallback, with a timeout).
//   2. Writes per-tool results to data/link-report.json.
//   3. Sets lastChecked = today ONLY for tools whose link returned OK.
//   4. Appends new, de-duplicated candidates to data/pending.json for human review.
//   5. Never moves anything from pending.json into tools.json. Publishing is a manual step.

import { readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data");
const FILES = {
  tools: path.join(DATA, "tools.json"),
  report: path.join(DATA, "link-report.json"),
  pending: path.join(DATA, "pending.json"),
  candidates: path.join(DATA, "candidates.json"),
};
const CATEGORIES = [
  "WhatsApp & customer chat", "Accounts/GST & invoicing", "Sales & CRM", "Marketing & content",
  "Documents/OCR", "Operations & factory", "Hiring/HR", "Translation/Indian languages", "Agents & automation",
];
const PRICING = ["free", "freemium", "paid", "unknown"];
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const TIMEOUT_MS = 15000;
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag("--dry-run");
const today = new Date().toISOString().slice(0, 10);

async function readJSON(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJSON(file, data) {
  if (DRY) { console.log(`[dry-run] would write ${path.relative(ROOT, file)}`); return; }
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await rename(tmp, file); // atomic replace so the site never reads a half-written file
}

async function request(url, method) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method, redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
    if (method === "GET") res.body?.cancel().catch(() => {});
    return { status: res.status, finalUrl: res.url, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, error: err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : String(err.cause?.code || err.message), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// OK = 2xx/3xx. 401/403/429 usually mean bot protection (e.g. Cloudflare), not a dead site,
// so they're reported as "blocked" and lastChecked is left unchanged for a human to look at.
function classify(status) {
  if (status >= 200 && status < 400) return "ok";
  if ([401, 403, 429].includes(status)) return "blocked";
  if (status === 0) return "error";
  return "broken";
}

async function checkUrl(url) {
  let r = await request(url, "HEAD");
  // Many sites reject HEAD (405/403/etc.), so retry with GET before deciding.
  if (classify(r.status) !== "ok") {
    const g = await request(url, "GET");
    if (g.status !== 0 || r.status === 0) r = g;
  }
  // Node's fetch has a different TLS fingerprint and a 16 KB header limit, so some sites
  // (Cloudflare-protected ones, Google with large headers) fail where a browser works.
  // If system curl is available, ask it for a second opinion before reporting a failure.
  if (classify(r.status) !== "ok" && !flag("--no-curl")) {
    const c = curlCheck(url);
    if (c && classify(c.status) === "ok") r = { ...c, via: "curl", fetchStatus: r.status, fetchError: r.error };
  }
  return { ...r, result: classify(r.status) };
}

function curlCheck(url) {
  const started = Date.now();
  try {
    const out = execFileSync("curl", ["-sIL", "-m", String(TIMEOUT_MS / 1000), "-A", UA, "-o", "/dev/null", "-w", "%{http_code} %{url_effective}", url], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const [code, finalUrl] = out.trim().split(" ");
    return { status: Number(code) || 0, finalUrl, ms: Date.now() - started };
  } catch (err) {
    const out = String(err.stdout || "").trim();
    if (!out) return null; // curl missing, or a hard network failure
    const [code, finalUrl] = out.split(" ");
    return { status: Number(code) || 0, finalUrl, ms: Date.now() - started };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); }
  }));
  return out;
}

const normUrl = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase(); } catch { return String(u).toLowerCase(); } };
const normName = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function validateCandidate(c) {
  const problems = [];
  if (!c || typeof c !== "object") return ["not an object"];
  if (!c.name) problems.push("missing name");
  if (!/^https:\/\//.test(c.url || "")) problems.push("url must be https");
  if (!CATEGORIES.includes(c.category)) problems.push(`invalid category "${c.category}"`);
  if (c.pricing && !PRICING.includes(c.pricing)) problems.push(`invalid pricing "${c.pricing}"`);
  if (c.priceINR != null && !c.priceSource) problems.push("priceINR given without priceSource");
  return problems;
}

async function loadCandidates() {
  const list = [];
  const fromFile = await readJSON(FILES.candidates, null);
  if (fromFile) {
    const arr = Array.isArray(fromFile) ? fromFile : fromFile.candidates || [];
    list.push(...arr.map((c) => ({ ...c, _source: "candidates.json" })));
  }
  const cmd = opt("--search");
  if (cmd) {
    // Optional hook: any command (an agent CLI, a script, an API call) that prints a JSON array.
    try {
      const out = execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
      const arr = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
      list.push(...arr.map((c) => ({ ...c, _source: "search-hook" })));
    } catch (err) {
      console.error(`--search hook failed: ${err.message}`);
    }
  }
  return list;
}

async function main() {
  const tools = await readJSON(FILES.tools, []);
  let changed = false;

  // 1–3. Link checks
  if (!flag("--no-links")) {
    console.log(`Checking ${tools.length} links…`);
    const results = await mapLimit(tools, CONCURRENCY, async (t) => {
      const r = await checkUrl(t.url);
      const mark = { ok: "✓", blocked: "~", broken: "✗", error: "✗" }[r.result];
      console.log(`${mark} ${String(r.status).padStart(3)} ${t.name} ${r.error ? "— " + r.error : ""}`);
      return { id: t.id, name: t.name, url: t.url, ...r };
    });
    results.forEach((r, i) => {
      if (r.result === "ok" && tools[i].lastChecked !== today) { tools[i].lastChecked = today; changed = true; }
    });
    const summary = results.reduce((s, r) => ((s[r.result] = (s[r.result] || 0) + 1), s), {});
    await writeJSON(FILES.report, { generatedAt: new Date().toISOString(), summary, results });
    console.log("Summary:", summary);
    if (changed) await writeJSON(FILES.tools, tools);
  }

  // 4. Candidates → pending (never published automatically)
  const candidates = await loadCandidates();
  if (candidates.length) {
    const pending = await readJSON(FILES.pending, []);
    const seenUrl = new Set([...tools, ...pending].map((t) => normUrl(t.url)));
    const seenName = new Set([...tools, ...pending].map((t) => normName(t.name)));
    let added = 0, skipped = 0;
    for (const c of candidates) {
      const problems = validateCandidate(c);
      if (seenUrl.has(normUrl(c.url)) || seenName.has(normName(c.name))) { skipped++; continue; }
      const link = /^https:\/\//.test(c.url || "") ? await checkUrl(c.url) : { result: "error", status: 0 };
      const { _source, ...rest } = c;
      pending.push({
        ...rest,
        pricing: PRICING.includes(c.pricing) ? c.pricing : "unknown",
        priceINR: c.priceINR ?? null,
        status: "pending-review",
        source: _source,
        proposedOn: today,
        linkCheck: { result: link.result, status: link.status },
        problems,
      });
      seenUrl.add(normUrl(c.url)); seenName.add(normName(c.name));
      added++;
      console.log(`+ pending: ${c.name} (${link.result}${problems.length ? "; " + problems.join(", ") : ""})`);
    }
    await writeJSON(FILES.pending, pending);
    console.log(`Candidates: ${added} added to pending.json, ${skipped} duplicates skipped.`);
    if (existsSync(FILES.candidates) && !DRY && !flag("--keep-candidates")) {
      await rename(FILES.candidates, path.join(DATA, `candidates.processed-${today}.json`));
    }
  } else {
    console.log("No candidates to process.");
  }
  console.log("Done. Review data/pending.json manually. Nothing was published.");
}

main().catch((err) => { console.error(err); process.exit(1); });
