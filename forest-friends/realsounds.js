/* ===================================================================
   Forest Friends — real animal recordings (runtime, browser-side)

   Realistic sounds need real recordings, and this game is fully static /
   offline-first, so we DON'T bundle audio. Instead, at play time, the
   visitor's browser asks Wikimedia Commons for a freely-licensed recording
   of the animal and plays it. Commons is HTTPS, its API allows cross-origin
   requests (origin=*), and HTML5 <audio> plays the returned file without
   needing CORS.

   Everything here is best-effort: play(a) resolves to `false` on ANY problem
   (offline, blocked, no recording found, decode error) and the game then
   uses its synthesized voice. So the game never depends on the network.
   =================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var API = "https://commons.wikimedia.org/w/api.php";
  var cache = {};      // key -> resolved url | null (null = known-missing)
  var inflight = {};   // key -> Promise
  var FMT_RANK = { mp3: 0, m4a: 1, wav: 2, oga: 3, ogg: 4, opus: 5, flac: 6, webm: 7 };
  var MAX_BYTES = 4 * 1024 * 1024;   // skip anything bigger than ~4MB

  function extOf(url) {
    var m = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(url || "");
    return m ? m[1].toLowerCase() : "";
  }

  // query Commons' search for an audio File: page, return the best file URL
  function search(query) {
    var url = API + "?action=query&format=json&origin=*" +
      "&generator=search&gsrnamespace=6&gsrlimit=10" +
      "&gsrsearch=" + encodeURIComponent("filetype:audio " + query) +
      "&prop=imageinfo&iiprop=url|mime|size";
    // bound how long we wait, so the synth fallback is never far behind
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 3500);
    return fetch(url, { referrerPolicy: "no-referrer", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (timer) clearTimeout(timer); return r.ok ? r.json() : null; })
      .then(function (d) {
        var pages = d && d.query && d.query.pages;
        if (!pages) return null;
        var best = null, bestRank = 99;
        Object.keys(pages).forEach(function (k) {
          var ii = pages[k].imageinfo && pages[k].imageinfo[0];
          if (!ii || !ii.url) return;
          var isAudio = /^audio\//.test(ii.mime || "") ||
                        /\.(ogg|oga|mp3|wav|opus|m4a|flac|webm)$/i.test(ii.url);
          if (!isAudio) return;
          if (ii.size && ii.size > MAX_BYTES) return;
          var rank = FMT_RANK[extOf(ii.url)];
          if (rank === undefined) rank = 50;
          if (rank < bestRank) { bestRank = rank; best = ii.url; }
        });
        return best;
      })
      .catch(function () { return null; });
  }

  function resolve(a) {
    var key = a.key;
    if (key in cache) return Promise.resolve(cache[key]);
    if (inflight[key]) return inflight[key];
    // try "<name> <soundword>" (e.g. "Lion roar"), then just the name
    var hint = a.sound && a.sound !== "generic" ? " " + a.sound : "";
    var p = search(a.name + hint)
      .then(function (u) { return u || search(a.name); })
      .then(function (u) { cache[key] = u || null; delete inflight[key]; return cache[key]; })
      .catch(function () { cache[key] = null; delete inflight[key]; return null; });
    inflight[key] = p;
    return p;
  }

  // play the given url up to `times` times, back to back
  function playUrl(url, times) {
    times = Math.max(1, times || 1);
    var au = new Audio();
    au.preload = "auto";
    au.src = url;
    au.volume = 0.95;
    var n = 0;
    au.addEventListener("ended", function () {
      n++;
      if (n < times) { try { au.currentTime = 0; au.play().catch(function () {}); } catch (e) {} }
    });
    var pr = au.play();
    if (pr && pr.catch) return pr.then(function () { return true; }).catch(function () { return false; });
    return true;
  }

  window.RealSounds = {
    // Promise<boolean> — true if a real recording started playing
    play: function (a, times) {
      if (!a || !a.key) return Promise.resolve(false);
      return resolve(a).then(function (url) {
        if (!url) return false;
        try { return playUrl(url, times || 1) !== false; }
        catch (e) { return false; }
      }).catch(function () { return false; });
    },
    // warm the cache for animals the child is about to be able to call
    prefetch: function (a) { if (a && a.key && navigator.onLine !== false) resolve(a); },
    _cache: cache
  };
})();
