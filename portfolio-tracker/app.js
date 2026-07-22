'use strict';

/* ================= constants ================= */
const API = 'https://api.mfapi.in';
const LS_BLOB = 'pt.vault.blob';
const LS_FB = 'pt.firebase.config';
const PBKDF2_ITERS = 310000;
const NAV_STALE_MS = 6 * 60 * 60 * 1000; // auto-refresh if older than 6h
const COLORS = 8; // categorical slots --c0..--c7

/* ================= state ================= */
let vault = null;      // decrypted data
let cryptoKey = null;  // AES-GCM key (in memory only)
let saltB64 = null;    // PBKDF2 salt for current vault
let fbase = null;      // { db, docRef, setDoc } when Firebase is connected

/* ================= tiny helpers ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtPct = p => (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(1) + '%';
const cls = p => (p >= 0 ? 'up' : 'down');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = () => Math.random().toString(36).slice(2, 10);

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
  if (fbase) pushRemote(blob);
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

async function refreshNavs() {
  const codes = [...new Set(vault.portfolios.flatMap(p => p.funds.map(f => f.code)))];
  if (!codes.length) return;
  const btn = $('[data-action=refresh]');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
  const results = await Promise.allSettled(codes.map(c => fetchLatestNav(c).then(r => ({ code: c, ...r }))));
  let ok = 0, fail = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled' || isNaN(r.value.nav)) { fail++; continue; }
    ok++;
    const { code, nav, date } = r.value;
    const prev = vault.navCache[code];
    vault.navCache[code] = (prev && prev.date !== date)
      ? { nav, date, prevNav: prev.nav, prevDate: prev.date }
      : { nav, date, prevNav: prev && prev.prevNav, prevDate: prev && prev.prevDate };
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

function fundCalc(f) {
  const cache = vault.navCache[f.code];
  const nav = cache ? cache.nav : f.buyNav;
  const value = f.units * nav;
  const invested = f.units * f.buyNav;
  const day = (cache && cache.prevNav && cache.prevDate !== cache.date)
    ? f.units * (cache.nav - cache.prevNav) : null;
  return { nav, value, invested, pnl: value - invested, pct: invested ? (value - invested) / invested * 100 : 0, day, stale: !cache };
}

function portfolioCalc(p) {
  let value = 0, invested = 0, day = 0, hasDay = false;
  for (const f of p.funds) {
    const c = fundCalc(f);
    value += c.value; invested += c.invested;
    if (c.day !== null) { day += c.day; hasDay = true; }
  }
  return { value, invested, pnl: value - invested, pct: invested ? (value - invested) / invested * 100 : 0, day: hasDay ? day : null };
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
  $('#navDate').textContent = navD ? `NAV as of ${navD}` : '';

  if (!vault.portfolios.length) {
    app.innerHTML = `
      <div class="empty">No portfolios yet.<br><br>
        <button class="btn primary icon" data-action="add-portfolio">+ Add your first portfolio</button>
      </div>
      ${actionsHtml(true)}`;
    return;
  }

  const groups = grouped();
  let totValue = 0, totInvested = 0, totDay = 0, hasDay = false;
  const ownerCalcs = new Map();
  for (const [owner, ports] of groups) {
    let v = 0, inv = 0;
    for (const p of ports) { const c = portfolioCalc(p); v += c.value; inv += c.invested; if (c.day !== null) { totDay += c.day; hasDay = true; } }
    ownerCalcs.set(owner, { value: v, invested: inv, pct: inv ? (v - inv) / inv * 100 : 0 });
    totValue += v; totInvested += inv;
  }
  const totPnl = totValue - totInvested;
  const totPct = totInvested ? totPnl / totInvested * 100 : 0;

  /* quick summary */
  let quick = '';
  for (const [owner, ports] of groups) {
    const oc = ownerCalcs.get(owner);
    quick += `<div class="qgroup">
      <div class="owner"><i class="dot" style="background:${ownerColor(owner)}"></i>${esc(owner)}
        <span class="osum">${inr.format(oc.value)} · ${(oc.pct >= 0 ? '+' : '')}${oc.pct.toFixed(1)}%</span></div>`;
    for (const p of ports) {
      const c = portfolioCalc(p);
      quick += `<a class="qrow" href="#pf-${p.id}">
        <span class="pname">${esc(p.name)}</span>
        <span class="num"><b>${inr.format(c.value)}</b><span class="pct ${cls(c.pct)}">${fmtPct(c.pct)}</span></span></a>`;
    }
    quick += `</div>`;
  }

  /* allocation by person */
  let bar = '', legend = '';
  for (const [owner] of groups) {
    const oc = ownerCalcs.get(owner);
    const w = totValue ? (oc.value / totValue * 100) : 0;
    bar += `<span style="width:${w.toFixed(1)}%; background:${ownerColor(owner)}"></span>`;
    legend += `<span><i style="background:${ownerColor(owner)}"></i>${esc(owner)} ${w.toFixed(1)}%</span>`;
  }

  /* person sections */
  let sections = '';
  for (const [owner, ports] of groups) {
    const oc = ownerCalcs.get(owner);
    sections += `<section class="person">
      <h2><i class="dot" style="background:${ownerColor(owner)}"></i>${esc(owner)}
        <span class="psum">${ports.length} portfolio${ports.length === 1 ? '' : 's'} · ${inr.format(oc.value)} ·
        <span class="${cls(oc.pct)}">${fmtPct(oc.pct)}</span></span></h2>
      <div class="cards">`;
    for (const p of ports) {
      const c = portfolioCalc(p);
      let rows = '';
      for (const f of p.funds) {
        const fc = fundCalc(f);
        rows += `<div class="fundrow">
          <div class="r1"><b title="${esc(f.name)}">${esc(f.name)}</b>
            <span class="pct ${cls(fc.pct)}">${fmtPct(fc.pct)}</span>
            <button class="del" data-action="del-fund" data-pid="${p.id}" data-code="${esc(String(f.code))}" title="Remove fund">✕</button></div>
          <div class="r2"><span>${inr2.format(f.units)} u × ${inr2.format(fc.nav)}${fc.stale ? ' (buy NAV)' : ''}</span>
            <span>${inr.format(fc.value)}</span></div>
        </div>`;
      }
      sections += `<div class="card" id="pf-${p.id}">
        <header><h3>${esc(p.name)}</h3><span class="badge ${cls(c.pct)}">${fmtPct(c.pct)}</span></header>
        <div class="money"><span class="cur">${inr.format(c.value)}</span><span class="inv">invested ${inr.format(c.invested)}</span></div>
        <div class="holdings">${rows || '<div class="r2" style="color:var(--muted);font-size:0.8rem">No funds yet.</div>'}</div>
        <div class="cardactions">
          <button data-action="add-fund" data-pid="${p.id}">+ Add fund</button>
          <button class="danger" data-action="del-portfolio" data-pid="${p.id}">Delete</button>
        </div>
      </div>`;
    }
    sections += `</div></section>`;
  }

  app.innerHTML = `
    <div class="overall">
      <span class="total">${inr.format(totValue)}</span>
      <span class="delta ${cls(totPnl)}">${totPnl >= 0 ? '▲' : '▼'} ${inr.format(Math.abs(totPnl))} (${totPct >= 0 ? '+' : ''}${totPct.toFixed(1)}%)</span>
      ${hasDay ? `<span class="today">today <span class="${cls(totDay)}">${totDay >= 0 ? '▲' : '▼'} ${inr.format(Math.abs(totDay))}</span></span>` : ''}
    </div>
    <nav class="quick">${quick}</nav>
    ${actionsHtml(false)}
    <div class="alloc">
      <div class="label">Allocation by person (current value)</div>
      <div class="bar">${bar}</div>
      <div class="legend">${legend}</div>
    </div>
    ${sections}`;
}

