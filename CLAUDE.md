# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A trending-YouTube tracker for a game (Path of Exile 1 & 2) plus a static launcher UI.
Two moving parts that meet only over generated files:

- **`poe2_trending.py`** — a zero-dependency (stdlib-only) Python script that queries the
  YouTube Data API v3, ranks recent uploads by *view velocity* (views ÷ hours since upload),
  and writes `feed.xml` / `index.html` / `trending.csv`. It **remembers state between runs**:
  a video is logged **once** at first-trending and never re-floated; later runs only refresh
  its peak stats. State is a single JSON file keyed by video id.
- **`web/`** — **Exile Hub**, a launcher UI served at the site root. Its YouTube panel
  fetches the RSS the script produces. It is a **Claude Design `.dc` component**
  (`web/exile-hub.dc.html`) rendered by the vendored **`web/support.js`** (`dc-runtime`),
  which auto-boots on load and pulls React/ReactDOM/Babel from unpkg — so it runs standalone
  with no build step. Deployed as `docs/index.html` + `docs/support.js`.

## The two-branch model (important, non-obvious)

- **`master` holds code only.** `poe2_trending.py`, `web/`, the workflow, docs.
- **`feed` branch holds generated state + the published site** (`data/*.json`, `docs/**`).
  It is an orphan branch created automatically on the workflow's first run.
- The workflow checks `master` out normally and clones the `feed` branch into `./published`,
  runs the script pointed at `published/data` + `published/docs`, then commits back to `feed`
  (`git push origin HEAD:$DATA_BRANCH`). GitHub Pages serves the **`feed`** branch's `/docs`.
- `data/` and `docs/` are gitignored on `master` so local test runs never dirty the code branch.

Consequence: never expect generated `feed.xml`/`state.json` to appear on `master`; look on the
`feed` branch (`git show origin/feed:data/poe2.json`). Commit messages carry `[skip ci]`, and
the job only triggers on `schedule`/`workflow_dispatch`, so its own commit can't re-trigger it.

## Running

```bash
# Run the generator locally (writes ./data + ./docs, both gitignored):
export YOUTUBE_API_KEY=...            # required; free key from Google Cloud Console
python3 poe2_trending.py              # stdlib only — no install/venv needed

# All config is env vars (see the table in README.md). Key ones:
SEARCH_QUERY="Path of Exile 2" STATE_PATH=data/poe2.json OUTPUT_DIR=docs/poe2 python3 poe2_trending.py
```

There is **no test suite, linter, or build step.** Validate changes directly:

```bash
python3 -c "import ast; ast.parse(open('poe2_trending.py').read())"   # syntax
node --check web/app.js                                              # JS syntax
```

For `web/app.js`, the established smoke-test pattern is a headless **jsdom** run that mocks
`fetch`/`AbortController`/`ResizeObserver`, forces the offline error paths, dispatches an
`input` event on `#q`, and asserts the featured tiles / groups / command-palette rows render
with zero `window.onerror`. There is no browser available in-session; jsdom is the check.

## Deploying / operating (GitHub Actions)

**Two workflows**, both writing to the `feed` branch and sharing one concurrency group
(`trending-feed`) so they never race:
- **`build-feed.yml`** — "Build trending feed and table". Scheduled every 6h + manual dispatch.
  Runs the generator for both games; commits `data/` + `docs/poe2` + `docs/poe1`. Does **not**
  touch the landing page.
- **`publish-hub.yml`** — "Publish Exile Hub". Triggers on push to `master` under `web/**` (+ manual).
  Copies `web/exile-hub.dc.html` → `docs/index.html` and `web/support.js` → `docs/support.js`.

No loops: both commit to `feed` (with `[skip ci]`), which no workflow watches; `publish-hub`
watches only `master`. To force either:

