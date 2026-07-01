#!/usr/bin/env python3
"""
Track *trending* YouTube videos for a game (default: Path of Exile 2) over time.

Instead of re-ranking from scratch each run, this keeps a state file between runs.
A video is logged ONCE, at the moment it first becomes trending (high view velocity
= views per hour). After that it is never re-added to the top of the feed; it just
keeps its place in the chronological record while its peak stats get updated.

Outputs (written into OUTPUT_DIR):
  feed.xml        RSS feed, newest trending discoveries first (pubDate = first-seen).
  index.html      Browsable chronological table (newest first).
  trending.csv    Full archive, oldest -> newest (a literal chronological table).

State (between runs):
  STATE_PATH      JSON store of every video ever logged.

No third-party dependencies: standard library only.

Required:
  YOUTUBE_API_KEY     YouTube Data API v3 key (free; Google Cloud Console).

Optional (env vars, defaults shown):
  SEARCH_QUERY        "Path of Exile 2"   Search term (change to track any game).
  LOOKBACK_DAYS       4                   How far back uploads are considered.
  SEARCH_PAGES        2                   search.list pages to pull (50 each).
  MIN_AGE_HOURS       6                   Age floor for the velocity calc.
  MIN_VIEWS           0                   Ignore videos below this view count.
  EXCLUDE_SHORTS      false               "true" drops videos <= 70 seconds.
  RELEVANCE_LANGUAGE  en                  Language bias ("" = none).
  REGION_CODE         (empty)             Region bias, e.g. "US" ("" = global).
  TREND_TOP_N         20                  Top-N by velocity counted as "trending" each run.
  MIN_TREND_VELOCITY  0                   Extra bar: a video must hit this views/hr to be logged.
  FEED_MAX            50                  Max items kept in the RSS feed (table keeps all).
  STATE_PATH          data/state.json     Where state is stored between runs.
  OUTPUT_DIR          docs                Where feed.xml / index.html / trending.csv go.
  FEED_SELF_URL       (empty)             Public feed URL, for the <atom:link rel="self"> hint.
"""

import os
import re
import csv
import sys
import json
import html
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from xml.sax.saxutils import escape

API = "https://www.googleapis.com/youtube/v3"


def env(name, default):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


API_KEY            = os.environ.get("YOUTUBE_API_KEY", "").strip()
SEARCH_QUERY       = env("SEARCH_QUERY", "Path of Exile 2")
LOOKBACK_DAYS      = int(env("LOOKBACK_DAYS", "4"))
SEARCH_PAGES       = int(env("SEARCH_PAGES", "2"))
MIN_AGE_HOURS      = float(env("MIN_AGE_HOURS", "6"))
MIN_VIEWS          = int(env("MIN_VIEWS", "0"))
EXCLUDE_SHORTS     = env("EXCLUDE_SHORTS", "false").lower() in ("1", "true", "yes")
RELEVANCE_LANGUAGE = env("RELEVANCE_LANGUAGE", "en")
REGION_CODE        = env("REGION_CODE", "")
TREND_TOP_N        = int(env("TREND_TOP_N", "20"))
MIN_TREND_VELOCITY = float(env("MIN_TREND_VELOCITY", "0"))
FEED_MAX           = int(env("FEED_MAX", "50"))
STATE_PATH         = env("STATE_PATH", "data/state.json")
OUTPUT_DIR         = env("OUTPUT_DIR", "docs")
FEED_SELF_URL      = env("FEED_SELF_URL", "")

ISO = "%Y-%m-%dT%H:%M:%SZ"
_DUR = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


# --------------------------------------------------------------------------- #
# YouTube Data API
# --------------------------------------------------------------------------- #
def api_get(endpoint, params):
    params = dict(params)
    params["key"] = API_KEY
    url = f"{API}/{endpoint}?{urlencode(params)}"
    req = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        raise SystemExit(f"YouTube API error {e.code} on /{endpoint}: "
                         f"{e.read().decode('utf-8', 'replace')}")
    except URLError as e:
        raise SystemExit(f"Network error on /{endpoint}: {e}")


