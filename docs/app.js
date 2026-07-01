/* Exile Hub — vanilla-JS port of the "Exile Hub.dc.html" Claude Design component.
   Ported from the DCLogic/React component to a standalone page. Behaviour is kept
   faithful: game tabs, command-palette omnibar, league-timeline embed, link tiles,
   Reddit "Hot" feed, and a YouTube trending feed read from this repo's own RSS. */
(function () {
  'use strict';

  // ---- config (was the .dc `data-props` defaults) ----
  var PROPS = {
    startGame: 'poe2',        // 'poe2' | 'poe1'
    searchMode: 'wiki',       // 'wiki' | 'trade'
    videoPlayer: 'youtube',   // 'youtube' | 'piped' | 'invidious'
    showTimeline: true,
    timelineHeight: 248,
    showReddit: true,
    showYoutube: true,
    accentPoe2: '#e8a13a',
    accentPoe1: '#4aa3c7'
  };

  // ---- site data (verbatim from the design; poe1 feed points at this repo's /poe1/) ----
  var RAW = {
    poe2: {
      tag: 'Wraeclast · 0.5 Return of the Ancients',
      steam: 'steam://rungameid/2694490',
      wikiApi: 'https://www.poe2wiki.net',
      wikiSearch: 'https://www.poe2wiki.net/index.php?search=',
      trade: 'https://www.pathofexile.com/trade2/search/poe2',
      ytFeed: 'https://bigbes.github.io/poe2-discovery/poe2/feed.xml',
      ytSearch: 'https://www.youtube.com/results?search_query=Path+of+Exile+2',
      timelineSlug: 'path-of-exile2',
      timelinePage: 'https://www.arpg-timeline.com/game/path-of-exile2',
      featured: [
        { label: 'Official Site', sub: 'pathofexile.com/poe2', url: 'https://www.pathofexile.com/poe2' },
        { label: 'Trade', sub: 'Official market', url: 'https://www.pathofexile.com/trade2' },
        { label: 'PoE 2 Wiki', sub: 'poe2wiki.net', url: 'https://www.poe2wiki.net' },
        { label: 'PoE2 Scout', sub: 'Prices & economy', url: 'https://poe2scout.com' }
      ],
      groups: [
        { title: 'Economy & Builds', links: [
          { label: 'poe.ninja', note: 'Economy', url: 'https://poe.ninja/poe2/builds' },
          { label: 'Maxroll', note: 'Guides', url: 'https://maxroll.gg/poe2' },
          { label: 'Mobalytics', note: 'Builds', url: 'https://mobalytics.gg/poe-2' },
          { label: 'Path of Building', note: 'PoB', url: 'https://pathofbuilding.community/' }
        ]},
        { title: 'Crafting & Data', links: [
          { label: 'PoE2DB', note: 'Database', url: 'https://poe2db.tw' },
          { label: 'Craft of Exile', note: 'Sim', url: 'https://www.craftofexile.com/?game=poe2' },
          { label: 'PoE Regex', note: 'Filters', url: 'https://poe.re/' }
        ]},
        { title: 'Community', links: [
          { label: 'r/PathOfExile2', note: 'Reddit', url: 'https://www.reddit.com/r/PathOfExile2/' },
          { label: 'PoE Hub', note: 'Link hub', url: 'https://poe-hub.weosoft.org/#poe2' },
          { label: 'Patch Notes', note: 'Latest', url: 'https://www.pathofexile.com/forum/view-forum/2212' }
        ]}
      ]
    },
    poe1: {
      tag: 'Wraeclast · 3.26 League',
      steam: 'steam://rungameid/238960',
      wikiApi: 'https://www.poewiki.net',
      wikiSearch: 'https://www.poewiki.net/index.php?search=',
      trade: 'https://www.pathofexile.com/trade',
      ytFeed: 'https://bigbes.github.io/poe2-discovery/poe1/feed.xml',
      ytSearch: 'https://www.youtube.com/results?search_query=Path+of+Exile',
      timelineSlug: 'path-of-exile',
      timelinePage: 'https://www.arpg-timeline.com/game/path-of-exile',
      featured: [
        { label: 'Official Site', sub: 'pathofexile.com', url: 'https://www.pathofexile.com' },
        { label: 'Trade', sub: 'Official market', url: 'https://www.pathofexile.com/trade' },
        { label: 'PoE Wiki', sub: 'poewiki.net', url: 'https://www.poewiki.net' },
        { label: 'poe.ninja', sub: 'Economy & builds', url: 'https://poe.ninja' }
      ],
      groups: [
        { title: 'Builds & Tools', links: [
          { label: 'Maxroll', note: 'Guides', url: 'https://maxroll.gg/poe' },
          { label: 'pobb.in', note: 'PoB share', url: 'https://pobb.in' },
          { label: 'Path of Building', note: 'PoB', url: 'https://pathofbuilding.community/' },
          { label: 'Mobalytics', note: 'Builds', url: 'https://mobalytics.gg/poe' }
        ]},
        { title: 'Crafting & Data', links: [
          { label: 'PoEDB', note: 'Database', url: 'https://poedb.tw' },
          { label: 'Craft of Exile', note: 'Sim', url: 'https://www.craftofexile.com' },
          { label: 'PoE Regex', note: 'Filters', url: 'https://poe.re/' }
        ]},
        { title: 'Community', links: [
          { label: 'r/pathofexile', note: 'Reddit', url: 'https://www.reddit.com/r/pathofexile/' },
          { label: 'PoE Hub', note: 'Link hub', url: 'https://poe-hub.weosoft.org/' },
          { label: 'Patch Notes', note: 'Latest', url: 'https://www.pathofexile.com/forum/view-forum/40' }
        ]}
      ]
    }
  };

  // ---- tiny helpers ----
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var App = {
    state: {
      game: null, q: '', mode: null, suggestions: [], open: false, hl: -1,
      reddit: [], redditState: 'loading', yt: [], ytState: 'loading',
      modal: null, vmax: false
    },
    _dec: null, _rows: [],

    setState: function (patch) {
      var next = typeof patch === 'function' ? patch(this.state) : patch;
      for (var k in next) this.state[k] = next[k];
      this.render();
    },

    gameKey: function () { return this.state.game != null ? this.state.game : (PROPS.startGame || 'poe2'); },
    modeKey: function () { return this.state.mode != null ? this.state.mode : (PROPS.searchMode || 'wiki'); },
    redditSub: function () { return this.gameKey() === 'poe2' ? 'PathOfExile2' : 'pathofexile'; },
    setGame: function (g) { this.setState({ game: g, suggestions: [], open: false }); this.fetchReddit(g); this.fetchYoutube(g); },
    setMode: function (m) { this.setState({ mode: m }); },

    // ---- theming ----
    hexToRgba: function (hex, a) {
      var h = hex.replace('#', '');
      var n = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
      return 'rgba(' + parseInt(n.slice(0, 2), 16) + ',' + parseInt(n.slice(2, 4), 16) + ',' + parseInt(n.slice(4, 6), 16) + ',' + a + ')';
    },
    accStyle: function (g) {
      var m = g === 'poe2'
        ? { a: PROPS.accentPoe2 || '#e8a13a', a2: '#f7d089' }
        : { a: PROPS.accentPoe1 || '#4aa3c7', a2: '#8fd9ef' };
      return { '--acc': m.a, '--acc2': m.a2, '--glow': this.hexToRgba(m.a, 0.22) };
    },

    // ---- timeline ----
    scaleTl: function () {
      var wrap = el('tlWrap'), ifr = el('tlIframe');
      if (!wrap || !ifr) return;
      var CROP = PROPS.timelineHeight != null ? PROPS.timelineHeight : 248;
      ifr.style.width = '100%';
      ifr.style.maxWidth = '720px';
      ifr.style.margin = '0 auto';
      ifr.style.display = 'block';
      ifr.style.transform = 'none';
      ifr.style.height = (CROP + 120) + 'px';
      wrap.style.height = CROP + 'px';
    },

    // ---- icons ----
    fav: function (url) { try { return 'https://icons.duckduckgo.com/ip3/' + new URL(url).hostname + '.ico'; } catch (e) { return ''; } },
    withIcons: function (list) {
      var self = this;
      return list.map(function (x) {
        return { label: x.label, sub: x.sub, note: x.note, url: x.url, icon: self.fav(x.url), mono: (x.label || '?').trim().charAt(0).toUpperCase() };
      });
    },

    // ---- text utils ----
    decode: function (s) {
      if (!s) return '';
      if (!this._dec) this._dec = document.createElement('textarea');
      this._dec.innerHTML = s;
      return this._dec.value;
    },
    kfmt: function (n) {
      if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
    },
    host: function (u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } },
    gsite: function (host, q) { return 'https://www.google.com/search?q=' + encodeURIComponent('site:' + host + ' ' + q); },

    // ---- minimal markdown -> html (Reddit selftext / comments) ----
    md: function (src) {
      if (!src) return '';
      var esc2 = function (t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
      var inline = function (t) {
        t = esc2(t);
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
        t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
        t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
        t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>');
        return t;
      };
      var lines = src.replace(/\r\n/g, '\n').split('\n');
      var html = '', para = [], inUl = false, inOl = false, inQ = false;
      var flushP = function () { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
      var closeL = function () { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };
      var closeQ = function () { if (inQ) { html += '</blockquote>'; inQ = false; } };
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i], m;
        if (/^\s*$/.test(line)) { flushP(); closeL(); closeQ(); continue; }
        if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flushP(); closeL(); closeQ(); var l = m[1].length; html += '<h' + l + '>' + inline(m[2]) + '</h' + l + '>'; continue; }
        if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushP(); closeL(); closeQ(); html += '<hr>'; continue; }
        if (/^\s*([-*+])\s+/.test(line)) { flushP(); closeQ(); if (!inUl) { closeL(); html += '<ul>'; inUl = true; } html += '<li>' + inline(line.replace(/^\s*[-*+]\s+/, '')) + '</li>'; continue; }
        if (/^\s*\d+\.\s+/.test(line)) { flushP(); closeQ(); if (!inOl) { closeL(); html += '<ol>'; inOl = true; } html += '<li>' + inline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>'; continue; }
        if ((m = line.match(/^\s*>\s?(.*)$/))) { flushP(); closeL(); if (!inQ) { html += '<blockquote>'; inQ = true; } html += inline(m[1]) + '<br>'; continue; }
        closeL(); closeQ(); para.push(line);
      }
      flushP(); closeL(); closeQ();
      return html;
    },

    // ---- YouTube trending (from this repo's RSS) ----
    fetchYoutube: function (g) {
      var self = this;
      var game = g || this.gameKey();
      if (this._ytGame === game && this.state.yt.length) return;
      this._ytGame = game;
      this.setState({ ytState: 'loading', yt: [] });
      if (this._ytAc) this._ytAc.abort();
      this._ytAc = new AbortController();
      setTimeout(function () { try { self._ytAc.abort(); } catch (e) {} }, 12000);
      fetch(RAW[game].ytFeed, { signal: this._ytAc.signal })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (txt) {
          if (self._ytGame !== game) return;
          var doc = new DOMParser().parseFromString(txt, 'text/xml');
          if (doc.querySelector('parsererror')) throw new Error('parse');
          var items = [].slice.call(doc.querySelectorAll('item')).slice(0, 8).map(function (it) {
            var rawTitle = (it.querySelector('title') || {}).textContent || '';
            var link = (it.querySelector('link') || {}).textContent || '';
            var desc = (it.querySelector('description') || {}).textContent || '';
            var vid = (link.match(/[?&]v=([^&]+)/) || [])[1] || '';
            var pm = rawTitle.match(/^\[[^\]]*?([\d.]+k?\/hr)[^\]]*?·\s*([\d.]+k?)\s*views[^\]]*\]\s*(.*)$/i);
            var velocity = pm ? pm[1] : '';
            var views = pm ? pm[2] : '';
            var title = pm ? pm[3] : rawTitle.replace(/^\[[^\]]*\]\s*/, '');
            var dd = document.createElement('div'); dd.innerHTML = desc;
            var bold = dd.querySelector('b');
            var channel = bold ? bold.textContent.trim() : '';
            return { vid: vid, title: title, channel: channel, velocity: velocity, views: views, url: link,
              thumb: vid ? 'https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg' : '' };
          }).filter(function (v) { return v.url; });
          self.setState({ yt: items, ytState: items.length ? 'ok' : 'empty' });
        })
        .catch(function (e) { if (e.name !== 'AbortError' && self._ytGame === game) self.setState({ ytState: 'error' }); });
    },

    // ---- Reddit hot (JSONP; Reddit blocks cross-origin fetch) ----
    fetchReddit: function (g) {
      var self = this;
      var sub = (g || this.gameKey()) === 'poe2' ? 'PathOfExile2' : 'pathofexile';
      if (this._rdSub === sub && this.state.reddit.length) return;
      this._rdSub = sub;
      this.setState({ redditState: 'loading', reddit: [] });
      var cb = '__exileReddit' + Date.now();
      var cleanup = function () { try { delete window[cb]; } catch (e) {} if (self._rdScript) { self._rdScript.remove(); self._rdScript = null; } };
      var guard = setTimeout(function () {
        if (self._rdSub === sub && self.state.redditState === 'loading') self.setState({ redditState: 'error' });
        cleanup();
      }, 12000);
      window[cb] = function (d) {
        clearTimeout(guard);
        if (self._rdSub !== sub) { cleanup(); return; }
        var posts = ((d && d.data && d.data.children) || [])
          .map(function (c) { return c.data; })
          .filter(function (p) { return p && !p.stickied; })
          .slice(0, 13)
          .map(function (p) {
            return {
              id: p.id, title: self.decode(p.title), score: self.kfmt(p.score),
              comments: self.kfmt(p.num_comments), url: 'https://www.reddit.com' + p.permalink,
              flair: self.decode(p.link_flair_text || ''), author: p.author,
              selftext: self.decode(p.selftext || ''), image: self.redditImage(p),
              link: (p.is_self || (p.domain || '').indexOf('self.') === 0) ? '' : (p.url_overridden_by_dest || p.url || ''),
              domain: p.domain || ''
            };
          });
        self.setState({ reddit: posts, redditState: posts.length ? 'ok' : 'empty' });
        cleanup();
      };
      var s = document.createElement('scr' + 'ipt');
      s.src = 'https://www.reddit.com/r/' + sub + '/hot.json?limit=14&raw_json=1&jsonp=' + cb;
      s.onerror = function () { clearTimeout(guard); if (self._rdSub === sub) self.setState({ redditState: 'error' }); cleanup(); };
      this._rdScript = s;
      document.head.appendChild(s);
    },
    redditImage: function (p) {
      var direct = p.url_overridden_by_dest || p.url || '';
      if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(direct)) return direct;
      try {
        var src = p.preview && p.preview.images && p.preview.images[0];
        if (src) {
          var best = (src.resolutions || []).filter(function (r) { return r.width <= 960; }).pop() || src.source;
          return this.decode(best.url);
        }
      } catch (e) {}
      return '';
    },
    fetchComments: function (p) {
      var self = this;
      var cb = '__exileCmt' + Date.now();
      var cleanup = function () { try { delete window[cb]; } catch (e) {} if (self._cScript) { self._cScript.remove(); self._cScript = null; } };
      var guard = setTimeout(function () {
        self.setState(function (s) { return (s.modal && s.modal.p && s.modal.p.id === p.id && s.modal.cstate === 'loading') ? { modal: mergeModal(s.modal, { cstate: 'error' }) } : {}; });
        cleanup();
      }, 10000);
      window[cb] = function (data) {
        clearTimeout(guard);
        var list = [];
        try {
          list = (data[1].data.children || [])
            .map(function (c) { return c.data; })
            .filter(function (c) { return c && c.body && !c.stickied; })
            .slice(0, 6)
            .map(function (c) { return { author: c.author, score: self.kfmt(c.score), body: self.decode(c.body) }; });
        } catch (e) {}
        self.setState(function (s) { return (s.modal && s.modal.p && s.modal.p.id === p.id) ? { modal: mergeModal(s.modal, { comments: list, cstate: list.length ? 'ok' : 'empty' }) } : {}; });
        cleanup();
      };
      var s = document.createElement('scr' + 'ipt');
      s.src = 'https://www.reddit.com/comments/' + p.id + '.json?limit=8&sort=top&raw_json=1&jsonp=' + cb;
      s.onerror = function () { clearTimeout(guard); self.setState(function (st) { return (st.modal && st.modal.p && st.modal.p.id === p.id) ? { modal: mergeModal(st.modal, { cstate: 'error' }) } : {}; }); cleanup(); };
      this._cScript = s;
      document.head.appendChild(s);
    },

    // ---- omnibar command registry ----
    registry: function (g) {
      var self = this, d = RAW[g], is2 = g === 'poe2';
      return [
        { keys: ['w', 'wiki'], label: is2 ? 'PoE 2 Wiki' : 'PoE Wiki', hint: 'Search the wiki', native: 'wiki',
          home: d.wikiApi, search: function (q) { return d.wikiSearch + encodeURIComponent(q); } },
        { keys: ['t', 'trade'], label: 'Official Trade', hint: 'Open the market search (query not pre-fillable)',
          home: d.trade, search: function () { return d.trade; } },
        { keys: ['db'], label: is2 ? 'PoE2DB' : 'PoEDB', hint: 'Item, skill & modifier database',
          home: is2 ? 'https://poe2db.tw' : 'https://poedb.tw', search: function (q) { return self.gsite(is2 ? 'poe2db.tw' : 'poedb.tw', q); } },
        { keys: ['coe', 'craft'], label: 'Craft of Exile', hint: 'Crafting simulator — search a base',
          home: is2 ? 'https://www.craftofexile.com/?game=poe2' : 'https://www.craftofexile.com', search: function (q) { return self.gsite('craftofexile.com', q); } },
        { keys: ['re', 'regex'], label: 'PoE Regex', hint: 'Stash / vendor filter generator',
          home: 'https://poe.re/', search: function (q) { return self.gsite('poe.re', q); } },
        { keys: ['n', 'ninja'], label: 'poe.ninja', hint: 'Economy prices & builds',
          home: is2 ? 'https://poe.ninja/poe2/builds' : 'https://poe.ninja', search: function (q) { return self.gsite('poe.ninja', q); } },
        { keys: ['mx', 'maxroll'], label: 'Maxroll', hint: 'Build guides & planners',
          home: is2 ? 'https://maxroll.gg/poe2' : 'https://maxroll.gg/poe', search: function (q) { return self.gsite(is2 ? 'maxroll.gg/poe2' : 'maxroll.gg/poe', q); } },
        { keys: ['pob'], label: 'Path of Building', hint: 'PoB community & builds',
          home: 'https://pathofbuilding.community/', search: function (q) { return self.gsite('pathofbuilding.community', q); } },
        { keys: is2 ? ['sc', 'scout'] : ['db2'], label: is2 ? 'PoE2 Scout' : 'poeprices', hint: is2 ? 'Prices & economy' : 'Price checking',
          home: is2 ? 'https://poe2scout.com' : 'https://poeprices.info', search: function (q) { return self.gsite(is2 ? 'poe2scout.com' : 'poeprices.info', q); } },
        { keys: ['r', 'reddit'], label: is2 ? 'r/PathOfExile2' : 'r/pathofexile', hint: 'Search the subreddit',
          home: 'https://www.reddit.com/r/' + (is2 ? 'PathOfExile2' : 'pathofexile') + '/',
          search: function (q) { return 'https://www.reddit.com/r/' + (is2 ? 'PathOfExile2' : 'pathofexile') + '/search/?restrict_sr=1&q=' + encodeURIComponent(q); } },
        { keys: ['yt', 'youtube'], label: 'YouTube', hint: 'Search PoE videos',
          home: d.ytSearch, search: function (q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent((is2 ? 'Path of Exile 2 ' : 'Path of Exile ') + q); } }
      ];
    },
    findCmd: function (reg, tok) {
      tok = (tok || '').toLowerCase();
      return reg.find(function (c) { return c.keys.includes(tok); }) || reg.find(function (c) { return c.keys.some(function (k) { return k.startsWith(tok); }); });
    },

    fetchSuggest: function (q) {
      var self = this;
      clearTimeout(this._t);
      if (!q || q.trim().length < 2) { this.setState({ suggestions: [] }); return; }
      this._t = setTimeout(function () {
        var g = RAW[self.gameKey()];
        var url = g.wikiApi + '/api.php?action=opensearch&format=json&limit=8&origin=*&search=' + encodeURIComponent(q.trim());
        if (self._ac) self._ac.abort();
        self._ac = new AbortController();
        fetch(url, { signal: self._ac.signal })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var titles = (d && d[1]) || [], urls = (d && d[3]) || [];
            self.setState({ suggestions: titles.map(function (t, i) { return { title: t, pageUrl: urls[i] }; }) });
          })
          .catch(function () {});
      }, 180);
    },

    openUrl: function (url) { if (url) window.open(url, '_blank', 'noreferrer'); this.setState({ open: false, hl: -1 }); },

    onQueryInput: function (v) {
      this.setState({ q: v, open: true, hl: -1 });
      if (v.startsWith('?')) { this.setState({ suggestions: [] }); return; }
      if (v.startsWith('/')) {
        var body = v.slice(1); var sp = body.indexOf(' ');
        var c = sp > -1 ? this.findCmd(this.registry(this.gameKey()), body.slice(0, sp)) : null;
        if (c && c.native === 'wiki') this.fetchSuggest(body.slice(sp + 1));
        else this.setState({ suggestions: [] });
        return;
      }
      if (this.modeKey() === 'wiki') this.fetchSuggest(v); else this.setState({ suggestions: [] });
    },

    buildRows: function () {
      var self = this;
      var g = this.gameKey();
      var reg = this.registry(g);
      var q = this.state.q;
      var rows = [];
      var wikiRows = function (limit) {
        return self.state.suggestions.slice(0, limit).map(function (s) {
          return { badge: 'wiki', title: s.title, sub: '', action: '↵', run: function () { self.openUrl(s.pageUrl || (RAW[g].wikiSearch + encodeURIComponent(s.title))); } };
        });
      };
      if (q.startsWith('/')) {
        var body = q.slice(1); var sp = body.indexOf(' ');
        if (sp === -1) {
          var tok = body.toLowerCase();
          var matches = reg.filter(function (c) { return c.keys.some(function (k) { return k.startsWith(tok); }); });
          (matches.length ? matches : reg).forEach(function (c) {
            rows.push({ badge: '/' + c.keys[0], title: c.label, sub: c.hint, action: 'Tab', run: function () { self.pickCommand(c); } });
          });
        } else {
          var tok2 = body.slice(0, sp), query = body.slice(sp + 1);
          var c = this.findCmd(reg, tok2);
          if (c) {
            rows.push({ badge: '/' + c.keys[0],
              title: query.trim() ? ('Search ' + c.label + ' for “' + query.trim() + '”') : ('Open ' + c.label),
              sub: c.hint, action: '↵', run: function () { self.runCommand(c, query); } });
            if (c.native === 'wiki' && query.trim()) wikiRows(6).forEach(function (r) { rows.push(r); });
          } else {
            rows.push({ badge: '/?', title: 'Unknown command “' + tok2 + '”', sub: 'Press ↵ to search the wiki instead', action: '↵', run: function () { self.defaultGo(body); } });
          }
        }
      } else if (q.startsWith('?')) {
        var tok3 = q.slice(1).toLowerCase();
        reg.filter(function (c) { return !tok3 || c.keys.some(function (k) { return k.startsWith(tok3); }) || c.label.toLowerCase().includes(tok3); })
          .forEach(function (c) { rows.push({ badge: '?' + c.keys[0], title: c.label, sub: self.host(c.home), action: '↗', run: function () { self.openUrl(c.home); } }); });
      } else if (this.modeKey() === 'trade') {
        rows.push({ badge: 'trade', title: q.trim() ? ('Open Trade — search “' + q.trim() + '” there') : 'Open Official Trade', sub: this.host(RAW[g].trade), action: '↗', run: function () { self.openUrl(RAW[g].trade); } });
      } else {
        wikiRows(8).forEach(function (r) { rows.push(r); });
      }
      this._rows = rows;
      return rows;
    },

    pickCommand: function (c) { this.setState({ q: '/' + c.keys[0] + ' ', hl: -1, open: true, suggestions: [] }); if (this._input) this._input.focus(); },
    runCommand: function (c, query) { var q = (query || '').trim(); this.openUrl(q ? c.search(q) : c.home); },
    defaultGo: function (term) { var g = RAW[this.gameKey()]; var t = (term || '').trim(); this.openUrl(t ? g.wikiSearch + encodeURIComponent(t) : g.wikiApi); },
    execRaw: function () {
      var q = this.state.q, reg = this.registry(this.gameKey());
      if (q.startsWith('/')) {
        var body = q.slice(1); var sp = body.indexOf(' ');
        var tok = sp === -1 ? body : body.slice(0, sp);
        var query = sp === -1 ? '' : body.slice(sp + 1);
        var c = this.findCmd(reg, tok);
        if (c) { if (sp === -1) this.pickCommand(c); else this.runCommand(c, query); }
        else this.defaultGo(body);
      } else if (q.startsWith('?')) {
        var tok2 = q.slice(1).toLowerCase();
        var c2 = this.findCmd(reg, tok2) || reg.find(function (x) { return x.label.toLowerCase().includes(tok2); });
        if (c2) this.openUrl(c2.home);
      } else if (this.modeKey() === 'trade') {
        this.openUrl(RAW[this.gameKey()].trade);
      } else {
        this.defaultGo(q);
      }
    },
    onSubmitBar: function (e) {
      e.preventDefault();
      var rows = this._rows || [];
      if (this.state.open && this.state.hl >= 0 && rows[this.state.hl]) { rows[this.state.hl].run(); return; }
      this.execRaw();
    },
    onKeyBar: function (e) {
      var self = this;
      var rows = this._rows || [];
      if (e.key === 'ArrowDown') { e.preventDefault(); this.setState(function (s) { return { open: true, hl: Math.min((s.hl < 0 ? -1 : s.hl) + 1, rows.length - 1) }; }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState(function (s) { return { hl: Math.max((s.hl < 0 ? 0 : s.hl) - 1, -1) }; }); }
      else if (e.key === 'Tab') {
        var q = this.state.q;
        if (q.startsWith('/') && q.indexOf(' ') === -1) {
          e.preventDefault();
          var c = this.findCmd(this.registry(this.gameKey()), q.slice(1));
          if (c) this.pickCommand(c);
        }
      } else if (e.key === 'Escape') { this.setState({ open: false, hl: -1 }); }
    },

    // ---- modal ----
    openVideo: function (v) { this.setState({ modal: { type: 'yt', v: v }, vmax: false }); },
    toggleMax: function () { this.setState(function (s) { return { vmax: !s.vmax }; }); },
    openPost: function (p) { this.setState({ modal: { type: 'reddit', p: p, comments: [], cstate: 'loading' } }); this.fetchComments(p); },
    closeModal: function () { this.setState({ modal: null }); },

    // ---- render ----
    render: function () {
      var g = this.gameKey(), mode = this.modeKey(), data = RAW[g];

      var acc = this.accStyle(g), dash = el('dash');
      for (var k in acc) dash.style.setProperty(k, acc[k]);
      el('tag').textContent = data.tag;
      el('tab2').classList.toggle('on', g === 'poe2');
      el('tab1').classList.toggle('on', g === 'poe1');
      el('launch').setAttribute('href', data.steam);

      el('segWiki').classList.toggle('on', mode === 'wiki');
      el('segTrade').classList.toggle('on', mode === 'trade');
      el('leadIcon').textContent = this.state.q.startsWith('/') ? '/' : this.state.q.startsWith('?') ? '?' : '⌕';
      var ph = mode === 'wiki'
        ? ((g === 'poe2' ? 'Search PoE 2 Wiki' : 'Search PoE Wiki') + '   ·   / commands   ·   ? jump to site')
        : 'Open Trade   ·   / commands   ·   ? jump to site';
      var input = el('q');
      input.placeholder = ph;
      if (input.value !== this.state.q) input.value = this.state.q;
      el('kbHint').textContent = mode === 'wiki' ? 'WIKI ↵' : 'TRADE ↵';

      this.renderDrop(g, mode);

      if (this._renderedGame !== g) {
        this._renderedGame = g;
        this.renderFeatured(data);
        this.renderGroups(data);
        this.renderTimeline(data);
      }

      this.renderReddit();
      this.renderYoutube();
      this.renderModal();
    },

    renderDrop: function (g, mode) {
      var mount = el('dropMount');
      var rows = this.buildRows();
      var show = this.state.open && rows.length > 0;
      if (!show) { if (mount.firstChild) mount.innerHTML = ''; return; }
      var dropHint = this.state.q.startsWith('/') ? 'Site commands · ↵ run · Tab to complete'
        : this.state.q.startsWith('?') ? 'Jump to a site · ↵ opens it'
        : mode === 'trade' ? 'Trade · ↵ opens the market' : 'Wiki suggestions · ↵ opens page';
      var self = this;
      var html = '<div class="drop"><div class="dhint">' + esc(dropHint) + '</div>';
      rows.forEach(function (r, i) {
        html += '<div class="drow ' + (i === self.state.hl ? 'hl' : '') + '" data-i="' + i + '">'
          + '<span class="dkey">' + esc(r.badge) + '</span>'
          + '<span class="dbody"><span class="dt">' + esc(r.title) + '</span>'
          + (r.sub ? '<span class="dsub">' + esc(r.sub) + '</span>' : '') + '</span>'
          + '<span class="dg">' + esc(r.action) + '</span></div>';
      });
      html += '</div>';
      mount.innerHTML = html;
    },

    renderFeatured: function (data) {
      var tiles = this.withIcons(data.featured);
      var html = '';
      tiles.forEach(function (t) {
        html += '<a class="ftile" href="' + esc(t.url) + '" target="_blank" rel="noreferrer">'
          + '<div class="chip">' + esc(t.mono) + '<img src="' + esc(t.icon) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"/></div>'
          + '<div class="ft-l">' + esc(t.label) + '</div>'
          + '<div class="ft-s">' + esc(t.sub) + '</div>'
          + '<span class="ft-go">↗</span></a>';
      });
      el('feat').innerHTML = html;
    },

    renderGroups: function (data) {
      var self = this;
      var html = '';
      data.groups.forEach(function (gr) {
        html += '<div class="lgroup"><div class="lg-t">' + esc(gr.title) + '</div>';
        self.withIcons(gr.links).forEach(function (l) {
          html += '<a class="lrow" href="' + esc(l.url) + '" target="_blank" rel="noreferrer">'
            + '<span class="lchip">' + esc(l.mono) + '<img src="' + esc(l.icon) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"/></span>'
            + '<span class="ll">' + esc(l.label) + '</span>'
            + '<span class="ln">' + esc(l.note) + '</span>'
            + '<span class="lgo">↗</span></a>';
        });
        html += '</div>';
      });
      el('groups').innerHTML = html;
    },

    renderTimeline: function (data) {
      var block = el('tlBlock');
      if (!(PROPS.showTimeline !== false)) { block.style.display = 'none'; return; }
      block.style.display = '';
      el('tlSrc').setAttribute('href', data.timelinePage);
      var ifr = el('tlIframe');
      var src = 'https://www.arpg-timeline.com/embed/season-widget/' + data.timelineSlug;
      if (ifr.getAttribute('src') !== src) ifr.setAttribute('src', src);
      var self = this;
      ifr.onload = function () { self.scaleTl(); };
      requestAnimationFrame(function () { self.scaleTl(); });
    },

    renderReddit: function () {
      var box = el('reddit');
      if (!(PROPS.showReddit !== false)) { box.style.display = 'none'; return; }
      box.style.display = '';
      var sub = this.redditSub();
      var subUrl = 'https://www.reddit.com/r/' + sub + '/';
      var key = sub + '|' + this.state.redditState + '|' + this.state.reddit.length;
      if (this._rdKey === key) return;
      this._rdKey = key;
      var html = '<div class="rd-h"><span class="rd-t"><span class="rd-fire">🔥</span>Hot · r/' + esc(sub) + '</span>'
        + '<a class="rd-src" href="' + esc(subUrl) + '" target="_blank" rel="noreferrer">open subreddit ↗</a></div>';
      if (this.state.redditState === 'ok') {
        html += '<div class="rd-grid">';
        this.state.reddit.forEach(function (p, i) {
          html += '<a class="rd-post" href="' + esc(p.url) + '" data-rd="' + i + '" target="_blank" rel="noreferrer">'
            + '<span class="rd-score"><span class="rd-up">' + esc(p.score) + '</span><span class="rd-uk">upvotes</span></span>'
            + '<span class="rd-body"><span class="rd-title">' + esc(p.title) + '</span>'
            + '<span class="rd-meta">' + (p.flair ? '<span class="rd-flair">' + esc(p.flair) + '</span>' : '') + '<span>💬 ' + esc(p.comments) + '</span></span>'
            + '</span></a>';
        });
        html += '</div>';
      } else {
        var msg = this.state.redditState === 'loading' ? 'Loading hot posts…'
          : this.state.redditState === 'error' ? 'Couldn’t load Reddit here'
          : this.state.redditState === 'empty' ? 'No posts right now' : '';
        html += '<div class="rd-msg">' + esc(msg) + ' · <a href="' + esc(subUrl) + '" target="_blank" rel="noreferrer">open r/' + esc(sub) + ' ↗</a></div>';
      }
      box.innerHTML = html;
    },

    renderYoutube: function () {
      var box = el('yt');
      if (!(PROPS.showYoutube !== false)) { box.style.display = 'none'; return; }
      box.style.display = '';
      var g = this.gameKey(), data = RAW[g];
      var label = g === 'poe2' ? 'PoE 2' : 'PoE';
      var key = g + '|' + this.state.ytState + '|' + this.state.yt.length;
      if (this._ytKey === key) return;
      this._ytKey = key;
      var html = '<div class="yt-h"><span class="yt-t"><span class="yt-fire">🔥</span>Trending / Hot on YouTube · ' + esc(label) + '</span>'
        + '<a class="yt-src" href="' + esc(data.ytSearch) + '" target="_blank" rel="noreferrer">more on YouTube ↗</a></div>';
      if (this.state.ytState === 'ok') {
        html += '<div class="yt-grid">';
        this.state.yt.forEach(function (v, i) {
          html += '<a class="yt-card" href="' + esc(v.url) + '" data-yt="' + i + '" target="_blank" rel="noreferrer">'
            + '<span class="yt-thumb"><img src="' + esc(v.thumb) + '" alt="" loading="lazy"/>'
            + (v.velocity ? '<span class="yt-badge">▲ ' + esc(v.velocity) + '</span>' : '')
            + '<span class="yt-play">▶</span></span>'
            + '<span class="yt-info"><span class="yt-title">' + esc(v.title) + '</span>'
            + '<span class="yt-meta"><span class="yt-ch">' + esc(v.channel) + '</span><span class="yt-views">· ' + esc(v.views) + ' views</span></span>'
            + '</span></a>';
        });
        html += '</div>';
      } else {
        var msg = this.state.ytState === 'loading' ? 'Loading trending videos…'
          : this.state.ytState === 'error' ? 'Couldn’t load the trending feed'
          : this.state.ytState === 'empty' ? 'No trending videos right now' : '';
        html += '<div class="yt-msg">' + esc(msg) + ' · <a href="' + esc(data.ytSearch) + '" target="_blank" rel="noreferrer">search YouTube ↗</a></div>';
      }
      box.innerHTML = html;
    },

    renderModal: function () {
      var m = this.state.modal;
      var mount = el('modalMount');
      var sig = m ? (m.type + '|' + (m.type === 'yt' ? (m.v.vid + '|' + this.state.vmax) : (m.p.id + '|' + m.cstate + '|' + (m.comments ? m.comments.length : 0))) ) : 'none';
      if (this._modalSig === sig) return;
      this._modalSig = sig;
      if (!m) { mount.innerHTML = ''; return; }

      var maxCls = this.state.vmax ? 'max' : '';
      var inner = '<button class="ov-x" data-act="close">✕</button>';

      if (m.type === 'yt') {
        var v = m.v;
        var player = PROPS.videoPlayer || 'youtube';
        var origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? '&origin=' + encodeURIComponent(location.origin) : '';
        var embeds = {
          youtube: 'https://www.youtube.com/embed/' + v.vid + '?autoplay=1&rel=0' + origin,
          piped: 'https://piped.video/embed/' + v.vid + '?autoplay=1',
          invidious: 'https://yewtu.be/embed/' + v.vid + '?autoplay=1'
        };
        var embed = embeds[player] || embeds.youtube;
        inner += '<button class="ov-max" data-act="max" title="' + (this.state.vmax ? 'Restore' : 'Maximize') + '">' + (this.state.vmax ? '⤡' : '⤢') + '</button>'
          + '<div class="ov-video"><iframe src="' + esc(embed) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="YouTube video"></iframe></div>'
          + '<div class="ov-vmeta"><div class="ov-vtitle">' + esc(v.title) + '</div>'
          + '<div class="ov-vsub"><span class="ov-vch">' + esc(v.channel) + '</span><span>· ' + esc(v.views) + ' views</span></div>'
          + '<div class="ov-vlinks"><span class="ov-vlk">Won’t play? Open:</span>'
          + '<a class="ov-vlink" href="' + esc(v.url) + '" target="_blank" rel="noreferrer">YouTube ↗</a>'
          + '<a class="ov-vlink" href="https://piped.video/watch?v=' + esc(v.vid) + '" target="_blank" rel="noreferrer">Piped ↗</a>'
          + '<a class="ov-vlink" href="https://yewtu.be/watch?v=' + esc(v.vid) + '" target="_blank" rel="noreferrer">Invidious ↗</a></div></div>';
      } else {
        var p = m.p;
        inner += '<div class="ov-scroll"><div class="ov-phead"><div class="ov-pmeta"><span class="ov-pscore">▲ ' + esc(p.score) + '</span>'
          + (p.flair ? '<span class="rd-flair">' + esc(p.flair) + '</span>' : '')
          + '<span class="ov-pby">u/' + esc(p.author) + '</span></div>'
          + '<div class="ov-ptitle">' + esc(p.title) + '</div></div>';
        if (p.image) inner += '<img class="ov-pimg" src="' + esc(p.image) + '" alt="" loading="lazy"/>';
        if (p.selftext) inner += '<div class="ov-ptext ov-md">' + this.md(p.selftext) + '</div>';
        if (p.link) inner += '<a class="ov-plink" href="' + esc(p.link) + '" target="_blank" rel="noreferrer">🔗 ' + esc(p.domain) + ' ↗</a>';
        inner += '<div class="ov-csec"><div class="ov-clab">Top comments</div>';
        if (m.cstate === 'ok') {
          var self = this;
          (m.comments || []).forEach(function (c) {
            inner += '<div class="ov-comment"><div class="ov-cmeta"><span class="ov-cby">u/' + esc(c.author) + '</span><span class="ov-cscore">▲ ' + esc(c.score) + '</span></div>'
              + '<div class="ov-cbody ov-md">' + self.md(c.body) + '</div></div>';
          });
        } else {
          var cmsg = m.cstate === 'loading' ? 'Loading top comments…' : m.cstate === 'error' ? 'Couldn’t load comments' : m.cstate === 'empty' ? 'No comments yet' : '';
          if (cmsg) inner += '<div class="ov-cmsg">' + esc(cmsg) + '</div>';
        }
        inner += '</div></div><div class="ov-foot"><a class="ov-vlink" href="' + esc(p.url) + '" target="_blank" rel="noreferrer">Open thread on Reddit ↗</a></div>';
      }

      mount.innerHTML = '<div class="ov" data-act="overlay"><div class="ov-card ' + maxCls + '">' + inner + '</div></div>';
    },

    // ---- init / event wiring ----
    init: function () {
      var self = this;
      this._input = el('q');

      el('tab2').addEventListener('click', function () { self.setGame('poe2'); });
      el('tab1').addEventListener('click', function () { self.setGame('poe1'); });
      el('segWiki').addEventListener('click', function () { self.setMode('wiki'); });
      el('segTrade').addEventListener('click', function () { self.setMode('trade'); });

      el('sform').addEventListener('submit', function (e) { self.onSubmitBar(e); });
      this._input.addEventListener('input', function (e) { self.onQueryInput(e.target.value); });
      this._input.addEventListener('focus', function () { self.setState({ open: true }); });
      this._input.addEventListener('keydown', function (e) { self.onKeyBar(e); });

      // dropdown (delegated)
      var mount = el('dropMount');
      mount.addEventListener('mousedown', function (e) {
        var row = e.target.closest('.drow'); if (!row) return;
        e.preventDefault(); // keep focus in input
        var i = +row.getAttribute('data-i');
        if (self._rows[i]) self._rows[i].run();
      });
      mount.addEventListener('mouseover', function (e) {
        var row = e.target.closest('.drow'); if (!row) return;
        var i = +row.getAttribute('data-i');
        if (self.state.hl !== i) self.setState({ hl: i });
      });

      // close dropdown on outside click
      document.addEventListener('click', function (e) {
        if (!el('srow').contains(e.target) && self.state.open) self.setState({ open: false, hl: -1 });
      });

      // reddit / yt cards (delegated)
      el('reddit').addEventListener('click', function (e) {
        var a = e.target.closest('[data-rd]'); if (!a) return;
        e.preventDefault();
        var i = +a.getAttribute('data-rd');
        if (self.state.reddit[i]) self.openPost(self.state.reddit[i]);
      });
      el('yt').addEventListener('click', function (e) {
        var a = e.target.closest('[data-yt]'); if (!a) return;
        e.preventDefault();
        var i = +a.getAttribute('data-yt');
        if (self.state.yt[i]) self.openVideo(self.state.yt[i]);
      });

      // modal (delegated)
      el('modalMount').addEventListener('click', function (e) {
        var act = e.target.closest('[data-act]');
        if (!act) return;
        var a = act.getAttribute('data-act');
        if (a === 'close') self.closeModal();
        else if (a === 'max') self.toggleMax();
        else if (a === 'overlay' && e.target === act) self.closeModal();
      });

      // page hotkeys: "/" command mode, "?" jump mode
      document.addEventListener('keydown', function (e) {
        var t = e.target || {};
        var tag = (t.tagName || '').toLowerCase();
        if (e.key === 'Escape' && self.state.modal) { self.closeModal(); return; }
        if (tag === 'input' || tag === 'textarea' || t.isContentEditable) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === '/' || e.key === '?') {
          e.preventDefault();
          self.setState({ q: e.key, open: true, hl: -1, suggestions: [] });
          if (self._input) self._input.focus();
        }
      });

      // timeline scale on resize
      window.addEventListener('resize', function () { self.scaleTl(); });
      if (window.ResizeObserver) { this._ro = new ResizeObserver(function () { self.scaleTl(); }); var w = el('tlWrap'); if (w) this._ro.observe(w); }
      [0, 120, 400, 900].forEach(function (t) { setTimeout(function () { self.scaleTl(); }, t); });

      this.render();
      this.fetchReddit();
      this.fetchYoutube();
    }
  };

  function mergeModal(modal, patch) { var out = {}; for (var k in modal) out[k] = modal[k]; for (var j in patch) out[j] = patch[j]; return out; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { App.init(); });
  else App.init();
})();
