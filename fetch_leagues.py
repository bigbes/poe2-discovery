#!/usr/bin/env python3
"""Fetch the current PoE1 & PoE2 challenge-league names from the official trade API and
write a small leagues.json that the Exile Hub reads client-side (same-origin, so no CORS).

Stdlib only. Runs server-side in the scheduled workflow because GGG's API does not send
permissive CORS headers, so the browser can't fetch it directly.

Output (LEAGUES_PATH, default docs/leagues.json):
  { "updated": "...Z", "poe1": {"league": "Mirage"}, "poe2": {"league": "Runes of Aldur"} }

The Hub falls back to its hardcoded labels if a game key is missing, so a failed fetch is safe.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

ENDPOINTS = {
    "poe1": "https://www.pathofexile.com/api/trade/data/leagues",
    "poe2": "https://www.pathofexile.com/api/trade2/data/leagues",
}

# Skip permanent leagues and HC/Ruthless/SSF variants to find the main softcore challenge league.
_SKIP = ("standard", "hardcore", "ruthless", "ssf", "solo self-found", "hc ")

# poe(2)db list every patch as "Version_X.Y.Z"; the highest is the current game version.
VERSION_PAGES = {"poe1": "https://poedb.tw/us/", "poe2": "https://poe2db.tw/us/"}
_VER_RE = re.compile(r"Version_(\d+\.\d+(?:\.\d+)?)([a-z]?)")

UA = "exile-hub/1.0 (+https://bigbes.github.io/poe2-discovery/)"


def latest_patch(url):
    """Highest 'Version_X.Y.Z' listed on a poedb home page, e.g. '0.5.4' / '3.28.0'."""
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "replace")
    found = _VER_RE.findall(html)
    if not found:
        return None

    def key(pair):
        nums = [int(x) for x in pair[0].split(".")]
        while len(nums) < 3:
            nums.append(0)
        return (nums[0], nums[1], nums[2], pair[1])   # letter suffix breaks ties (1c > 1b)

    best = max(found, key=key)
    return best[0] + best[1]


def current_league(url):
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    for entry in data.get("result", []):
        lid = entry.get("id", "")
        if any(s in lid.lower() for s in _SKIP):
            continue
        return lid
    return None


def scout_slug():
    """poe2scout's short league slug (e.g. 'runes') — not derivable from the league name."""
    req = Request("https://api.poe2scout.com/poe2/Leagues",
                  headers={"User-Agent": UA, "Accept": "application/json"})
    with urlopen(req, timeout=30) as r:
        for lg in json.loads(r.read().decode("utf-8")):
            if lg.get("IsCurrent"):
                return lg.get("ShortName")
    return None


def main():
    out_path = os.environ.get("LEAGUES_PATH", "docs/leagues.json")
    result = {"version": 1,
              "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    for game, url in ENDPOINTS.items():
        try:
            name = current_league(url)
        except (HTTPError, URLError, ValueError, OSError) as e:
            print(f"warn: {game} league fetch failed: {e}", file=sys.stderr)
            name = None
        entry = result.setdefault(game, {})
        if name:
            entry["league"] = name
            print(f"{game}: {name}")
        else:
            print(f"{game}: (no league found; Hub will fall back)", file=sys.stderr)
        # current game/patch version from poe(2)db (e.g. "0.5.4" / "3.28.0")
        try:
            patch = latest_patch(VERSION_PAGES[game])
            if patch:
                entry["patch"] = patch
                print(f"{game} patch: {patch}")
        except (HTTPError, URLError, OSError) as e:
            print(f"warn: {game} patch fetch failed: {e}", file=sys.stderr)

    # poe2scout's league slug for the Economy tile (its own ShortName, not the league name)
    try:
        slug = scout_slug()
        if slug and "poe2" in result:
            result["poe2"]["scout"] = slug
            print(f"poe2 scout slug: {slug}")
    except (HTTPError, URLError, ValueError, OSError) as e:
        print(f"warn: scout slug fetch failed: {e}", file=sys.stderr)

    d = os.path.dirname(out_path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