def search_video_ids():
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    ids, page_token = [], None
    for _ in range(max(1, SEARCH_PAGES)):
        params = {
            "part": "id", "q": SEARCH_QUERY, "type": "video", "order": "date",
            "publishedAfter": cutoff.strftime(ISO), "maxResults": 50,
        }
        if RELEVANCE_LANGUAGE:
            params["relevanceLanguage"] = RELEVANCE_LANGUAGE
        if REGION_CODE:
            params["regionCode"] = REGION_CODE
        if page_token:
            params["pageToken"] = page_token
        data = api_get("search", params)
        for item in data.get("items", []):
            vid = item.get("id", {}).get("videoId")
            if vid:
                ids.append(vid)
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    seen, unique = set(), []
    for v in ids:
        if v not in seen:
            seen.add(v); unique.append(v)
    return unique


def fetch_video_stats(video_ids):
    out = []
    for i in range(0, len(video_ids), 50):
        data = api_get("videos", {
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(video_ids[i:i + 50]), "maxResults": 50,
        })
        out.extend(data.get("items", []))
    return out


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def iso_to_dt(s):
    return datetime.strptime(s, ISO).replace(tzinfo=timezone.utc)


def duration_seconds(s):
    if not s:
        return None
    m = _DUR.fullmatch(s)
    if not m:
        return None
    h, mi, se = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + se


def human(n):
    n = float(n)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(int(n))


def fmt_dt(dt):
    return dt.strftime("%Y-%m-%d %H:%M UTC")


# --------------------------------------------------------------------------- #
# Trending detection (current snapshot)
# --------------------------------------------------------------------------- #
def compute_trending(videos, now=None):
    """Return the current top-by-velocity videos that clear the trending bar."""
    now = now or datetime.now(timezone.utc)
    rows = []
    for v in videos:
        snip = v.get("snippet", {})
        stats = v.get("statistics", {})
        if snip.get("liveBroadcastContent") in ("live", "upcoming"):
            continue
        dur = duration_seconds(v.get("contentDetails", {}).get("duration"))
        if EXCLUDE_SHORTS and dur is not None and dur <= 70:
            continue
        views = int(stats["viewCount"]) if stats.get("viewCount") else 0
        if views < MIN_VIEWS:
            continue
        published = iso_to_dt(snip["publishedAt"])
        age_hours = (now - published).total_seconds() / 3600.0
        velocity = views / max(age_hours, MIN_AGE_HOURS)
        if velocity < MIN_TREND_VELOCITY:
            continue
        thumbs = snip.get("thumbnails", {})
        thumb = (thumbs.get("medium") or thumbs.get("high")
                 or thumbs.get("default") or {}).get("url", "")
        rows.append({
            "id": v["id"],
            "title": snip.get("title", "(untitled)"),
            "channel": snip.get("channelTitle", ""),
            "published": published,
            "views": views,
            "velocity": velocity,
            "thumb": thumb,
        })
    rows.sort(key=lambda r: r["velocity"], reverse=True)
    return rows[:TREND_TOP_N]


# --------------------------------------------------------------------------- #
# State
# --------------------------------------------------------------------------- #
def load_state(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("videos"), dict):
            return data
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return {"version": 1, "videos": {}}


def save_state(path, state):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2, sort_keys=True)


def update_state(state, candidates, now):
    """Add new trending videos once; refresh peak stats for ones already logged.

    Returns the list of newly added video ids.
    """
    videos = state["videos"]
    now_iso = now.strftime(ISO)
    new_ids = []
    for r in candidates:
        vid = r["id"]
        url = f"https://www.youtube.com/watch?v={vid}"
        if vid not in videos:
            videos[vid] = {
                "id": vid,
                "title": r["title"],
                "channel": r["channel"],
                "url": url,
                "published_at": r["published"].strftime(ISO),
                "first_seen_at": now_iso,
                "first_seen_views": r["views"],
                "first_seen_velocity": round(r["velocity"], 2),
                "peak_velocity": round(r["velocity"], 2),
                "peak_views": r["views"],
                "last_seen_at": now_iso,
                "last_views": r["views"],
                "thumb": r["thumb"],
            }
            new_ids.append(vid)
        else:
            rec = videos[vid]
            rec["title"] = r["title"]            # titles occasionally change
            rec["last_seen_at"] = now_iso
            rec["last_views"] = r["views"]
            rec["peak_views"] = max(rec.get("peak_views", 0), r["views"])
            rec["peak_velocity"] = round(
                max(rec.get("peak_velocity", 0), r["velocity"]), 2)
    return new_ids


