#!/usr/bin/env python3
"""Build a per-game client-side search index for the Exile Hub omnibar.

Aggregates named entities from several sources into docs/search/<game>.json so the Hub
can do instant local completion (no per-keystroke API call). Refreshed weekly by a
workflow because none of these APIs send browser-usable CORS headers.

Sources (best-effort — a failing source is skipped, never fatal):
  * MediaWiki `allpages` (poe2wiki.net / poewiki.net) — every main-namespace page title.
  * poe2scout — unique items by category (name + icon + base type), current league auto-detected.
  * poe.ninja — PoE2 currency names + icons.

Each entry is kept compact: {"n": name, "k": kind, "u": url, "i": icon?}
  kind: "wiki" | "unique" | "currency"
Entries are de-duplicated by case-folded name; a richer entry (with an icon) wins over a
bare wiki title of the same name.

Output dir: SEARCH_DIR (default docs/search). Stdlib only.
"""
import json
import os
import re
import sys
import time
from urllib.parse import urlencode, quote
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

UA = "exile-hub/1.0 (+https://bigbes.github.io/poe2-discovery/)"

WIKI = {"poe1": "https://www.poewiki.net", "poe2": "https://www.poe2wiki.net"}
SCOUT = "https://api.poe2scout.com"
NINJA_POE2 = "https://poe.ninja/poe2/api/economy/exchange/current/overview"
POECDN = "https://web.poecdn.com"
COE_POE2 = "https://www.craftofexile.com/json/poe2/main/poec_data.json"

# poe.ninja PoE2 "exchange" economy tabs (the ?type= values that return items).
NINJA_TYPES = [
    "Currency", "Fragments", "Runes", "Essences", "Expedition", "Ritual",
    "Breach", "Abyss", "Delirium", "Idols", "UncutGems", "LineageSupportGems", "Verisium",
]

# Safety cap so a runaway wiki never balloons the index (weekly, so generous).
MAX_WIKI_PAGES = 60000


def get_json(url, timeout=40, retries=3):
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    last = None
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except (URLError, OSError, ValueError) as e:
            last = e
            time.sleep(1.5 * (attempt + 1))  # transient drop / rate limit — back off and retry
    raise last


def get_text(url, timeout=40, retries=3):
    req = Request(url, headers={"User-Agent": UA})
    last = None
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except (URLError, OSError) as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


# --------------------------------------------------------------------------- #
def coe_bases():
    """PoE2 item base names from Craft of Exile (served as a JS `poecd={...}` payload)."""
    raw = get_text(COE_POE2)
    m = re.match(r"^\s*[A-Za-z_$][\w$]*\s*=\s*", raw)   # strip the `poecd=` prefix
    data = json.loads((raw[m.end():] if m else raw).rstrip().rstrip(";"))
    out = []
    for b in data.get("bitems", {}).get("seq", []):
        name = b.get("name_bitem")
        if not name:
            continue
        out.append({
            "n": name, "k": "base",
            "u": WIKI["poe2"] + "/wiki/" + quote(name.replace(" ", "_")),
        })
    return out


# --------------------------------------------------------------------------- #
def wiki_titles(game):
    """All main-namespace, non-redirect page titles for a wiki."""
    base = WIKI[game]
    titles, apcontinue, pulled = [], None, 0
    while True:
        params = {
            "action": "query", "list": "allpages", "apnamespace": "0",
            "apfilterredir": "nonredirects", "aplimit": "500", "format": "json",
        }
        if apcontinue:
            params["apcontinue"] = apcontinue
        data = get_json(base + "/api.php?" + urlencode(params))
        pages = data.get("query", {}).get("allpages", [])
        for p in pages:
            titles.append(p["title"])
        pulled += len(pages)
        cont = data.get("continue", {}).get("apcontinue")
        if not cont or pulled >= MAX_WIKI_PAGES:
            break
        apcontinue = cont
        time.sleep(0.2)  # pace pagination so the wiki doesn't drop us
    return titles


def wiki_url(game, title):
    return WIKI[game] + "/wiki/" + quote(title.replace(" ", "_"))


