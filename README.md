# Trending YouTube videos → RSS + chronological table

A tiny, zero-dependency Python script that tracks which YouTube videos for a game
are **gaining views fastest**, and keeps a running record over time.

This repo publishes **two feeds** from the one script — **Path of Exile 2** at `/poe2/`
and **Path of Exile 1** at `/poe1/`. Each feed is just another invocation of the script
with its own `SEARCH_QUERY`, `STATE_PATH`, and `OUTPUT_DIR` (see the workflow's two
"Generate feed" steps).

The site root is **Exile Hub** (`web/exile-hub.dc.html`) — a Path of Exile launcher
dashboard (game tabs, a wiki/trade command-palette omnibar, the live league timeline, link
tiles, Reddit "Hot", and a YouTube-trending panel that reads the feeds above). It's a
[Claude Design](https://claude.ai/design) component: `web/support.js` (the `dc-runtime`)
auto-boots it in any browser and pulls React from a CDN, so it renders with no build step.
The workflow deploys the `.dc` as `docs/index.html` plus `docs/support.js`.

**Round-trip with Claude Design.** `web/exile-hub.dc.html` is kept byte-identical to the
same file in the Claude Design project, so you can edit it locally *or* in the Design editor
and sync either direction (via Claude Code's DesignSync). See `CLAUDE.md` for the project id
and the pull/push steps.

The key idea: it **remembers state between runs**. A video is logged **once**, at the
moment it first becomes trending, and then it is *never re-added to the top of the
feed* — it just keeps its place in the chronological record while its peak stats are
updated. "Trending" = view velocity (views ÷ hours since upload), measured across
videos uploaded in the last few days.

Each run writes three things into `OUTPUT_DIR` (default `docs/`):

- **`feed.xml`** — RSS feed, newest *discoveries* first. Each item's `pubDate` is when
  the video first became trending, so already-seen videos can't jump back to the front.
- **`index.html`** — a browsable chronological table (newest first) with first-seen
  time, first-seen views/velocity, peak velocity, and latest views.
- **`trending.csv`** — the full archive, oldest → newest (a literal chronological table).

State lives in **`data/state.json`**, and both it and the generated `docs/` are committed
each run to a **separate `feed` branch** — never to `master`. The code branch stays
code-only; the `feed` branch carries the accumulating state + published outputs, so the
history survives and is itself version-controlled. (The workflow creates the `feed` branch
automatically on its first run.)

## Repository layout

```
poe2_trending.py            # the feed/table generator (stdlib only)
fetch_leagues.py            # writes docs/leagues.json (current PoE1/PoE2 league names)
build_search_index.py       # writes docs/search/*.json (omnibar completion index)
web/                        # Exile Hub — the launcher served at the site root
  exile-hub.dc.html        #   Claude Design component (canonical; round-trips with Design)
  support.js               #   dc-runtime (vendored; auto-boots the .dc, loads React from CDN)
.github/workflows/
  build-feed.yml           # scheduled (6h): generate both feeds, commit to `feed`
  publish-hub.yml          # on push to master (web/**): publish the Exile Hub landing page
  build-search-index.yml   # weekly: build the omnibar search index (docs/search/*.json)
README.md
```

`master` holds only the above (code). Generated state + published site live on the
separate `feed` branch — see below.

## What you need

- A free **YouTube Data API v3 key**.
- A **GitHub account** (the workflow runs the script on a schedule, commits the updated
  state + outputs, and serves the files via GitHub Pages). You can also run it anywhere
  that can serve static files — see "Run it yourself".

## Setup (GitHub, ~10 minutes)

1. **Get an API key.** In the [Google Cloud Console](https://console.cloud.google.com/):
   create a project → APIs & Services → Library → enable **YouTube Data API v3** →
   Credentials → Create credentials → **API key**. Copy it.
2. **Make a repo** and add these files (keep the structure, including
   `.github/workflows/build-feed.yml`).
3. **Add the key as a secret.** Repo → Settings → Secrets and variables → Actions →
   New repository secret → name `YOUTUBE_API_KEY`, paste the key.
4. **Run it once.** Repo → Actions → "Build trending feed and table" → **Run workflow**.
   The first run creates the `feed` branch with `data/*.json` and `docs/…` on it.
5. **Turn on Pages.** Repo → Settings → Pages → Source = **Deploy from a branch** →
   Branch **`feed`**, folder **`/docs`**. (The `feed` branch only exists after step 4.)
   Once Pages builds, you'll have (for this repo):
   - Landing page: `https://bigbes.github.io/poe2-discovery/`
   - PoE2: table `…/poe2/`, feed `…/poe2/feed.xml`, CSV `…/poe2/trending.csv`
   - PoE1: table `…/poe1/`, feed `…/poe1/feed.xml`, CSV `…/poe1/trending.csv`
6. **Subscribe** to a feed URL in your RSS reader. The workflow re-runs every 6 hours
   (edit the `cron` line), each time appending only newly-trending videos.

The scheduled job only triggers on `schedule`/manual dispatch, so the commit it makes
does **not** retrigger it — no loops. (`[skip ci]` is in the commit message as well.)

## Run it yourself (no GitHub)

```bash
export YOUTUBE_API_KEY=your_key_here
python poe2_trending.py        # updates data/state.json and writes docs/
```

State accumulates in `data/state.json` between runs. Host the `docs/` folder anywhere
static, and schedule the script with cron / Task Scheduler.

## How "trending" and "logged once" work

- Each run pulls recent uploads and ranks them by **views per hour**. The current
  **`TREND_TOP_N`** (default 20) that also clear **`MIN_TREND_VELOCITY`** count as
  "trending right now".
- Any of those **not already in `state.json`** get a new row with `first_seen_at = now`.
- Any that **are** already logged are left in place; only their `peak_velocity`,
  `peak_views`, and `last_views` are refreshed. They are never re-inserted at the top.
- The feed and HTML are ordered by `first_seen_at` (newest first); the CSV is oldest
  first. The feed is capped at **`FEED_MAX`** (default 50) most-recent entries; the
  table and CSV keep everything.

## Customising

All optional, set as environment variables (or in the workflow's `env:` block):

| Variable             | Default            | Meaning                                          |
|----------------------|--------------------|--------------------------------------------------|
| `SEARCH_QUERY`       | `Path of Exile 2`  | Change to track any other game/topic.            |
| `LOOKBACK_DAYS`      | `4`                | How far back uploads are considered.             |
| `SEARCH_PAGES`       | `2`                | search.list pages to pull (50 results each).     |
| `MIN_AGE_HOURS`      | `6`                | Age floor so brand-new clips don't game velocity.|
| `MIN_VIEWS`          | `0`                | Drop videos below this view count.               |
| `EXCLUDE_SHORTS`     | `false`            | `true` drops videos ≤ 70 seconds.                |
| `RELEVANCE_LANGUAGE` | `en`               | Language bias; empty `""` for none.              |
| `REGION_CODE`        | *(empty)*          | e.g. `US`; empty = global.                       |
| `TREND_TOP_N`        | `20`               | How many of the current top-by-velocity to log.  |
| `MIN_TREND_VELOCITY` | `0`                | Extra bar (views/hr) before a video is logged.   |
| `FEED_MAX`           | `50`               | Items kept in the RSS feed (table keeps all).    |
| `STATE_PATH`         | `data/state.json`  | Where state is stored between runs.              |
| `OUTPUT_DIR`         | `docs`             | Where feed.xml / index.html / trending.csv go.   |
| `FEED_SELF_URL`      | *(empty)*          | Public feed URL, for the `atom:link` hint.       |

Track several games at once by duplicating the "Generate feed" step with a different
`SEARCH_QUERY`, `STATE_PATH` (e.g. `data/diablo.json`), and `OUTPUT_DIR`
(e.g. `docs/diablo`) — each becomes its own feed + table.

## API quota

Each run costs roughly `SEARCH_PAGES × 100` units for search plus ~1 unit per 50 videos
— about **200 units/run** at the defaults. Every 6 hours ≈ 800 units/day against the
default **10,000 units/day** quota, so even hourly runs are fine.