def records_sorted(state, newest_first=True):
    recs = list(state["videos"].values())
    recs.sort(key=lambda r: (r["first_seen_at"], r.get("first_seen_velocity", 0)),
              reverse=newest_first)
    return recs


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #
def build_rss(records):
    now = datetime.now(timezone.utc)
    title = f"{SEARCH_QUERY} \u2014 Trending on YouTube"
    desc = (f"Videos for \u201c{SEARCH_QUERY}\u201d, logged once each when they first "
            f"start gaining views fast. Newest discoveries first.")
    search_link = "https://www.youtube.com/results?" + urlencode({"search_query": SEARCH_QUERY})

    items = []
    for rank, r in enumerate(records[:FEED_MAX], 1):
        url = r["url"]
        vph = human(round(r["first_seen_velocity"]))
        views = human(r["first_seen_views"])
        peak = human(round(r.get("peak_velocity", r["first_seen_velocity"])))
        item_title = f"[\u2191 {vph}/hr \u00b7 {views} views] {r['title']}"
        body = (
            f'<p><a href="{escape(url)}">'
            f'<img src="{escape(r.get("thumb", ""))}" alt="thumbnail"></a></p>'
            f'<p><b>{escape(r["channel"])}</b></p>'
            f'<p>When first trending: ~{vph} views/hour at {views} views.<br>'
            f'Peak velocity since: ~{peak} views/hour.</p>'
        )
        first_seen = iso_to_dt(r["first_seen_at"])
        items.append(
            "    <item>\n"
            f"      <title>{escape(item_title)}</title>\n"
            f"      <link>{escape(url)}</link>\n"
            f'      <guid isPermaLink="true">{escape(url)}</guid>\n'
            f"      <pubDate>{format_datetime(first_seen)}</pubDate>\n"
            f"      <description>{escape(body)}</description>\n"
            "    </item>"
        )

    self_link = ""
    if FEED_SELF_URL:
        self_link = (f'\n    <atom:link href="{escape(FEED_SELF_URL)}" '
                     f'rel="self" type="application/rss+xml"/>')

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "  <channel>\n"
        f"    <title>{escape(title)}</title>\n"
        f"    <link>{escape(search_link)}</link>\n"
        f"    <description>{escape(desc)}</description>\n"
        "    <language>en</language>\n"
        f"    <lastBuildDate>{format_datetime(now)}</lastBuildDate>\n"
        f"    <ttl>180</ttl>{self_link}\n"
        + "\n".join(items) + ("\n" if items else "")
        + "  </channel>\n"
        "</rss>\n"
    )


CSV_FIELDS = [
    "first_seen_at", "title", "channel", "url", "published_at",
    "first_seen_views", "first_seen_velocity", "peak_velocity",
    "peak_views", "last_seen_at", "last_views",
]


def write_csv(records_chrono, path):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in records_chrono:
            w.writerow(r)


