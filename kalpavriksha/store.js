/* store.js — leaf tally in localStorage.
 *
 * Only two numbers are ever persisted: the running total and a per-day map.
 * Individual leaves are never stored, so a lakh of taps costs the same as ten.
 * Writes are debounced (a fast tapper can fire 10 taps/second; localStorage is
 * synchronous and would stutter the animation if written on every one).
 */
var Store = (function () {
  'use strict';

  var KEY = 'kalpavriksha.v1';
  var SAVE_DELAY = 700;

  var data = { total: 0, days: {} };
  var timer = null;
  var dirty = false;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.total === 'number' && isFinite(parsed.total)) {
          data.total = Math.max(0, Math.floor(parsed.total));
          data.days = (parsed.days && typeof parsed.days === 'object') ? parsed.days : {};
        }
      }
    } catch (e) { /* private mode, corrupt payload — start fresh */ }
    return data.total;
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, total: data.total, days: data.days }));
    } catch (e) { /* quota or private mode — keep going in memory */ }
  }

  function schedule() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(function () { timer = null; flush(); }, SAVE_DELAY);
  }

  function add(n) {
    var k = dayKey();
    data.days[k] = (data.days[k] || 0) + n;
    data.total += n;
    schedule();
    return data.total;
  }

  function total() { return data.total; }

  /* Newest day first. */
  function byDay() {
    var out = [];
    for (var k in data.days) {
      if (Object.prototype.hasOwnProperty.call(data.days, k) && data.days[k] > 0) {
        out.push({ date: k, count: data.days[k] });
      }
    }
    out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return out;
  }

  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  return {
    load: load,
    add: add,
    total: total,
    byDay: byDay,
    dayKey: dayKey,
    flush: flush
  };
})();
