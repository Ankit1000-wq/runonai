# RunOnAI

**Run your business on AI — tools and how-tos, updated daily.** · runonai.in (domain not purchased yet)

## Branding (one config change)

All brand text lives in `site.config.json`: name, wordmark (`RunOn` + accented `AI`), domain/URL, tagline, descriptions, page titles, sponsor email. To rename, edit that file and run:

```
node brand.mjs
```

It rewrites the `<!-- brand:* -->` regions in every page: `<title>`, meta description, canonical, Open Graph/Twitter tags, favicon link, header logo, footer line, and the sponsor email/button. The output is static HTML, so crawlers and link previews see it without running JS. The logo mark and favicon are `assets/favicon.svg`. The accent colour is `--accent` in `assets/styles.css`.

A static, daily-checked directory of real AI tools and step-by-step playbooks for Indian SME owners (factories, traders, distributors and small manufacturers).

Curated by Ankit Agarwal (Mumbai), who runs Omni Cans and Printers and teaches AI workshops for SMEs.

It's plain HTML, CSS and JS: no build step, no frameworks, no npm dependencies.

## Run locally

The pages load JSON with `fetch`, so they need an HTTP server. Opening the files directly (`file://`) won't work.

```bash
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

## Files

| Path | What it is |
|---|---|
| `index.html` | Hero, search, category chips, "New this week" strip, tool grid, signup form (placeholder with no backend) |
| `use-cases.html` | 12 playbooks rendered from `data/usecases.json` |
| `sponsor.html` | Sponsorship tiers ("pricing on request") and contacts (placeholders) |
| `assets/styles.css`, `assets/app.js` | All styling and rendering |
| `data/tools.json` | **Published** tools: the only list the site shows |
| `data/usecases.json` | Playbooks (steps, starter prompt, caution, tool names) |
| `data/link-report.json` | Output of the latest link check |
| `data/pending.json` | Candidate tools waiting for **human review** (never shown on the site) |
| `data/candidates.example.json` | Template for the daily research agent's output |
| `update.mjs` | Daily maintenance script (Node 18+, no dependencies) |

### Tool fields

`id, name, url, category, oneLiner, smeUseCase, pricing, priceINR, lastChecked, addedOn`

- `category` must be one of the 9 categories listed in `update.mjs` / `assets/app.js`.
- `pricing` is one of `free`, `freemium` (a free plan exists), `paid` or `unknown`.
- `priceINR` stays `null` unless the price was checked on the vendor's own pricing page. Prices in India change often (GST, promos, regional plans), so v1 publishes **no** rupee prices.
- "New this week" is computed: any tool with an `addedOn` date in the last 7 days.

## The daily routine

```
┌────────────────────────┐   writes    ┌──────────────────────┐
│ Research agent (AI)    │ ──────────▶ │ data/candidates.json │
│ web search + checks    │             └──────────┬───────────┘
└────────────────────────┘                        │
                                     node update.mjs
                                                  │
        ┌──────────────────────────┬──────────────┴───────────┐
        ▼                          ▼                          ▼
 link check every tool    lastChecked = today       append to pending.json
 → link-report.json       (only for OK links)       (deduped, validated,
                                                     link-checked)
                                                          │
                                         HUMAN reviews pending.json and
                                         copies approved entries into
                                         tools.json (with addedOn = today)
```

1. **Research (agent, around 07:00 IST).** A scheduled AI agent (for example a Claude Code routine) searches for AI tools relevant to Indian SMEs: new launches, Indian-language AI, WhatsApp/GST/IndiaMART integrations. It verifies each one on the official site and writes `data/candidates.json` in the format of `data/candidates.example.json`. Rules for the agent:
   - Use official URLs only (https). Include `evidence` links.
   - Never guess prices. Use `"pricing": "unknown"` and `"priceINR": null` unless the price is on the vendor's own pricing page, and then also set `priceSource`.
   - Don't include tools already in `tools.json`. The script dedupes anyway.
2. **Run the script.**
   ```bash
   node update.mjs
   ```
   - Checks every URL: HEAD, then GET, with a 15 s timeout and 6 checks in parallel. If Node's fetch fails, it asks system `curl` for a second opinion, because Node gets blocked by some bot protection (Cloudflare) and can't read Google's very large response headers.
   - Results go to `data/link-report.json` as `ok`, `blocked` (401/403/429, usually bot protection), `broken` (4xx/5xx) or `error` (DNS, timeout).
   - `lastChecked` is bumped **only** for `ok` links.
   - Candidates are validated (category, https, price source), link-checked, deduped by name and URL, and **appended** to `data/pending.json` with `status: "pending-review"`. The input file is then renamed to `candidates.processed-YYYY-MM-DD.json`.
   - **Nothing is ever published automatically.**
3. **Human review (5–10 min).** Read `pending.json`, check `problems` and `linkCheck`, edit the copy, then move approved entries into `tools.json` with `addedOn` set to today, `lastChecked` set to today, and an `id`. Remove them from `pending.json`.
4. **Fix links.** Anything `broken` or `error` in `link-report.json` needs a look: the vendor may have moved, been renamed or shut down.
5. **Deploy.** Commit and push. Any static host works (GitHub Pages, Netlify, Cloudflare Pages).

### Options

```bash
node update.mjs --no-links                 # only ingest candidates
node update.mjs --dry-run                  # show what would change, write nothing
node update.mjs --no-curl                  # don't use curl as a fallback checker
node update.mjs --keep-candidates          # don't rename candidates.json after processing
node update.mjs --search "<command>"       # run a command that prints a JSON array of candidates
```

`--search` is an optional hook so research can run as part of the same job. Any command that prints a JSON candidate array to stdout works, for example an agent CLI invoked with a research prompt, or your own script calling a search API.

### Scheduling example (cron, server in IST)

```cron
# 07:00 research agent writes data/candidates.json (your agent command here)
# 07:30 link check + ingest
30 7 * * * cd /path/to/sme-ai-directory && node update.mjs >> logs/update.log 2>&1
```

## Placeholders to replace before launch

- `sponsor@runonai.in` in `sponsor.html` (set in `site.config.json`). It only works once runonai.in is registered and mail is set up.
- Owner contact `mail@ankit-agarwal.com` is marked "to be confirmed".
- The signup form has no backend. Connect it to your email tool (e.g. a form endpoint) and update the note under the form.

## v1 verification notes (2026-10-13)

- All 42 tool URLs were checked with `curl -sIL -m 15 -A Mozilla` and the page titles were inspected. `update.mjs` reports 42/42 OK.
- Left out of v1 because they couldn't be verified cleanly:
  - claude.ai, perplexity.ai and adobe.com/acrobat returned bot-challenge 403s. Claude is listed via `claude.com`.
  - Vyapar: no AI features found on its site.
  - Naukri and apna: no AI features found on their employer pages.
  - Khatabook: empty response.
  - NotebookLM: its URL now redirects to a renamed product.
  - Superhuman: the product has changed scope.

  These are good candidates for the daily agent to re-check.
- Pricing tiers (`free` / `freemium` / `paid`) reflect the vendors' public sites. Tools marked `unknown` couldn't be confirmed.
- Site checked in headless Chrome at a 390px viewport: no horizontal overflow on any page.
