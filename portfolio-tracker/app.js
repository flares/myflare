'use strict';

/* ================= constants ================= */
const API = 'https://api.mfapi.in';
const LS_BLOB = 'pt.vault.blob';
const LS_FB = 'pt.firebase.config';
const PBKDF2_ITERS = 310000;
const NAV_STALE_MS = 6 * 60 * 60 * 1000; // auto-refresh if older than 6h
const SESSION_MS = 30 * 60 * 1000;       // stay unlocked for 30 min (sliding)
const COLORS = 8; // categorical slots --c0..--c7

/* ================= state ================= */
let vault = null;      // decrypted data
let cryptoKey = null;  // AES-GCM key (in memory only)
let saltB64 = null;    // PBKDF2 salt for current vault
let fbase = null;      // { db, docRef, setDoc } when Firebase is connected
let changePeriod = 'xirr';     // 'xirr' | '1d' | '1w' | '1m' — the change metric shown everywhere
const historyCache = {};       // code -> { rows: [{t, nav, date}] desc by t } — session only, not persisted

/* ================= tiny helpers ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const cls = p => (p >= 0 ? 'up' : 'down');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = () => Math.random().toString(36).slice(2, 10);

/* shorten AMFI scheme names for compact display: "Aditya Birla Sun Life Nifty
   India Defence Index Fund-Direct Plan-Growth" -> "ABSL Nifty India Defence Index".
   Full name is preserved everywhere else (search results, chosen preview,
   title attribute) — this is a display-only shortener. */
const AMC_ABBR = [
  [/^aditya birla sun life\b/i, 'ABSL'], [/^icici prudential\b/i, 'ICICI Pru'],
  [/^nippon india\b/i, 'Nippon'], [/^kotak mahindra\b/i, 'Kotak'],
  [/^mirae asset\b/i, 'Mirae'], [/^parag parikh\b/i, 'PP'],
  [/^franklin templeton\b/i, 'FT'], [/^motilal oswal\b/i, 'MOSL'],
  [/^canara robeco\b/i, 'Canara Robeco'], [/^baroda bnp paribas\b/i, 'Baroda BNP'],
  [/^pgim india\b/i, 'PGIM'], [/^mahindra manulife\b/i, 'Mahindra'],
  [/^whiteoak capital\b/i, 'WhiteOak'], [/^bank of india\b/i, 'BOI'],
  [/^bandhan\b/i, 'Bandhan'], [/^quant\b/i, 'Quant'], [/^sbi\b/i, 'SBI'],
  [/^hdfc\b/i, 'HDFC'], [/^uti\b/i, 'UTI'], [/^axis\b/i, 'Axis'],
  [/^tata\b/i, 'Tata'], [/^dsp\b/i, 'DSP'], [/^lic\b/i, 'LIC'],
  [/^edelweiss\b/i, 'Edelweiss'], [/^invesco\b/i, 'Invesco'],
  [/^sundaram\b/i, 'Sundaram'], [/^union\b/i, 'Union'], [/^navi\b/i, 'Navi'],
  [/^groww\b/i, 'Groww'], [/^zerodha\b/i, 'Zerodha'], [/^samco\b/i, 'Samco'],
  [/^helios\b/i, 'Helios'], [/^l&t\b/i, 'L&T'],
];
const FUND_STOP = new Set(['direct', 'regular', 'plan', 'growth', 'option', 'idcw',
  'dividend', 'bonus', 'payout', 'reinvestment', 'reinvest', 'fund', 'scheme']);
function shortFundName(name, max = 32) {
  let rest = name, prefix = '';
  for (const [re, ab] of AMC_ABBR) {
    const m = rest.match(re);
    if (m) { prefix = ab; rest = rest.slice(m[0].length); break; }
  }
  const tokens = rest.split(/[\s\-()]+/).filter(t => t && !FUND_STOP.has(t.toLowerCase()));
  let short = [prefix, ...tokens].filter(Boolean).join(' ').trim() || name;
  if (short.length > max) short = short.slice(0, max - 1).trimEnd() + '…';
  return short;
}

function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ================= crypto ================= */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptVault() {
  vault.updatedAt = new Date().toISOString();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv },
    cryptoKey, new TextEncoder().encode(JSON.stringify(vault)));
  return { v: 1, salt: saltB64, iv: b64(iv), ct: b64(ct), updatedAt: vault.updatedAt };
}

