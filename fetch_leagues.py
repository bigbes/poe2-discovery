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

UA = "exile-hub/1.0 (+https://bigbes.github.io/poe2-discovery/)"


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


def main():
    out_path = os.environ.get("LEAGUES_PATH", "docs/leagues.json")
    result = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    for game, url in ENDPOINTS.items():
        try:
            name = current_league(url)
        except (HTTPError, URLError, ValueError, OSError) as e:
            print(f"warn: {game} league fetch failed: {e}", file=sys.stderr)
            name = None
        if name:
            result[game] = {"league": name}
            print(f"{game}: {name}")
        else:
            print(f"{game}: (no league found; Hub will fall back)", file=sys.stderr)

    d = os.path.dirname(out_path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
