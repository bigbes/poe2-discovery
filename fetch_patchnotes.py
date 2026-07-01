#!/usr/bin/env python3
"""Build a patch-notes subpage for the Exile Hub from poe(2)db.

For each game it finds the current version (highest "Version_X.Y.Z" listed on the poedb home
page), fetches that version's patch-notes page, extracts the notes body from <div id="markContent">
(whitelisting a small set of tags — no scripts, ads or nav), and writes a single styled page
docs/patchnotes/index.html with a PoE2 / PoE1 toggle.

Stdlib only. Runs server-side (no CORS needed) from the scheduled workflow.
"""
import html as htmllib
import os
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

UA = "exile-hub/1.0 (+https://bigbes.github.io/poe2-discovery/)"

SITES = {
    "poe2": {"base": "https://poe2db.tw", "label": "Path of Exile 2"},
    "poe1": {"base": "https://poedb.tw", "label": "Path of Exile"},
}
_VER_RE = re.compile(r"Version_(\d+\.\d+(?:\.\d+)?)([a-z]?)")
# Tags kept in the extracted notes; everything else is dropped (text preserved unless script/style).
_KEEP = {"h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "b", "em", "i",
         "a", "br", "hr", "code", "blockquote"}


def get_html(url):
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def latest_version(base):
    found = _VER_RE.findall(get_html(base + "/us/"))
    if not found:
        return None

    def key(p):
        n = [int(x) for x in p[0].split(".")] + [0, 0, 0]
        return (n[0], n[1], n[2], p[1])

    best = max(found, key=key)
    return best[0] + best[1]


class NotesExtractor(HTMLParser):
    """Emit a sanitized copy of the patch notes inside <div id="markContent">, starting at the
    first <h1> (the "… Patch Notes" title)."""
    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.inc = False       # inside markContent
        self.depth = 0         # div nesting within markContent
        self.skip = 0          # inside <script>/<style>
        self.started = False   # have we hit the first <h1> yet
        self.out = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if not self.inc:
            if tag == "div" and d.get("id") == "markContent":
                self.inc, self.depth = True, 1
            return
        if tag == "div":
            self.depth += 1
            return
        if tag in ("script", "style"):
            self.skip += 1
            return
        if tag == "h1":
            self.started = True
        if not self.started or tag not in _KEEP:
            return
        if tag == "a":
            href = d.get("href", "")
            if href.startswith("/"):
                href = self.base + href
            self.out.append('<a href="%s" target="_blank" rel="noreferrer">' % htmllib.escape(href, quote=True))
        elif tag in ("br", "hr"):
            self.out.append("<%s>" % tag)
        else:
            self.out.append("<%s>" % tag)

    def handle_endtag(self, tag):
        if not self.inc:
            return
        if tag == "div":
            self.depth -= 1
            if self.depth == 0:
                self.inc = False
            return
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
            return
        if self.started and tag in _KEEP and tag not in ("br", "hr"):
            self.out.append("</%s>" % tag)

    def handle_data(self, data):
        if self.inc and self.started and not self.skip and data.strip():
            self.out.append(htmllib.escape(data))


