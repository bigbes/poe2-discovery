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
python3 -c "import ast; ast.parse(open('poe2_trending.py').read())"   # python syntax
# the Hub is a .dc component — extract its <script data-dc-script> and syntax-check that:
python3 -c "import re;s=open('web/exile-hub.dc.html').read();m=re.search(r'data-dc-script[^>]*>(.*?)</script>',s,re.S);open('/tmp/dc.js','w').write(m.group(1))" && node --check /tmp/dc.js
```

There is no `web/app.js` (the old vanilla port was removed). To unit-test Hub logic without a
browser: `eval` the extracted `class Component` with stubs, instantiate, call methods directly —
`globalThis.DCLogic=class{setState(p){Object.assign(this.state,typeof p==='function'?p(this.state):p);}}`,
`globalThis.React={createElement:()=>({})}`, plus `window`/`location`/`document` stubs. For a full
boot, jsdom **can** run it once React + support.js are inlined (react/react-dom must be inlined via a
*function* replacer — `.replace(m,()=>code)` — so `$$typeof` in React source isn't mangled).

## Deploying / operating (GitHub Actions)

**Three workflows**, all writing to the `feed` branch and sharing one concurrency group
(`trending-feed`) so they never race:
- **`build-feed.yml`** — "Build trending feed and table". Scheduled every 6h + manual. Generates
  both feeds (`data/` + `docs/poe2` + `docs/poe1`), **plus `fetch_leagues.py`→`docs/leagues.json`
  and `fetch_patchnotes.py`→`docs/patchnotes/index.html`**. Does **not** touch the landing page.
- **`publish-hub.yml`** — "Publish Exile Hub". On push to `master` under `web/**` (+ manual).
  Copies `web/exile-hub.dc.html`→`docs/index.html` + `web/support.js`, **and injects self-hosted
  `web/vendor/react*.min.js` (via `sed`) + favicon links into the deployed `index.html`**.
- **`build-search-index.yml`** — "Build search index". Weekly. Runs `build_search_index.py`→`docs/search/*.json`.

No loops: all commit to `feed` (with `[skip ci]`), which no workflow watches; `publish-hub`
watches only `master`. To force any:

```bash
gh workflow run "Build trending feed and table" -R bigbes/poe2-discovery --ref master   # feeds + leagues.json + patchnotes
gh workflow run "Publish Exile Hub"             -R bigbes/poe2-discovery --ref master   # landing page
gh workflow run "Build search index"            -R bigbes/poe2-discovery --ref master   # docs/search/*.json
RID=$(gh run list -R bigbes/poe2-discovery --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RID" -R bigbes/poe2-discovery --exit-status
```

`leagues.json` schema: `{version:1, updated, poeN:{league, patch, scout?}}` — `patch` is the
current game version scraped from poe(2)db, `scout` is poe2scout's league slug (poe2 only).

Quota math matters: each feed run costs ~200 API units (`SEARCH_PAGES × 100`); two feeds ≈
~400/run against a 10,000/day free quota. Hourly ≈ 9,700/day (near the ceiling) — drop
`SEARCH_PAGES=1` or lengthen the cron before increasing frequency.

## Adding / changing a feed

Feeds are per-invocation: duplicate the "Generate feed" step in the workflow with a distinct
`SEARCH_QUERY`, `STATE_PATH` (e.g. `published/data/foo.json`), and `OUTPUT_DIR`
(e.g. `published/docs/foo`). Current layout: PoE2 → `/poe2/`, PoE1 → `/poe1/`. The Exile Hub's
`raw` getter in `web/exile-hub.dc.html` hardcodes each game's `ytFeed` URL — keep it in sync
with the `OUTPUT_DIR` a feed publishes to (they drifted once: the design draft used `/poe/`,
the repo publishes `/poe1/`).

## Exile Hub (`web/exile-hub.dc.html`) architecture & round-trip

A Claude Design `.dc` component: a `<x-dc>` template with `{{ }}` bindings + `<sc-if>`/`<sc-for>`,
and a `<script type="text/x-dc">` holding a `class Component extends DCLogic` (React-like:
`state` + `setState`, `renderVals()` supplies the binding values). `web/support.js` parses,
Babel-transpiles, and mounts it. **Do not hand-edit `web/exile-hub.dc.html` for cosmetic diffs**
— keep it byte-identical to the Claude Design project so DesignSync round-trips are clean.

Data sources & CORS workarounds (in the component script): YouTube = `fetch` the repo's RSS
(GitHub Pages sends permissive CORS); **Reddit hot + comments = JSONP via injected `<script>`**
(Reddit blocks cross-origin fetch); wiki autocomplete = `fetch` with `origin=*`; **current league
names = same-origin `fetch('./leagues.json')`**, written server-side by `fetch_leagues.py` in
`build-feed.yml` (GGG's league API has no browser CORS). The Hub shows the fetched league name
in the game tabs + tag, falling back to hardcoded `0.5`/`3.28` if the file is missing
(`leagueLabel`/`leagueTag`). The RSS
`<title>` is parsed by a regex expecting the generator's exact
`[↑ {v}/hr · {views} views] Title` format — changing `build_rss()` in `poe2_trending.py` can
silently break the Hub's parser. Each game's `ytFeed` URL is hardcoded in the component's `raw`
map; keep it in sync with the feed's `OUTPUT_DIR`.

**Omnibar completion** loads a weekly-built index `./search/<game>.json` (same-origin, fetched
`cache:'default'` — NOT `force-cache`, which pinned a stale index) and matches locally
(`fetchIndex`/`localMatch`: **multi-term** — every space-separated term must hit the name or the
attribute tag `t`; prefix hits first, then substring, cap 50), falling back to the live wiki
`opensearch` when the index isn't loaded or a query has no local hits.
`build_search_index.py` builds it server-side (no CORS on any source): wiki `allpages` titles
(both games) + PoE2 **scout uniques** (icons) + PoE2 **ninja economy** across all exchange tabs
`NINJA_TYPES` (~600, icons) + PoE2 **CoE bases** (poec_data.json is a `poecd={...}` JS payload;
individual bases get an icon `images/game_poe2/<imgurl>`, an attribute tag `t` from the art path,
and a CoE deep-link `x`; plus the attribute *groups* like `Boots (DEX)` from `bases.seq`) + PoE2
**poe2db gems** (`gemitem` anchors, ~250). Entries are compact `{n,k,u,i?,b?,t?,x?}`. `merge()`
ranks **icon > typed-kind > bare wiki**, so a gem/base/currency also present as a wiki page keeps
its typed kind (else `/coe /n /sc /db` scoped completion would miss it). Scoped rows open `x` (deep
link) when present, else the command's site-search. Run weekly by `build-search-index.yml`.

Each command's `kinds` array scopes which index kinds it completes (`/n`→currency+unique+base,
`/sc`→unique, `/db`→gem, `/coe`→base). Gotcha: a **non-empty array is required** — `kinds: null`
(or absent) *disables* per-command completion, it does not widen it; only `native:'wiki'` completes
unscoped. Both the completion trigger and the row renderer key off `c.kinds` being truthy.
Second gotcha: the deployed `docs/search/<game>.json` is regenerated **only** by the weekly
workflow, so adding a source to `build_search_index.py` or widening a command's `kinds` surfaces
nothing until `build-search-index.yml` reruns (`gh workflow run` to force it).

**DesignSync round-trip** (via Claude Code's DesignSync tool; there is no user-facing CLI —
ask Claude to run it): project id `5eb697e8-0de0-47dd-874c-41f917c0447f`, file `Exile Hub.dc.html`.
- **Pull** (Design → repo): `get_file "Exile Hub.dc.html"` → write to `web/exile-hub.dc.html`.
- **Push** (repo → Design): `finalize_plan` (writes `["Exile Hub.dc.html"]`, `localDir: web`,
  `localPath: exile-hub.dc.html`) → `write_files`. `finalize_plan` is the approval gate.
Note the repo filename (no space) maps to the project's `Exile Hub.dc.html` (with space).

**Self-hosted React (deploy-time).** `support.js` loads React/ReactDOM from unpkg *unless*
`window.React`/`window.ReactDOM` already exist — and that CDN fetch was failing for some users
(adblock/network → blank page, raw `{{ }}` left in the DOM). Fix: `web/vendor/react*.min.js`
are committed, and `publish-hub.yml` injects `<script src="./vendor/...">` before `support.js`
**only in the deployed `docs/index.html`** (via `sed`), so support.js skips the CDN. The
canonical `web/exile-hub.dc.html` is left untouched so Claude Design (which supplies React
itself) still works and round-trips. Babel isn't vendored — it's only fetched for JSX, and the
component uses `React.createElement`.

The prior hand-written vanilla port (`index.html`+`styles.css`+`app.js`) was removed once we
confirmed `support.js` runs the `.dc` standalone; it remains in git history as a
CDN-free fallback if unpkg/CDN loading ever becomes a problem.

## Generator (`poe2_trending.py`) structure

Linear `main()`: `load_state` → `search_video_ids` (search.list) → `fetch_video_stats`
(videos.list) → `compute_trending` (velocity rank, `TREND_TOP_N`, filters) → `update_state`
(add-once / refresh-peak) → `save_state` → write `feed.xml` (newest-first, `FEED_MAX`),
`trending.csv` (oldest-first, full), `index.html` (table). `MIN_AGE_HOURS` floors the velocity
denominator so brand-new uploads can't spike. Env-var config is read once at module top.