function actionsHtml(minimal) {
  return `<div class="actions">
    ${minimal ? '' : `<button class="btn" data-action="refresh">↻ Refresh NAV</button>
    <button class="btn primary" data-action="add-portfolio">+ Add portfolio</button>`}
    <button class="btn icon" data-action="settings" title="Settings">⚙ Settings</button>
    <button class="btn icon" data-action="lock" title="Lock">🔒 Lock</button>
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
    <div class="grid2">
      <label>Units<input type="number" class="units" step="any" min="0.0001" placeholder="e.g. 125.5"></label>
      <label>Buy NAV (₹)<input type="number" class="buynav" step="any" min="0.0001" placeholder="defaults to latest"></label>
    </div>`;
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
  results.addEventListener('mousedown', async e => {
    const item = e.target.closest('[data-code]');
    if (!item) return;
    selection = { code: item.dataset.code, name: item.dataset.name };
    q.value = ''; results.hidden = true;
    chosen.hidden = false;
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
  });
  document.addEventListener('click', e => { if (!container.contains(e.target)) results.hidden = true; });

  return {
    getFund() {
      if (!selection) return null;
      const units = parseFloat($('.units', container).value);
      let buyNav = parseFloat($('.buynav', container).value);
      if (!buyNav && latest) buyNav = latest.nav;
      if (!units || units <= 0) return { error: 'Enter the number of units.' };
      if (!buyNav || buyNav <= 0) return { error: 'Enter the buy NAV (latest NAV unavailable).' };
      return { code: selection.code, name: selection.name, units, buyNav, latest };
    },
    hasQuery: () => !!selection,
    reset() {
      selection = null; latest = null;
      q.value = ''; results.hidden = true; chosen.hidden = true;
      $('.units', container).value = ''; $('.buynav', container).value = ''; $('.buynav', container).placeholder = 'defaults to latest';
    },
  };
}