```bash
gh workflow run "Build trending feed and table" -R bigbes/poe2-discovery --ref master   # feeds
gh workflow run "Publish Exile Hub"             -R bigbes/poe2-discovery --ref master   # landing page
RID=$(gh run list -R bigbes/poe2-discovery --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RID" -R bigbes/poe2-discovery --exit-status
```

Quota math matters: each feed run costs ~200 API units (`SEARCH_PAGES × 100`); two feeds ≈
~400/run against a 10,000/day free quota. Hourly ≈ 9,700/day (near the ceiling) — drop
`SEARCH_PAGES=1` or lengthen the cron before increasing frequency.

## Adding / changing a feed

Feeds are per-invocation: duplicate the "Generate feed" step in the workflow with a distinct
`SEARCH_QUERY`, `STATE_PATH` (e.g. `published/data/foo.json`), and `OUTPUT_DIR`
(e.g. `published/docs/foo`). Current layout: PoE2 → `/poe2/`, PoE1 → `/poe1/`. The Exile Hub's
`RAW` map in `web/app.js` hardcodes each game's `ytFeed` URL — keep it in sync with the
`OUTPUT_DIR` a feed publishes to (they drifted once: the design draft used `/poe/`, the repo
publishes `/poe1/`).

## Exile Hub (`web/exile-hub.dc.html`) architecture & round-trip

A Claude Design `.dc` component: a `<x-dc>` template with `{{ }}` bindings + `<sc-if>`/`<sc-for>`,
and a `<script type="text/x-dc">` holding a `class Component extends DCLogic` (React-like:
`state` + `setState`, `renderVals()` supplies the binding values). `web/support.js` parses,
Babel-transpiles, and mounts it. **Do not hand-edit `web/exile-hub.dc.html` for cosmetic diffs**
— keep it byte-identical to the Claude Design project so DesignSync round-trips are clean.

Data sources & CORS workarounds (in the component script): YouTube = `fetch` the repo's RSS
(GitHub Pages sends permissive CORS); **Reddit hot + comments = JSONP via injected `<script>`**
(Reddit blocks cross-origin fetch); wiki autocomplete = `fetch` with `origin=*`. The RSS
`<title>` is parsed by a regex expecting the generator's exact
`[↑ {v}/hr · {views} views] Title` format — changing `build_rss()` in `poe2_trending.py` can
silently break the Hub's parser. Each game's `ytFeed` URL is hardcoded in the component's `raw`
map; keep it in sync with the feed's `OUTPUT_DIR`.

**DesignSync round-trip** (via Claude Code's DesignSync tool; there is no user-facing CLI —
ask Claude to run it): project id `5eb697e8-0de0-47dd-874c-41f917c0447f`, file `Exile Hub.dc.html`.
- **Pull** (Design → repo): `get_file "Exile Hub.dc.html"` → write to `web/exile-hub.dc.html`.
- **Push** (repo → Design): `finalize_plan` (writes `["Exile Hub.dc.html"]`, `localDir: web`,
  `localPath: exile-hub.dc.html`) → `write_files`. `finalize_plan` is the approval gate.
Note the repo filename (no space) maps to the project's `Exile Hub.dc.html` (with space).

The prior hand-written vanilla port (`index.html`+`styles.css`+`app.js`) was removed once we
confirmed `support.js` runs the `.dc` standalone; it remains in git history as a
CDN-free fallback if unpkg/CDN loading ever becomes a problem.

## Generator (`poe2_trending.py`) structure

Linear `main()`: `load_state` → `search_video_ids` (search.list) → `fetch_video_stats`
(videos.list) → `compute_trending` (velocity rank, `TREND_TOP_N`, filters) → `update_state`
(add-once / refresh-peak) → `save_state` → write `feed.xml` (newest-first, `FEED_MAX`),
`trending.csv` (oldest-first, full), `index.html` (table). `MIN_AGE_HOURS` floors the velocity
denominator so brand-new uploads can't spike. Env-var config is read once at module top.