def build_html(records, now):
    rows = []
    for i, r in enumerate(records, 1):
        first_seen = fmt_dt(iso_to_dt(r["first_seen_at"]))
        uploaded = fmt_dt(iso_to_dt(r["published_at"]))
        rows.append(
            "<tr>"
            f"<td class=num>{i}</td>"
            f"<td class=when>{html.escape(first_seen)}</td>"
            f'<td class=title><a href="{html.escape(r["url"])}" target="_blank" rel="noopener">'
            f'{html.escape(r["title"])}</a><div class=chan>{html.escape(r["channel"])}</div></td>'
            f"<td class=when>{html.escape(uploaded)}</td>"
            f"<td class=num>{human(r['first_seen_views'])}</td>"
            f"<td class=num>{human(round(r['first_seen_velocity']))}</td>"
            f"<td class=num>{human(round(r.get('peak_velocity', r['first_seen_velocity'])))}</td>"
            f"<td class=num>{human(r.get('last_views', r['first_seen_views']))}</td>"
            "</tr>"
        )
    table_rows = "\n".join(rows) or '<tr><td colspan="8" class="empty">No trending videos logged yet.</td></tr>'
    updated = fmt_dt(now)
    title = html.escape(f"{SEARCH_QUERY} — Trending log")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 0; padding: 1.5rem; background: #0f1115; color: #e6e8ee;
         font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }}
  h1 {{ font-size: 1.25rem; margin: 0 0 .25rem; }}
  .meta {{ color: #9aa3b2; font-size: .85rem; margin-bottom: 1rem; }}
  .meta a {{ color: #8ab4f8; }}
  .wrap {{ overflow-x: auto; border: 1px solid #232733; border-radius: 10px; }}
  table {{ border-collapse: collapse; width: 100%; min-width: 760px; }}
  th, td {{ padding: .55rem .7rem; border-bottom: 1px solid #1d212b; text-align: left;
           vertical-align: top; }}
  thead th {{ position: sticky; top: 0; background: #161a22; color: #c5ccda;
             font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }}
  tbody tr:hover {{ background: #141821; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
           color: #d7dbe6; }}
  td.when {{ white-space: nowrap; color: #9aa3b2; font-size: .85rem; }}
  td.title a {{ color: #e6e8ee; text-decoration: none; font-weight: 600; }}
  td.title a:hover {{ text-decoration: underline; }}
  .chan {{ color: #8b93a3; font-size: .8rem; margin-top: .15rem; }}
  .empty {{ text-align: center; color: #8b93a3; padding: 2rem; }}
</style>
</head>
<body>
  <h1>{title}</h1>
  <div class="meta">
    Updated {html.escape(updated)} &middot; {len(records)} videos logged &middot;
    <a href="feed.xml">RSS feed</a> &middot; <a href="trending.csv">CSV</a>
  </div>
  <div class="wrap">
    <table>
      <thead><tr>
        <th>#</th><th>First trending</th><th>Video</th><th>Uploaded</th>
        <th>Views @first</th><th>V/hr @first</th><th>Peak v/hr</th><th>Latest views</th>
      </tr></thead>
      <tbody>
{table_rows}
      </tbody>
    </table>
  </div>
</body>
</html>
"""


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    if not API_KEY:
        raise SystemExit("Set the YOUTUBE_API_KEY environment variable.")
    now = datetime.now(timezone.utc)

    state = load_state(STATE_PATH)
    ids = search_video_ids()
    if not ids:
        print("No videos found in the lookback window.", file=sys.stderr)
    videos = fetch_video_stats(ids) if ids else []
    candidates = compute_trending(videos, now=now)
    new_ids = update_state(state, candidates, now)
    save_state(STATE_PATH, state)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    newest = records_sorted(state, newest_first=True)
    chrono = records_sorted(state, newest_first=False)
    with open(os.path.join(OUTPUT_DIR, "feed.xml"), "w", encoding="utf-8") as f:
        f.write(build_rss(newest))
    write_csv(chrono, os.path.join(OUTPUT_DIR, "trending.csv"))
    with open(os.path.join(OUTPUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_html(newest, now))

    print(f"Trending now: {len(candidates)} candidate(s); "
          f"{len(new_ids)} new this run; {len(state['videos'])} total logged.")
    for vid in new_ids:
        r = state["videos"][vid]
        print(f"  + {round(r['first_seen_velocity']):>6} v/hr  "
              f"{r['first_seen_views']:>9,} views  {r['title'][:64]}")


if __name__ == "__main__":
    main()