def notes_for(game):
    base = SITES[game]["base"]
    ver = latest_version(base)
    if not ver:
        return None
    url = base + "/us/Version_" + ver
    ex = NotesExtractor(base)
    ex.feed(get_html(url))
    body = "".join(ex.out).strip()
    if not body:
        return None
    return {"version": ver, "url": url, "html": body}


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patch Notes — Exile Hub</title>
<link rel="icon" href="../favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet"/>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(140% 100% at 50% -10%,#101218,#070809 60%);min-height:100vh;color:#e7e9ee;font:16px/1.6 'Sora',system-ui,sans-serif;display:flex;justify-content:center;padding:34px 24px 80px}
main{width:100%;max-width:880px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px}
a.home{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(150deg,#e8a13a,#f7d089);color:#140d02;font-size:22px;text-decoration:none;box-shadow:0 0 30px rgba(232,161,58,.22)}
h1.t{font:700 20px 'Cinzel';letter-spacing:1.5px;margin:0}
.sub{color:#838996;font:500 11px 'JetBrains Mono';margin-top:3px}
.tabs{display:flex;gap:4px;background:#13151b;padding:4px;border-radius:12px;border:1px solid rgba(255,255,255,.08)}
.tab{appearance:none;border:0;background:transparent;color:#838996;font:600 13px 'Sora';padding:9px 16px;border-radius:9px;cursor:pointer}
.tab.on{background:#e8a13a;color:#140d02}
.tab .v{font:600 11px 'JetBrains Mono';opacity:.7;margin-left:6px}
.panel{background:#13151b;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:26px 30px}
.panel h1{font:700 24px 'Sora';margin:0 0 4px}
.src{font:500 11px 'JetBrains Mono';color:#838996;margin-bottom:18px}
.src a{color:#e8a13a;text-decoration:none}
.body h2{font:700 17px 'Sora';color:#f7d089;margin:26px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08)}
.body h3,.body h4{font:600 15px 'Sora';margin:16px 0 6px;color:#e7e9ee}
.body ul,.body ol{margin:8px 0;padding-left:22px}
.body li{margin:5px 0;color:#c8cdd6}
.body p{margin:8px 0;color:#c8cdd6}
.body a{color:#8ab4f8;text-decoration:none}
.body a:hover{text-decoration:underline}
.body strong,.body b{color:#e7e9ee}
.body code{font-family:'JetBrains Mono';font-size:.88em;background:#191c24;border:1px solid rgba(255,255,255,.08);padding:1px 5px;border-radius:5px}
.hidden{display:none}
.foot{margin-top:22px;text-align:center;color:#838996;font:400 11px 'JetBrains Mono'}
</style>
</head>
<body>
<main>
  <div class="top">
    <div class="brand"><a class="home" href="../" title="Exile Hub">⟁</a>
      <div><h1 class="t">PATCH NOTES</h1><div class="sub">via poedb · updated {updated}</div></div>
    </div>
    <div class="tabs">{tabs}</div>
  </div>
  {panels}
  <div class="foot">EXILE HUB · patch notes mirrored from poe(2)db · not affiliated with GGG</div>
</main>
<script>
  var btns=[].slice.call(document.querySelectorAll('.tab'));
  function has(g){return !!document.getElementById('p-'+g);}
  function show(g){if(!has(g))return;btns.forEach(function(b){b.classList.toggle('on',b.dataset.g===g);});
    ['poe2','poe1'].forEach(function(x){var p=document.getElementById('p-'+x);if(p)p.classList.toggle('hidden',x!==g);});}
  btns.forEach(function(b){b.addEventListener('click',function(){show(b.dataset.g);});});
  var initial=(location.hash||'').replace('#','');
  show(has(initial)?initial:(has('poe2')?'poe2':'poe1'));
  window.addEventListener('hashchange',function(){show((location.hash||'').replace('#',''));});
</script>
</body>
</html>
"""


def build_page(notes):
    order = [g for g in ("poe2", "poe1") if notes.get(g)]
    if not order:
        return None
    tabs, panels = [], []
    for i, g in enumerate(order):
        n = notes[g]
        on = " on" if i == 0 else ""
        short = {"poe2": "PoE 2", "poe1": "PoE 1"}[g]
        tabs.append('<button class="tab%s" data-g="%s">%s<span class="v">%s</span></button>'
                    % (on, g, short, htmllib.escape(n["version"])))
        hidden = "" if i == 0 else " hidden"
        panels.append(
            '<div class="panel%s" id="p-%s"><h1>%s Patch Notes</h1>'
            '<div class="src">poe(2)db · <a href="%s" target="_blank" rel="noreferrer">source ↗</a></div>'
            '<div class="body">%s</div></div>'
            % (hidden, g, htmllib.escape(n["version"]), htmllib.escape(n["url"], quote=True), n["html"]))
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    # .replace (not .format) so the CSS braces in PAGE are left alone
    return (PAGE.replace("{updated}", updated)
                .replace("{tabs}", "\n".join(tabs))
                .replace("{panels}", "\n".join(panels)))


def main():
    out_dir = os.environ.get("PATCHNOTES_DIR", "docs/patchnotes")
    notes = {}
    for game in SITES:
        try:
            n = notes_for(game)
        except (HTTPError, URLError, ValueError, OSError) as e:
            print("warn: %s patch notes failed: %s" % (game, e), file=sys.stderr)
            n = None
        if n:
            notes[game] = n
            print("%s: %s (%d chars)" % (game, n["version"], len(n["html"])))

    page = build_page(notes)
    if not page:
        print("no patch notes fetched; leaving page as-is", file=sys.stderr)
        return
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "index.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(page)
    print("wrote %s (%d bytes)" % (path, os.path.getsize(path)))


if __name__ == "__main__":
    main()