/* ================= dialogs & actions ================= */
let pfPicker, fundPicker, fundTargetPid = null;

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

async function handleAddPortfolio(e) {
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
    p.funds.push({ code: fund.code, name: fund.name, units: fund.units, buyNav: fund.buyNav });
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
  if (p.funds.some(f => String(f.code) === String(fund.code))) { err.textContent = 'This fund is already in the portfolio.'; return; }
  p.funds.push({ code: fund.code, name: fund.name, units: fund.units, buyNav: fund.buyNav });
  if (fund.latest) {
    const prev = vault.navCache[fund.code];
    if (!prev) vault.navCache[fund.code] = { nav: fund.latest.nav, date: fund.latest.date };
  }
  await persist();
  $('#dlgFund').close();
  render();
  toast(`Added to “${p.name}”`);
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
  if (!btn) return;
  const { action, pid, code } = btn.dataset;
  if (action === 'refresh') refreshNavs();
  if (action === 'add-portfolio') {
    $('#frmPortfolio').reset(); $('#pfErr').textContent = '';
    pfPicker.reset();
    $('#ownerList').innerHTML = vault.owners.map(o => `<option value="${esc(o)}">`).join('');
    $('#dlgPortfolio').showModal();
  }
  if (action === 'add-fund') {
    fundTargetPid = pid;
    const p = vault.portfolios.find(x => x.id === pid);
    $('#fundTitle').textContent = `Add fund — ${p ? p.name : ''}`;
    $('#fundErr').textContent = '';
    fundPicker.reset();
    $('#dlgFund').showModal();
  }
  if (action === 'del-fund') {
    const p = vault.portfolios.find(x => x.id === pid);
    const f = p && p.funds.find(f => String(f.code) === String(code));
    if (f && confirm(`Remove “${f.name}” from ${p.name}?`)) {
      p.funds = p.funds.filter(x => x !== f);
      persist().then(render);
    }
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
  if (action === 'lock') location.reload();
}

/* ================= boot ================= */
async function boot() {
  pfPicker = createFundPicker($('#pfFundPicker'));
  fundPicker = createFundPicker($('#fundPicker'));

  $('#frmVault').addEventListener('submit', handleVaultSubmit);
  $('#frmPortfolio').addEventListener('submit', handleAddPortfolio);
  $('#frmFund').addEventListener('submit', handleAddFund);
  $('#frmSettings').addEventListener('submit', handleSettings);
  $('#app').addEventListener('click', onAppClick);
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));

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

  openVaultDialog(localBlob() ? 'unlock' : 'create');
}

boot();