# --------------------------------------------------------------------------- #
def scout_current_slug():
    """(slug, full_name) of the current PoE2 challenge league, or (None, None)."""
    for lg in get_json(SCOUT + "/poe2/Leagues"):
        if lg.get("IsCurrent"):
            return lg.get("ShortName"), lg.get("Value")
    return None, None


def scout_uniques(slug):
    """Unique items across every category: name, icon, base type."""
    cats = get_json(SCOUT + "/poe2/Leagues/%s/Items/Categories" % slug)
    out = []
    for cat in cats.get("UniqueCategories", []):
        api_id = cat.get("ApiId")
        if not api_id:
            continue
        page = 1
        while True:
            q = urlencode({"Category": api_id, "Page": page, "PerPage": 100,
                           "DataPoints": 7, "FrequencyHours": 24})
            data = get_json(SCOUT + "/poe2/Leagues/%s/Uniques/ByCategory?%s" % (slug, q))
            for it in data.get("Items", []):
                name = it.get("Name") or (it.get("ItemMetadata") or {}).get("name")
                if not name:
                    continue
                out.append({
                    "n": name, "k": "unique",
                    "u": WIKI["poe2"] + "/wiki/" + quote(name.replace(" ", "_")),
                    "i": it.get("IconUrl") or (it.get("ItemMetadata") or {}).get("icon", ""),
                    "b": (it.get("ItemMetadata") or {}).get("base_type", ""),
                })
            if page >= data.get("Pages", 1):
                break
            page += 1
            time.sleep(0.15)  # be polite
    return out


def ninja_economy(league_name):
    """PoE2 economy item names + icons from poe.ninja, across every exchange tab."""
    out = []
    for t in NINJA_TYPES:
        url = NINJA_POE2 + "?" + urlencode({"league": league_name, "type": t})
        try:
            data = get_json(url)
        except (HTTPError, URLError, ValueError, OSError) as e:
            print("  warn: ninja %s failed: %s" % (t, e), file=sys.stderr)
            continue
        for it in data.get("items", []):
            name = it.get("name")
            if not name:
                continue
            img = it.get("image", "")
            out.append({
                "n": name, "k": "currency",
                "u": WIKI["poe2"] + "/wiki/" + quote(name.replace(" ", "_")),
                "i": (POECDN + img) if img.startswith("/") else img,
            })
        time.sleep(0.15)  # be polite between tabs
    return out


# --------------------------------------------------------------------------- #
def merge(entries):
    """De-dup by case-folded name; prefer an entry that carries an icon."""
    by_name = {}
    for e in entries:
        key = e["n"].casefold()
        cur = by_name.get(key)
        if cur is None or (not cur.get("i") and e.get("i")):
            by_name[key] = e
    return sorted(by_name.values(), key=lambda e: e["n"].lower())


def try_source(label, fn):
    try:
        got = fn()
        print("  %-24s %5d" % (label, len(got)))
        return got
    except (HTTPError, URLError, ValueError, OSError, KeyError) as e:
        print("  warn: %s failed: %s" % (label, e), file=sys.stderr)
        return []


def build_game(game):
    print("[%s]" % game)
    entries = []
    entries += try_source("wiki titles", lambda: [
        {"n": t, "k": "wiki", "u": wiki_url(game, t)} for t in wiki_titles(game)
    ])
    if game == "poe2":
        slug, name = scout_current_slug()
        if slug:
            entries += try_source("scout uniques (%s)" % slug, lambda: scout_uniques(slug))
        if name:
            entries += try_source("ninja economy", lambda: ninja_economy(name))
        entries += try_source("coe bases", lambda: coe_bases())
    merged = merge(entries)
    print("  -> %d unique entries" % len(merged))
    return merged


def main():
    out_dir = os.environ.get("SEARCH_DIR", "docs/search")
    os.makedirs(out_dir, exist_ok=True)
    for game in ("poe2", "poe1"):
        merged = build_game(game)
        path = os.path.join(out_dir, game + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"entries": merged}, f, ensure_ascii=False, separators=(",", ":"))
        print("  wrote %s (%d bytes)" % (path, os.path.getsize(path)))


if __name__ == "__main__":
    main()