async function decryptBlob(blob, pass) {
  const key = await deriveKey(pass, unb64(blob.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return { key, data: JSON.parse(new TextDecoder().decode(pt)) };
}

/* ================= storage ================= */
function localBlob() {
  try { return JSON.parse(localStorage.getItem(LS_BLOB)); } catch { return null; }
}

async function persist() {
  const blob = await encryptVault();
  localStorage.setItem(LS_BLOB, JSON.stringify(blob));
  saveSession(); // activity extends the unlocked session
  if (fbase) pushRemote(blob);
}

/* ---- unlocked-session cache (IndexedDB can hold a non-extractable CryptoKey) ---- */
function idbStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('pt-session', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
async function saveSession() {
  try { await idbStore('readwrite', s => s.put({ key: cryptoKey, salt: saltB64, exp: Date.now() + SESSION_MS }, 'session')); } catch {}
}
async function loadSession() {
  try { return await idbStore('readonly', s => s.get('session')); } catch { return null; }
}
async function clearSession() {
  try { await idbStore('readwrite', s => s.delete('session')); } catch {}
}

function syncStatus(msg) { $('#syncStatus').textContent = msg ? msg + ' · ' : ''; }

/* ---- Firebase (optional) ---- */
async function initFirebase(config) {
  const V = '10.12.5';
  const [appM, authM, fsM] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(config);
  await authM.signInAnonymously(authM.getAuth(app));
  const db = fsM.getFirestore(app);
  fbase = { docRef: fsM.doc(db, 'portfolio-tracker', 'vault'), getDoc: fsM.getDoc, setDoc: fsM.setDoc };
  syncStatus('Firebase connected');
}

async function pullRemote() {
  try {
    const snap = await fbase.getDoc(fbase.docRef);
    return snap.exists() ? snap.data() : null;
  } catch (e) { syncStatus('Firebase read failed'); console.warn(e); return null; }
}

async function pushRemote(blob) {
  try {
    await fbase.setDoc(fbase.docRef, blob);
    syncStatus('Synced ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) { syncStatus('Firebase write failed'); console.warn(e); }
}

/* ================= mfapi.in ================= */
async function searchFunds(q) {
  const res = await fetch(`${API}/mf/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('search failed');
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function fetchLatestNav(code) {
  const res = await fetch(`${API}/mf/${code}/latest`);
  if (!res.ok) throw new Error('nav fetch failed');
  const json = await res.json();
  const row = json && json.data && json.data[0];
  if (!row) throw new Error('no nav data');
  return { nav: parseFloat(row.nav), date: row.date, name: json.meta && json.meta.scheme_name };
}

function parseDMY(s) {
  const [d, m, y] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

async function fetchSchemeDetail(code) {
  const res = await fetch(`${API}/mf/${code}`);
  if (!res.ok) throw new Error('scheme detail fetch failed');
  const json = await res.json();
  const rows = (json.data || [])
    .map(r => ({ t: parseDMY(r.date), nav: parseFloat(r.nav), date: r.date }))
    .filter(r => !isNaN(r.t) && !isNaN(r.nav))
    .sort((a, b) => b.t - a.t); // newest first
  return { rows, meta: json.meta || {} };
}

async function ensureHistory() {
  const codes = [...new Set(vault.portfolios.flatMap(p => p.funds.map(f => f.code).filter(Boolean)))]
    .filter(c => !historyCache[c]);
  if (!codes.length) return;
  await Promise.allSettled(codes.map(async c => {
    try { historyCache[c] = await fetchSchemeDetail(c); } catch { /* leave uncached; retried next call */ }
  }));
  render();
}

/* Best-effort, correctness-safe auto-link for funds imported without a mfapi.in
   scheme code (e.g. pasted from a CAS statement, which has ISIN but no scheme code).
   Only attaches a code when the candidate's ISIN matches exactly — never guesses by
   name alone, since a wrong code would silently show the wrong fund's live NAV. */
async function resolveFundCode(isin, name) {
  if (!isin) return null;
  let candidates;
  try { candidates = await searchFunds(name); } catch { return null; }
  for (const cand of candidates.slice(0, 15)) {
    try {
      const detail = await fetchSchemeDetail(cand.schemeCode);
      const { meta } = detail;
      if (meta.isin_growth === isin || meta.isin_div_reinvestment === isin) {
        return { code: String(cand.schemeCode), name: cand.schemeName, detail };
      }
    } catch { /* try next candidate */ }
  }
  return null;
}

async function resolveUnlinkedFunds() {
  const targets = [];
  for (const p of vault.portfolios) for (const f of p.funds) if (!f.code && f.isin) targets.push(f);
  if (!targets.length) return;
  let linked = 0;
  for (const f of targets) {
    const r = await resolveFundCode(f.isin, f.name);
    if (!r) continue;
    f.code = r.code; f.name = r.name; delete f.isin; linked++;
    historyCache[r.code] = { rows: r.detail.rows, meta: r.detail.meta }; // already fetched — avoid a second round-trip
    if (r.detail.rows[0]) vault.navCache[r.code] = { nav: r.detail.rows[0].nav, date: r.detail.rows[0].date };
  }
  if (linked) { await persist(); render(); }
  toast(`Linked ${linked} of ${targets.length} fund${targets.length === 1 ? '' : 's'} to live NAV`
    + (linked < targets.length ? ' — tap the rest to link manually' : ''));
}

/* most recent NAV row on or before targetTs (rows sorted newest-first) */
function navAtOrBefore(rows, targetTs) {
  for (const r of rows) if (r.t <= targetTs) return r;
  return null;
}

const PERIOD_DAYS = { '1d': 1, '1w': 7, '1m': 30 };

/* Unified change metric for a list of funds, for whichever mode is selected:
   'xirr' -> annualised return (falls back to plain since-buy % if no buy dates);
   '1d'/'1w'/'1m' -> from held-fund NAV history (fetched on demand, session-cached),
   measured from each fund's own latest known NAV date minus N days — e.g. "1D" is
   the last published NAV vs. the trading day before *that* date, not vs. "now"
   (which would be wrong/misleading if NAVs haven't been refreshed today).
   Used identically at fund / portfolio / owner scope — same function, different fund lists. */
function aggregateChange(funds, period) {
  if (!funds.length) return null;
  if (period === 'xirr') {
    const flows = [];
    let invested = 0, value = 0;
    for (const f of funds) {
      const c = fundCalc(f);
      invested += c.invested; value += c.value;
      if (f.buyDate) flows.push({ t: Date.parse(f.buyDate + 'T00:00:00'), amt: -c.invested }, { t: Date.now(), amt: c.value });
    }
    const rate = flows.length ? xirr(flows) : null;
    if (rate !== null) return { pct: rate * 100, isRate: true };
    return { pct: invested ? (value - invested) / invested * 100 : 0, isRate: false };
  }
  const days = PERIOD_DAYS[period];
  let amt = 0, base = 0, covered = 0;
  for (const f of funds) {
    const cache = vault.navCache[f.code];
    const h = historyCache[f.code];
    if (!cache || !h) continue; // never refreshed, or history not loaded yet
    const target = parseDMY(cache.date) - days * 24 * 3600e3;
    const past = navAtOrBefore(h.rows, target);
    if (!past) continue;
    amt += f.units * (cache.nav - past.nav);
    base += f.units * past.nav;
    covered++;
  }
  if (!covered) return null;
  return { pct: base ? amt / base * 100 : 0, isRate: false, partial: covered < funds.length };
}
function metricText(m) {
  if (!m) return '…';
  const arrow = m.pct >= 0 ? '▲ ' : '▼ ';
  return (m.partial ? '≈ ' : '') + arrow + Math.abs(m.pct).toFixed(2) + '%' + (m.isRate ? ' p.a.' : '');
}
const metricClass = m => (m ? cls(m.pct) : 'muted');

async function refreshNavs() {
  const codes = [...new Set(vault.portfolios.flatMap(p => p.funds.map(f => f.code).filter(Boolean)))];
  if (!codes.length) return;
  const btn = $('[data-action=refresh]');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
  const results = await Promise.allSettled(codes.map(c => fetchLatestNav(c).then(r => ({ code: c, ...r }))));
  let ok = 0, fail = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled' || isNaN(r.value.nav)) { fail++; continue; }
    ok++;
    const { code, nav, date } = r.value;
    vault.navCache[code] = { nav, date };
  }
  vault.lastRefresh = new Date().toISOString();
  await persist();
  render();
  if (fail) toast(`NAV updated for ${ok} fund${ok === 1 ? '' : 's'}, ${fail} failed`);
  else toast('NAVs updated');
}

/* ================= data helpers ================= */
function emptyVault() {
  return { v: 1, portfolios: [], owners: [], navCache: {}, lastRefresh: null, updatedAt: null };
}

/* annualised return from dated cashflows (negative = money in, positive = current value).
   Bisection on NPV; needs flows of both signs and ≥ ~18 days of history. */
function xirr(flows) {
  if (flows.length < 2) return null;
  const t0 = Math.min(...flows.map(f => f.t));
  const yrs = t => (t - t0) / (365.25 * 24 * 3600e3);
  if (Math.max(...flows.map(f => yrs(f.t))) < 0.05) return null;
  const npv = r => flows.reduce((s, f) => s + f.amt / Math.pow(1 + r, yrs(f.t)), 0);
  let lo = -0.9999, hi = 100, flo = npv(lo), fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (!isFinite(fm)) return null;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  const r = (lo + hi) / 2;
  return Math.abs(r) > 5 ? null : r;
}

function fundFlows(f, calc) {
  return f.buyDate ? [{ t: Date.parse(f.buyDate + 'T00:00:00'), amt: -calc.invested }, { t: Date.now(), amt: calc.value }] : null;
}

function fundCalc(f) {
  const cache = vault.navCache[f.code];
  const nav = cache ? cache.nav : f.buyNav;
  const value = f.units * nav;
  const invested = f.units * f.buyNav;
  const c = { nav, value, invested, pnl: value - invested, pct: invested ? (value - invested) / invested * 100 : 0 };
  const flows = fundFlows(f, c);
  c.rate = flows ? xirr(flows) : null;
  return c;
}

function portfolioCalc(p) {
  let value = 0, invested = 0;
  for (const f of p.funds) { const c = fundCalc(f); value += c.value; invested += c.invested; }
  return { value, invested, pnl: value - invested };
}

function ownerColor(owner) {
  const i = vault.owners.indexOf(owner);
  return (i >= 0 && i < COLORS) ? `var(--c${i})` : 'var(--c-extra)';
}

function grouped() {
  const map = new Map();
  for (const o of vault.owners) map.set(o, []);
  for (const p of vault.portfolios) {
    if (!map.has(p.owner)) map.set(p.owner, []);
    map.get(p.owner).push(p);
  }
  for (const [o, list] of [...map]) if (!list.length) map.delete(o);
  return map;
}

function latestNavDate() {
  let best = null;
  for (const c of Object.values(vault.navCache)) {
    if (!c.date) continue;
    const [d, m, y] = c.date.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    if (!best || t > best.t) best = { t, s: c.date };
  }
  return best && best.s;
}

/* ================= rendering ================= */
function render() {
  const app = $('#app');
  const navD = latestNavDate();
  $('#navDate').textContent = navD ? `NAV ${navD}` : '';

  if (!vault.portfolios.length) {
    app.innerHTML = `
      <div class="empty">No portfolios yet.<br><br>
        <button class="btn primary icon" data-action="add-portfolio">+ Add your first portfolio</button>
      </div>`;
    return;
  }

  const groups = grouped();
  const ownerCalcs = new Map();
  for (const [owner, ports] of groups) {
    let v = 0, inv = 0;
    const funds = ports.flatMap(p => p.funds);
    for (const p of ports) { const c = portfolioCalc(p); v += c.value; inv += c.invested; }
    ownerCalcs.set(owner, { value: v, invested: inv, metric: aggregateChange(funds, changePeriod) });
  }

  /* quick summary — every portfolio, grouped by person, no cross-person total */
  let quick = '';
  for (const [owner, ports] of groups) {
    const oc = ownerCalcs.get(owner);
    quick += `<div class="qgroup">
      <div class="owner"><i class="dot" style="background:${ownerColor(owner)}"></i>${esc(owner)}
        <span class="osum">${inr.format(oc.value)} · <b class="${metricClass(oc.metric)}">${metricText(oc.metric)}</b></span></div>`;
    for (const p of ports) {
      const c = portfolioCalc(p);
      const m = aggregateChange(p.funds, changePeriod);
      quick += `<a class="qrow" href="#pf-${p.id}">
        <span class="pname">${esc(p.name)}</span>
        <span class="num"><b>${inr.format(c.value)}</b><span class="pct ${metricClass(m)}">${metricText(m)}</span></span></a>`;
    }
    quick += `</div>`;
  }

  /* person sections */
  let sections = '';
  for (const [owner, ports] of groups) {
    const oc = ownerCalcs.get(owner);
    sections += `<section class="person">
      <h2><i class="dot" style="background:${ownerColor(owner)}"></i>${esc(owner)}
        <span class="psum">${ports.length} portfolio${ports.length === 1 ? '' : 's'} · ${inr.format(oc.value)} ·
        <span class="${metricClass(oc.metric)}">${metricText(oc.metric)}</span></span></h2>
      <div class="cards">`;
    for (const p of ports) {
      const c = portfolioCalc(p);
      const pm = aggregateChange(p.funds, changePeriod);
      let rows = '';
      for (const f of p.funds) {
        const fc = fundCalc(f);
        const fm = aggregateChange([f], changePeriod);
        const linked = !!f.code;
        rows += `<div class="fundrow" data-action="edit-fund" data-pid="${p.id}" data-code="${esc(String(f.code))}">
          <span class="fname" title="${esc(f.name)}">${esc(f.shortName || shortFundName(f.name))}</span>
          <span class="fnum"><b>${inr.format(fc.value)}</b><span class="pct ${linked ? metricClass(fm) : 'muted'}">${linked ? metricText(fm) : '🔗 link fund'}</span></span>
        </div>`;
      }
      sections += `<div class="card" id="pf-${p.id}">
        <header><h3>${esc(p.name)}</h3><span class="badge ${metricClass(pm)}">${metricText(pm)}</span></header>
        <div class="money"><span class="cur">${inr.format(c.value)}</span><span class="inv">invested ${inr.format(c.invested)}</span></div>
        <div class="holdings">${rows || '<div class="fnum" style="color:var(--muted);font-size:0.8rem">No funds yet.</div>'}</div>
        <div class="cardactions">
          <button data-action="add-fund" data-pid="${p.id}">+ Add fund</button>
          <button class="danger" data-action="del-portfolio" data-pid="${p.id}">Delete</button>
        </div>
      </div>`;
    }
    sections += `</div></section>`;
  }

  app.innerHTML = `
    <div class="periodrow">
      <div class="segwrap">
        <span class="plabel">Show</span>
        <div class="segctl">
          <button class="segbtn ${changePeriod === 'xirr' ? 'active' : ''}" data-action="set-period" data-period="xirr">XIRR</button>
          <button class="segbtn ${changePeriod === '1d' ? 'active' : ''}" data-action="set-period" data-period="1d">1D</button>
          <button class="segbtn ${changePeriod === '1w' ? 'active' : ''}" data-action="set-period" data-period="1w">1W</button>
          <button class="segbtn ${changePeriod === '1m' ? 'active' : ''}" data-action="set-period" data-period="1m">1M</button>
        </div>
      </div>
      <button class="btn sm" data-action="refresh">↻ Refresh NAV</button>
    </div>
    <nav class="quick">${quick}</nav>
    ${sections}
    <div class="actions bottomactions">
      <button class="btn primary" data-action="add-portfolio">+ Add portfolio</button>
    </div>`;
}

/* ================= fund typeahead picker ================= */
function createFundPicker(container) {
  container.innerHTML = `
    <div class="searchbox">
      <input type="search" class="q" placeholder="Search mutual fund by name…" autocomplete="off">
      <div class="results" hidden></div>
    </div>
    <div class="chosen" hidden></div>
    <button type="button" class="changefund" hidden>🔍 Change fund…</button>
    <label class="shortnamerow" hidden>Display name <span class="hint" style="display:inline">(shown on cards)</span>
      <input type="text" class="shortname" maxlength="40"></label>
    <div class="grid2">
      <label>Units<input type="number" class="units" step="0.001" min="0.001" placeholder="e.g. 125.503"></label>
      <label>Buy NAV (₹)<input type="number" class="buynav" step="any" min="0.0001" placeholder="defaults to latest"></label>
    </div>
    <label>Buy date <span class="hint" style="display:inline">(for XIRR / CAGR)</span>
      <input type="date" class="buydate"></label>`;
  const q = $('.q', container), results = $('.results', container), chosen = $('.chosen', container);
  let selection = null, latest = null;

  const doSearch = debounce(async () => {
    const term = q.value.trim();
    if (term.length < 3) { results.hidden = true; return; }
    results.innerHTML = `<div class="none">Searching…</div>`; results.hidden = false;
    try {
      const list = (await searchFunds(term)).slice(0, 25);
      results.innerHTML = list.length
        ? list.map(f => `<div data-code="${esc(String(f.schemeCode))}" data-name="${esc(f.schemeName)}">${esc(f.schemeName)}</div>`).join('')
        : `<div class="none">No matches.</div>`;
    } catch {
      results.innerHTML = `<div class="none">Search failed — check your connection and try again.</div>`;
    }
  }, 300);

  q.addEventListener('input', () => { selection = null; chosen.hidden = true; doSearch(); });
  results.addEventListener('mousedown', e => {
    const item = e.target.closest('[data-code]');
    if (!item) return;
    selection = { code: item.dataset.code, name: item.dataset.name };
    q.value = ''; results.hidden = true;
    $('.shortnamerow', container).hidden = false;
    $('.shortname', container).value = shortFundName(selection.name);
    showChosen();
  });
  document.addEventListener('click', e => { if (!container.contains(e.target)) results.hidden = true; });
  $('.changefund', container).addEventListener('click', () => {
    $('.searchbox', container).hidden = false;
    $('.changefund', container).hidden = true;
  });

  async function showChosen() {
    chosen.hidden = false;
    if (!selection.code) {
      chosen.innerHTML = `<b>${esc(selection.name)}</b><br><span class="navnow">Not linked to a live NAV source — search above to link it.</span>`;
      return;
    }
    chosen.innerHTML = `<b>${esc(selection.name)}</b><br><span class="navnow">Fetching latest NAV…</span>`;
    latest = null;
    try {
      latest = await fetchLatestNav(selection.code);
      chosen.innerHTML = `<b>${esc(selection.name)}</b><br>
        <span class="navnow">Latest NAV ₹${inr2.format(latest.nav)} (${esc(latest.date)})</span>`;
      $('.buynav', container).placeholder = inr2.format(latest.nav);
    } catch {
      chosen.innerHTML = `<b>${esc(selection.name)}</b><br><span class="navnow">Could not fetch latest NAV.</span>`;
    }
  }

  return {
    getFund() {
      if (!selection) return null;
      const units = parseFloat($('.units', container).value);
      let buyNav = parseFloat($('.buynav', container).value);
      const buyDate = $('.buydate', container).value || undefined;
      const shortName = $('.shortname', container).value.trim() || shortFundName(selection.name);
      if (!buyNav && latest) buyNav = latest.nav;
      if (!units || units <= 0) return { error: 'Enter the number of units.' };
      if (!buyNav || buyNav <= 0) return { error: 'Enter the buy NAV (latest NAV unavailable).' };
      if (buyDate && buyDate > todayISO()) return { error: 'Buy date cannot be in the future.' };
      return { code: selection.code, name: selection.name, units, buyNav, buyDate, shortName, latest };
    },
    hasQuery: () => !!selection,
    reset() {
      selection = null; latest = null;
      $('.searchbox', container).hidden = false;
      q.value = ''; results.hidden = true; chosen.hidden = true;
      $('.changefund', container).hidden = true;
      $('.shortnamerow', container).hidden = true; $('.shortname', container).value = '';
      $('.units', container).value = ''; $('.buynav', container).value = '';
      $('.buynav', container).placeholder = 'defaults to latest';
      $('.buydate', container).value = todayISO();
    },
    setFixed(f) { // edit mode: fund identity locked (unless still unlinked), fields prefilled
      this.reset();
      const linked = f.code != null;
      selection = { code: linked ? String(f.code) : null, name: f.name };
      $('.searchbox', container).hidden = linked;
      $('.changefund', container).hidden = !linked;
      $('.shortnamerow', container).hidden = false;
      $('.shortname', container).value = f.shortName || shortFundName(f.name);
      $('.units', container).value = f.units;
      $('.buynav', container).value = f.buyNav;
      $('.buydate', container).value = f.buyDate || '';
      showChosen();
    },
  };
}

/* ================= dialogs & actions ================= */
let pfPicker, fundPicker, fundTargetPid = null, fundEditCode = null;

function openVaultDialog(mode) { // 'create' | 'unlock'
  const dlg = $('#dlgVault');
  $('#vaultTitle').textContent = mode === 'create' ? 'Create your vault' : 'Unlock';
  $('#vaultHint').textContent = mode === 'create'
    ? 'Choose a passphrase. Everything is encrypted with it before being stored — there is no recovery if you forget it.'
    : 'Enter your passphrase to decrypt your portfolios.';
  $('#vaultPass2Row').hidden = mode !== 'create';
  $('#vaultPass2').required = mode === 'create';
  $('#vaultGo').textContent = mode === 'create' ? 'Create' : 'Unlock';
  dlg.dataset.mode = mode;
  dlg.addEventListener('cancel', e => e.preventDefault()); // must unlock to use app
  dlg.showModal();
}

async function handleVaultSubmit(e) {
  e.preventDefault();
  const dlg = $('#dlgVault'), pass = $('#vaultPass').value, err = $('#vaultErr');
  err.textContent = '';
  try {
    if (dlg.dataset.mode === 'create') {
      if (pass !== $('#vaultPass2').value) { err.textContent = 'Passphrases do not match.'; return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      saltB64 = b64(salt);
      cryptoKey = await deriveKey(pass, salt);
      vault = emptyVault();
      await persist();
    } else {
      const blob = localBlob();
      const { key, data } = await decryptBlob(blob, pass);
      cryptoKey = key; saltB64 = blob.salt; vault = data;
    }
    $('#vaultPass').value = ''; $('#vaultPass2').value = '';
    await saveSession();
    dlg.close();
    render();
    maybeAutoRefresh();
  } catch {
    err.textContent = 'Wrong passphrase (or corrupted data).';
  }
}

function maybeAutoRefresh() {
  const has = vault.portfolios.some(p => p.funds.length);
  const stale = !vault.lastRefresh || (Date.now() - Date.parse(vault.lastRefresh)) > NAV_STALE_MS;
  if (has && stale) refreshNavs();
}

function setPortfolioDialogMode(mode) {
  const dlg = $('#dlgPortfolio');
  dlg.dataset.mode = mode;
  $('#pfFormMode').hidden = mode !== 'form';
  $('#pfJsonMode').hidden = mode !== 'json';
  $('#frmPortfolio .btn.primary').textContent = mode === 'json' ? 'Import' : 'Create portfolio';
  $('#pfErr').textContent = '';
  document.querySelectorAll('#dlgPortfolio .modetab').forEach(b => b.classList.toggle('active', b.dataset.pfmode === mode));
}

function validateImportedFund(raw) {
  const units = parseFloat(raw.units), buyNav = parseFloat(raw.buyNav);
  if (!raw.name || typeof raw.name !== 'string') return { error: 'a fund is missing "name"' };
  if (!units || units <= 0) return { error: `"${raw.name}" needs a positive "units"` };
  if (!buyNav || buyNav <= 0) return { error: `"${raw.name}" needs a positive "buyNav"` };
  const buyDate = raw.buyDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.buyDate) ? raw.buyDate : undefined;
  return {
    fund: {
      code: raw.code != null ? String(raw.code) : null,
      name: raw.name,
      shortName: raw.shortName || shortFundName(raw.name),
      units, buyNav, buyDate,
      isin: raw.isin || undefined,
    },
  };
}

function handleAddPortfolioJson(e) {
  e.preventDefault();
  const err = $('#pfErr');
  err.textContent = '';
  let data;
  try { data = JSON.parse($('#pfJson').value); } catch { err.textContent = 'That is not valid JSON.'; return; }
  const list = Array.isArray(data) ? data : [data];
  if (!list.length) { err.textContent = 'Paste at least one portfolio.'; return; }

  const built = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || !raw.owner || !raw.name) {
      err.textContent = 'Each portfolio needs "owner" and "name".'; return;
    }
    const funds = [];
    for (const rf of (raw.funds || [])) {
      const r = validateImportedFund(rf);
      if (r.error) { err.textContent = r.error; return; }
      funds.push(r.fund);
    }
    built.push({ id: uid(), owner: String(raw.owner).trim(), name: String(raw.name).trim(), funds });
  }

  for (const p of built) {
    if (!vault.owners.includes(p.owner)) vault.owners.push(p.owner);
    vault.portfolios.push(p);
  }
  const fundCount = built.reduce((n, p) => n + p.funds.length, 0);
  persist().then(() => {
    $('#dlgPortfolio').close();
    render();
    toast(`Added ${built.length} portfolio${built.length === 1 ? '' : 's'}, ${fundCount} fund${fundCount === 1 ? '' : 's'}`);
    resolveUnlinkedFunds();
  });
}

async function handleAddPortfolio(e) {
  if ($('#dlgPortfolio').dataset.mode === 'json') return handleAddPortfolioJson(e);
  e.preventDefault();
  const owner = $('#pfOwner').value.trim();
  const name = $('#pfName').value.trim();
  const err = $('#pfErr');
  err.textContent = '';
  if (!owner || !name) { err.textContent = 'Owner and portfolio name are required.'; return; }

  let fund = null;
  if (pfPicker.hasQuery()) {
    fund = pfPicker.getFund();
    if (fund && fund.error) { err.textContent = fund.error; return; }
  }
  const p = { id: uid(), owner, name, funds: [] };
  if (!vault.owners.includes(owner)) vault.owners.push(owner);
  if (fund) {
    p.funds.push({ code: fund.code, name: fund.name, shortName: fund.shortName, units: fund.units, buyNav: fund.buyNav, buyDate: fund.buyDate });
    if (fund.latest) vault.navCache[fund.code] = { nav: fund.latest.nav, date: fund.latest.date };
  }
  vault.portfolios.push(p);
  await persist();
  $('#dlgPortfolio').close();
  render();
  toast(`Portfolio “${name}” added`);
}

async function handleAddFund(e) {
  e.preventDefault();
  const err = $('#fundErr');
  err.textContent = '';
  const fund = fundPicker.getFund();
  if (!fund) { err.textContent = 'Search and pick a fund first.'; return; }
  if (fund.error) { err.textContent = fund.error; return; }
  const p = vault.portfolios.find(x => x.id === fundTargetPid);
  if (!p) return;
  if (fundEditCode) {
    const f = p.funds.find(x => String(x.code) === String(fundEditCode));
    if (!f) return;
    f.units = fund.units; f.buyNav = fund.buyNav; f.buyDate = fund.buyDate; f.shortName = fund.shortName;
    f.code = fund.code; f.name = fund.name; // may have been (re-)linked via "Change fund"
    if (f.code) delete f.isin; // no longer needed once a real scheme code is attached
    toast('Fund updated');
  } else {
    if (p.funds.some(f => String(f.code) === String(fund.code))) { err.textContent = 'This fund is already in the portfolio.'; return; }
    p.funds.push({ code: fund.code, name: fund.name, shortName: fund.shortName, units: fund.units, buyNav: fund.buyNav, buyDate: fund.buyDate });
    toast(`Added to “${p.name}”`);
  }
  if (fund.latest) {
    const prev = vault.navCache[fund.code];
    if (!prev) vault.navCache[fund.code] = { nav: fund.latest.nav, date: fund.latest.date };
  }
  await persist();
  $('#dlgFund').close();
  render();
}

async function handleSettings(e) {
  e.preventDefault();
  const err = $('#settingsErr'); err.textContent = '';
  const raw = $('#fbConfig').value.trim();
  if (!raw) {
    localStorage.removeItem(LS_FB);
    fbase = null; syncStatus('');
    $('#dlgSettings').close();
    return;
  }
  let cfg;
  try { cfg = JSON.parse(raw); } catch { err.textContent = 'Config is not valid JSON.'; return; }
  if (!cfg.projectId || !cfg.apiKey) { err.textContent = 'Config needs at least apiKey and projectId.'; return; }
  try {
    await initFirebase(cfg);
    localStorage.setItem(LS_FB, JSON.stringify(cfg));
    if (vault && cryptoKey) pushRemote(await encryptVault().then(b => (localStorage.setItem(LS_BLOB, JSON.stringify(b)), b)));
    $('#dlgSettings').close();
    toast('Firebase connected');
  } catch (ex) {
    console.warn(ex);
    err.textContent = 'Could not connect — check the config, Anonymous auth, and Firestore setup.';
  }
}

function onAppClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !vault) return;
  const { action, pid, code, period } = btn.dataset;
  if (action === 'refresh') refreshNavs();
  if (action === 'set-period') {
    changePeriod = period;
    render();
    if (period !== 'xirr') ensureHistory();
  }
  if (action === 'add-portfolio') {
    $('#frmPortfolio').reset(); $('#pfErr').textContent = '';
    pfPicker.reset();
    $('#ownerList').innerHTML = vault.owners.map(o => `<option value="${esc(o)}">`).join('');
    setPortfolioDialogMode('form');
    $('#dlgPortfolio').showModal();
  }
  if (action === 'set-pfmode') setPortfolioDialogMode(btn.dataset.pfmode);
  if (action === 'add-fund') {
    fundTargetPid = pid; fundEditCode = null;
    const p = vault.portfolios.find(x => x.id === pid);
    $('#fundTitle').textContent = `Add fund — ${p ? p.name : ''}`;
    $('#frmFund .btn.primary').textContent = 'Add fund';
    $('#btnRemoveFund').hidden = true;
    $('#fundErr').textContent = '';
    fundPicker.reset();
    $('#dlgFund').showModal();
  }
  if (action === 'edit-fund') {
    fundTargetPid = pid; fundEditCode = code;
    const p = vault.portfolios.find(x => x.id === pid);
    const f = p && p.funds.find(f => String(f.code) === String(code));
    if (!f) return;
    $('#fundTitle').textContent = 'Edit fund';
    $('#frmFund .btn.primary').textContent = 'Save';
    $('#btnRemoveFund').hidden = false;
    $('#fundErr').textContent = '';
    fundPicker.setFixed(f);
    $('#dlgFund').showModal();
    $('#fundTitle').focus({ preventScroll: true }); // avoid autofocusing a prefilled text field (no keyboard pop-up)
  }
  if (action === 'del-portfolio') {
    const p = vault.portfolios.find(x => x.id === pid);
    if (p && confirm(`Delete portfolio “${p.name}” (${p.owner}) and its ${p.funds.length} fund(s)?`)) {
      vault.portfolios = vault.portfolios.filter(x => x !== p);
      if (!vault.portfolios.some(x => x.owner === p.owner)) vault.owners = vault.owners.filter(o => o !== p.owner);
      persist().then(render);
    }
  }
  if (action === 'settings') {
    $('#settingsErr').textContent = '';
    $('#fbConfig').value = localStorage.getItem(LS_FB) || '';
    $('#fbStatus').textContent = fbase ? 'Status: connected.' : 'Status: not connected (local-only).';
    $('#dlgSettings').showModal();
  }
  if (action === 'lock') clearSession().finally(() => location.reload());
}

/* ================= boot ================= */
async function boot() {
  pfPicker = createFundPicker($('#pfFundPicker'));
  fundPicker = createFundPicker($('#fundPicker'));

  $('#frmVault').addEventListener('submit', handleVaultSubmit);
  $('#frmPortfolio').addEventListener('submit', handleAddPortfolio);
  $('#frmFund').addEventListener('submit', handleAddFund);
  $('#frmSettings').addEventListener('submit', handleSettings);
  document.addEventListener('click', onAppClick);
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  $('#btnRemoveFund').addEventListener('click', async () => {
    const p = vault && vault.portfolios.find(x => x.id === fundTargetPid);
    const f = p && p.funds.find(x => String(x.code) === String(fundEditCode));
    if (!f) return;
    if (!confirm(`Remove “${f.name}” from ${p.name}?`)) return;
    p.funds = p.funds.filter(x => x !== f);
    await persist();
    $('#dlgFund').close();
    render();
    toast('Fund removed');
  });

  $('#btnExport').addEventListener('click', () => {
    if (!vault) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' }));
    a.download = `portfolio-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.portfolios)) throw new Error('bad shape');
      if (!confirm('Replace your current data with this import?')) return;
      vault = Object.assign(emptyVault(), data);
      await persist();
      $('#dlgSettings').close();
      render();
      toast('Import complete');
    } catch { $('#settingsErr').textContent = 'Not a valid export file.'; }
    e.target.value = '';
  });

  /* Firebase: reconnect and pull newer blob before unlocking */
  const fbCfg = localStorage.getItem(LS_FB);
  if (fbCfg) {
    try {
      await initFirebase(JSON.parse(fbCfg));
      const remote = await pullRemote();
      const local = localBlob();
      if (remote && (!local || (remote.updatedAt || '') > (local.updatedAt || ''))) {
        localStorage.setItem(LS_BLOB, JSON.stringify(remote));
        syncStatus('Loaded latest from Firebase');
      }
    } catch (e) { console.warn(e); syncStatus('Firebase unavailable'); }
  } else {
    syncStatus('Local-only (set up Firebase in Settings)');
  }

  const blob = localBlob();
  if (!blob) { openVaultDialog('create'); return; }

  /* resume unlocked session if fresh enough and for the same vault */
  const s = await loadSession();
  if (s && s.exp > Date.now() && s.salt === blob.salt) {
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, s.key, unb64(blob.ct));
      cryptoKey = s.key; saltB64 = blob.salt; vault = JSON.parse(new TextDecoder().decode(pt));
      saveSession();
      render();
      maybeAutoRefresh();
      return;
    } catch { /* stale/foreign key — fall through to passphrase */ }
  }
  openVaultDialog('unlock');
}

boot();
