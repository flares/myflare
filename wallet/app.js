'use strict';

/* ================= constants ================= */
const LS_FB = 'wallet.firebase.config';
const PBKDF2_ITERS = 310000;
const SESSION_MS = 30 * 60 * 1000; // stay unlocked for 30 min (sliding)
const CARD_W = 900, CARD_H = 568;  // ISO/IEC 7810 ID-1 ratio (~1.586), fixed output size for every card
const CATS = {
  id:      { label: 'ID',      icon: '🪪', color: 'var(--cat-id)' },
  credit:  { label: 'Credit',  icon: '💳', color: 'var(--cat-credit)' },
  debit:   { label: 'Debit',   icon: '💳', color: 'var(--cat-debit)' },
  balance: { label: 'Balance', icon: '🏦', color: 'var(--cat-balance)' },
  other:   { label: 'Other',   icon: '🗂️', color: 'var(--cat-other)' },
};

/* ================= state ================= */
let cryptoKey = null;      // AES-GCM key (in memory only)
let vaultUnlocked = false;
let cards = [];             // decrypted, in-memory: {id, label, category, note, image, createdAt, updatedAt}
let activeIndex = 0;
let filter = 'all';
let fbase = null;           // set once Firebase is connected

/* wizard (add-card flow) state */
let wizSrcImage = null;     // <img> or <canvas> being cropped
let wizFit = null;          // {scale, dx, dy, iw, ih, cssW, cssH}
let wizQuad = null;         // 4 {x,y} corners, CSS-px space of the crop stage
let wizWarped = null;       // canvas, CARD_W x CARD_H, after perspective warp
let wizFinalDataURL = null;
let wizCategory = null;
let wizBrushSize = 14;
let wizUndoStack = [];
let dragCorner = -1;
let painting = false;

let editCategory = null;
let currentViewCardId = null;

/* ================= tiny helpers ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}
function syncStatus(msg) { const el = $('#syncStatus'); if (el) el.textContent = msg || ''; }

/* ================= crypto ================= */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function decryptJSON(key, rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ================= IndexedDB storage ================= */
let _dbPromise = null;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wallet-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function db() { return _dbPromise || (_dbPromise = openDB()); }

async function metaGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction('meta', 'readonly').objectStore('meta').get(key);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function metaPut(key, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
async function cardsGetAll() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction('cards', 'readonly').objectStore('cards').getAll();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function cardPut(record) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('cards', 'readwrite');
    tx.objectStore('cards').put(record);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
async function cardDelete(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('cards', 'readwrite');
    tx.objectStore('cards').delete(id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

/* ---- unlocked-session cache (IndexedDB can hold a non-extractable CryptoKey) ---- */
function idbSession(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('wallet-session', 1);
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
  try { await idbSession('readwrite', s => s.put({ key: cryptoKey, exp: Date.now() + SESSION_MS }, 'session')); } catch {}
}
async function loadSession() {
  try { return await idbSession('readonly', s => s.get('session')); } catch { return null; }
}
async function clearSession() {
  try { await idbSession('readwrite', s => s.delete('session')); } catch {}
}

/* ================= Firebase (optional) ================= */
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
  fbase = { db, doc: fsM.doc, setDoc: fsM.setDoc, getDoc: fsM.getDoc, collection: fsM.collection, getDocs: fsM.getDocs, deleteDoc: fsM.deleteDoc };
  syncStatus('Firebase connected');
}
async function pullMetaRemote() {
  try { const snap = await fbase.getDoc(fbase.doc(fbase.db, 'wallet_meta', 'main')); return snap.exists() ? snap.data() : null; }
  catch (e) { console.warn(e); return null; }
}
async function pushMetaRemote() {
  if (!fbase) return;
  try {
    const saltRec = await metaGet('salt'), canaryRec = await metaGet('canary');
    await fbase.setDoc(fbase.doc(fbase.db, 'wallet_meta', 'main'), { salt: saltRec.value, canaryIv: canaryRec.iv, canaryCt: canaryRec.ct, updatedAt: Date.now() });
  } catch (e) { console.warn(e); }
}
async function pushCardRemote(rec) {
  if (!fbase) return;
  try {
    await fbase.setDoc(fbase.doc(fbase.db, 'wallet_cards', rec.id), rec);
    syncStatus('Synced ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) { console.warn(e); syncStatus('Sync failed'); }
}
async function deleteCardRemote(id) {
  if (!fbase) return;
  try { await fbase.deleteDoc(fbase.doc(fbase.db, 'wallet_cards', id)); } catch (e) { console.warn(e); }
}
async function getAllRemoteCards() {
  const snap = await fbase.getDocs(fbase.collection(fbase.db, 'wallet_cards'));
  const out = []; snap.forEach(d => out.push(d.data())); return out;
}
async function syncCardsWithRemote() {
  if (!fbase) return;
  try {
    const remoteRecs = await getAllRemoteCards();
    const localRecs = await cardsGetAll();
    const localById = new Map(localRecs.map(r => [r.id, r]));
    const remoteById = new Map(remoteRecs.map(r => [r.id, r]));
    for (const rr of remoteRecs) { const lr = localById.get(rr.id); if (!lr || rr.updatedAt > lr.updatedAt) await cardPut(rr); }
    for (const lr of localRecs) { const rr = remoteById.get(lr.id); if (!rr || lr.updatedAt > rr.updatedAt) pushCardRemote(lr); }
    await loadCardsFromLocal();
    renderDeck();
  } catch (e) { console.warn(e); }
}

/* ================= image / geometry helpers ================= */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}
function rotateImage90(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement('canvas'); c.width = h; c.height = w;
  const ctx = c.getContext('2d');
  ctx.translate(h, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(img, 0, 0, w, h);
  return c;
}
// Maps source triangle -> destination triangle with a 2D affine transform (Canvas2D has no true
// projective transform), then clips to the destination triangle before drawing. Two triangles
// covering the quad approximate a full perspective warp — the standard trick for "unwarping" a
// photographed rectangle back to straight with only Canvas2D.
function affineTri(ctx, img, src, dst) {
  const [s0, s1, s2] = src, [d0, d1, d2] = dst;
  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denom;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denom;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
function warpQuadToRect(img, quad, destW, destH) {
  const out = document.createElement('canvas'); out.width = destW; out.height = destH;
  const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const [tl, tr, br, bl] = quad;
  affineTri(ctx, img, [tl, tr, bl], [{ x: 0, y: 0 }, { x: destW, y: 0 }, { x: 0, y: destH }]);
  affineTri(ctx, img, [tr, br, bl], [{ x: destW, y: 0 }, { x: destW, y: destH }, { x: 0, y: destH }]);
  return out;
}
function toCanvasXY(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
}

/* ================= vault unlock / create ================= */
let vaultMode = 'unlock';
function openVaultDialog(createMode) {
  vaultMode = createMode ? 'create' : 'unlock';
  $('#vaultTitle').textContent = createMode ? 'Create your wallet' : 'Unlock';
  $('#vaultHint').textContent = createMode
    ? 'Choose a passphrase. Every card image is encrypted with it before it is ever stored — there is no recovery if you forget it.'
    : 'Enter your passphrase to unlock your wallet.';
  $('#vaultPass2Row').hidden = !createMode;
  $('#vaultPass2').required = createMode;
  $('#vaultErr').textContent = '';
  $('#vaultPass').value = ''; $('#vaultPass2').value = '';
  $('#dlgVault').showModal();
  $('#vaultPass').focus();
}
$('#frmVault').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#vaultErr');
  const pass = $('#vaultPass').value;
  try {
    if (vaultMode === 'create') {
      if (pass !== $('#vaultPass2').value) { err.textContent = 'Passphrases do not match.'; return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      cryptoKey = await deriveKey(pass, salt);
      const canary = await encryptJSON(cryptoKey, { ok: true, v: 1 });
      await metaPut('salt', { value: b64(salt) });
      await metaPut('canary', canary);
      if (fbase) pushMetaRemote();
    } else {
      const saltRec = await metaGet('salt');
      const key = await deriveKey(pass, unb64(saltRec.value));
      const canaryRec = await metaGet('canary');
      await decryptJSON(key, canaryRec); // throws if passphrase is wrong
      cryptoKey = key;
    }
  } catch {
    err.textContent = 'Wrong passphrase (or corrupted data).';
    return;
  }
  await saveSession();
  $('#dlgVault').close();
  await afterUnlock();
});

async function afterUnlock() {
  vaultUnlocked = true;
  await loadCardsFromLocal();
  renderDeck();
  if (fbase) syncCardsWithRemote();
}
async function loadCardsFromLocal() {
  const recs = await cardsGetAll();
  const decoded = [];
  for (const r of recs) {
    try { decoded.push({ id: r.id, updatedAt: r.updatedAt, ...(await decryptJSON(cryptoKey, r)) }); }
    catch (e) { console.warn('skipping undecryptable card', r.id, e); }
  }
  decoded.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  cards = decoded;
  activeIndex = Math.max(0, cards.length - 1);
}
async function lockVault() {
  await clearSession();
  cryptoKey = null; vaultUnlocked = false; cards = []; activeIndex = 0;
  $('#app').innerHTML = '';
  const saltRec = await metaGet('salt');
  openVaultDialog(!saltRec);
}

/* ================= deck (cardholder) rendering ================= */
function currentCards() { return filter === 'all' ? cards : cards.filter(c => c.category === filter); }
function updateFilterChips() { [...$('#filterRow').children].forEach(b => b.classList.toggle('active', b.dataset.filter === filter)); }

function cardHTML(c, i) {
  const cat = CATS[c.category] || CATS.other;
  return `<div class="walletcard" data-id="${c.id}" data-idx="${i}">
    <img src="${c.image}" alt="">
    <div class="scrim">
      <div class="clabel">${esc(c.label || 'Untitled')}</div>
      <div class="cmeta"><span class="cbadge" style="background:${cat.color}">${cat.icon} ${cat.label}</span>${c.note ? ' · ' + esc(c.note) : ''}</div>
    </div>
  </div>`;
}
function renderDeck() {
  const list = currentCards();
  const appEl = $('#app');
  if (!list.length) {
    appEl.innerHTML = `<div class="empty"><div class="plus">🪪</div><p>No cards yet.</p>
      <div class="modalactions" style="justify-content:center;margin-top:1rem">
        <button class="btn primary" data-action="add-card">+ Add your first card</button>
      </div></div>`;
    return;
  }
  if (activeIndex >= list.length) activeIndex = list.length - 1;
  if (activeIndex < 0) activeIndex = 0;
  const slots = list.length;
  const items = list.map((c, i) => cardHTML(c, i)).join('') +
    `<div class="walletcard blank" data-idx="${slots}" data-blank="1"><span class="plus">+</span><span>Add card</span></div>`;
  appEl.innerHTML = `
    <div class="deckwrap">
      <div class="deck" id="deckEl">${items}</div>
      <div class="deckdots">${list.map((_, i) => `<span class="${i === activeIndex ? 'active' : ''}"></span>`).join('')}</div>
      <div class="deckhint">${list.length > 1 ? 'Swipe, or tap a card to bring it forward' : ''}</div>
    </div>`;
  appEl._list = list;
  positionDeck();
}
function positionDeck() {
  const deckEl = $('#deckEl'); if (!deckEl) return;
  [...deckEl.children].forEach(el => {
    const idx = Number(el.dataset.idx);
    const off = idx - activeIndex;
    const a = Math.min(Math.abs(off), 4);
    const tx = off === 0 ? 0 : (off > 0 ? 1 : -1) * (18 + a * 14);
    const scale = 1 - a * 0.055;
    const rot = Math.max(-8, Math.min(8, off * 4));
    el.style.transform = `translateX(${tx}px) scale(${scale}) rotate(${off === 0 ? 0 : rot}deg)`;
    el.style.zIndex = off === 0 ? 100 : 100 - a;
    el.style.opacity = a > 4 ? 0 : String(1 - a * 0.12);
    el.style.filter = off === 0 ? 'none' : `brightness(${1 - a * 0.08})`;
  });
  [...$('#app').querySelectorAll('.deckdots span')].forEach((d, i) => d.classList.toggle('active', i === activeIndex));
}
(function wireDeckPointerOnce() {
  document.addEventListener('pointerdown', e => {
    const deckEl = $('#deckEl'); if (!deckEl || !deckEl.contains(e.target)) return;
    const card = e.target.closest('.walletcard'); if (!card) return;
    deckEl._drag = { x: e.clientX, y: e.clientY, moved: false, idx: Number(card.dataset.idx) };
  });
  document.addEventListener('pointermove', e => {
    const deckEl = $('#deckEl'); if (!deckEl || !deckEl._drag) return;
    if (Math.abs(e.clientX - deckEl._drag.x) > 8 || Math.abs(e.clientY - deckEl._drag.y) > 8) deckEl._drag.moved = true;
  });
  document.addEventListener('pointerup', e => {
    const deckEl = $('#deckEl'); if (!deckEl || !deckEl._drag) return;
    const drag = deckEl._drag; deckEl._drag = null;
    const dx = e.clientX - drag.x;
    const list = $('#app')._list || [];
    const maxIdx = list.length + 1; // + the trailing blank "add card" slot
    if (Math.abs(dx) > 45) {
      activeIndex = Math.max(0, Math.min(maxIdx - 1, activeIndex + (dx < 0 ? 1 : -1)));
      positionDeck();
    } else if (!drag.moved) {
      if (drag.idx === activeIndex) {
        if (drag.idx === list.length) openAddWizard();
        else openViewer(list[drag.idx]);
      } else {
        activeIndex = drag.idx; positionDeck();
      }
    }
  });
})();

/* ================= fullscreen viewer ================= */
function openViewer(card) {
  currentViewCardId = card.id;
  const cat = CATS[card.category] || CATS.other;
  $('#viewerImg').src = card.image;
  $('#viewerLabel').textContent = `${cat.icon} ${card.label || 'Untitled'}`;
  $('#viewerNote').textContent = card.note || '';
  $('#dlgView').showModal();
}
function openEditFromViewer() {
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card) return;
  $('#editLabel').value = card.label || '';
  $('#editNote').value = card.note || '';
  editCategory = card.category;
  [...$('#editCatPick').children].forEach(b => b.classList.toggle('active', b.dataset.cat === editCategory));
  $('#dlgView').close();
  $('#dlgEdit').showModal();
}
$('#frmEdit').addEventListener('submit', async e => {
  e.preventDefault();
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card) { $('#dlgEdit').close(); return; }
  card.label = $('#editLabel').value.trim() || 'Untitled';
  card.note = $('#editNote').value.trim();
  card.category = editCategory || card.category;
  card.updatedAt = Date.now();
  await persistCard(card);
  $('#dlgEdit').close();
  renderDeck();
  toast('Saved');
});
$('#btnDeleteCard').addEventListener('click', async () => {
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card) return;
  if (!confirm('Delete this card? This cannot be undone.')) return;
  cards = cards.filter(c => c.id !== card.id);
  await cardDelete(card.id);
  deleteCardRemote(card.id);
  $('#dlgEdit').close();
  renderDeck();
  toast('Card deleted');
});
async function persistCard(card) {
  const { id, updatedAt, ...plain } = card;
  const enc = await encryptJSON(cryptoKey, plain);
  const rec = { id, iv: enc.iv, ct: enc.ct, updatedAt };
  await cardPut(rec);
  pushCardRemote(rec);
}

/* ================= add-card wizard ================= */
function showStep(id) {
  [...$('#wizard').children].forEach(s => s.hidden = s.id !== id);
}
function openAddWizard() {
  wizSrcImage = null; wizQuad = null; wizWarped = null; wizFinalDataURL = null;
  wizCategory = null; wizUndoStack = [];
  $('#cardLabel').value = ''; $('#cardNote').value = ''; $('#detailsErr').textContent = '';
  [...$('#catPick').children].forEach(b => b.classList.remove('active'));
  showStep('stepSource');
  $('#dlgAdd').showModal();
}
function closeWizard() { $('#dlgAdd').close(); }

async function handleFile(file) {
  if (!file) return;
  try {
    wizSrcImage = await loadImageFile(file);
    showStep('stepCrop');
    setupCropStage();
  } catch { toast('Could not load that image'); }
}
$('#fileCamera').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
$('#fileGallery').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });

function setupCropStage() {
  const iw = wizSrcImage.naturalWidth || wizSrcImage.width, ih = wizSrcImage.naturalHeight || wizSrcImage.height;
  const stage = $('#cropStage');
  stage.style.aspectRatio = `${iw} / ${ih}`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const rect = stage.getBoundingClientRect();
    const cssW = rect.width, cssH = rect.height;
    const canvas = $('#cropCanvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cssW, cssH);
    ctx.drawImage(wizSrcImage, 0, 0, iw, ih, 0, 0, cssW, cssH);
    wizFit = { scale: cssW / iw, dx: 0, dy: 0, iw, ih, cssW, cssH };
    const insetX = cssW * 0.08, insetY = cssH * 0.08;
    wizQuad = [
      { x: insetX, y: insetY }, { x: cssW - insetX, y: insetY },
      { x: cssW - insetX, y: cssH - insetY }, { x: insetX, y: cssH - insetY },
    ];
    $('#cropOverlay').setAttribute('viewBox', `0 0 ${cssW} ${cssH}`);
    drawQuadOverlay();
  }));
}
function drawQuadOverlay() {
  const o = $('#cropOverlay');
  const pts = wizQuad.map(p => `${p.x},${p.y}`).join(' ');
  o.innerHTML = `<polygon class="quadline" points="${pts}"></polygon>` +
    wizQuad.map((p, i) => `<circle class="handle" data-i="${i}" cx="${p.x}" cy="${p.y}" r="20"></circle>`).join('');
}
(function wireCropOverlayOnce() {
  const o = document.getElementById('cropOverlay');
  o.addEventListener('pointerdown', e => {
    const t = e.target.closest('.handle'); if (!t) return;
    dragCorner = Number(t.dataset.i);
    o.setPointerCapture(e.pointerId);
  });
  o.addEventListener('pointermove', e => {
    if (dragCorner < 0 || !wizQuad) return;
    const rect = o.getBoundingClientRect();
    const scaleX = wizFit.cssW / rect.width, scaleY = wizFit.cssH / rect.height;
    let x = (e.clientX - rect.left) * scaleX, y = (e.clientY - rect.top) * scaleY;
    x = Math.max(0, Math.min(wizFit.cssW, x)); y = Math.max(0, Math.min(wizFit.cssH, y));
    wizQuad[dragCorner] = { x, y };
    drawQuadOverlay();
  });
  const release = () => { dragCorner = -1; };
  o.addEventListener('pointerup', release);
  o.addEventListener('pointercancel', release);
})();

function doWarp() {
  const srcPts = wizQuad.map(p => ({ x: (p.x - wizFit.dx) / wizFit.scale, y: (p.y - wizFit.dy) / wizFit.scale }));
  wizWarped = warpQuadToRect(wizSrcImage, srcPts, CARD_W, CARD_H);
  showStep('stepTouchup');
  setupTouchStage();
}
function setupTouchStage() {
  const canvas = $('#touchCanvas');
  canvas.width = CARD_W; canvas.height = CARD_H;
  $('#touchCanvas').parentElement.style.aspectRatio = `${CARD_W} / ${CARD_H}`;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(wizWarped, 0, 0);
  wizUndoStack = [];
}
(function wireBrushOnce() {
  const canvas = document.getElementById('touchCanvas');
  canvas.addEventListener('pointerdown', e => {
    painting = true; canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    wizUndoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (wizUndoStack.length > 12) wizUndoStack.shift();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; ctx.lineWidth = wizBrushSize;
    const { x, y } = toCanvasXY(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y + 0.01); ctx.stroke();
    canvas._lastPt = { x, y };
  });
  canvas.addEventListener('pointermove', e => {
    if (!painting) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = toCanvasXY(e, canvas);
    ctx.beginPath(); ctx.moveTo(canvas._lastPt.x, canvas._lastPt.y); ctx.lineTo(x, y); ctx.stroke();
    canvas._lastPt = { x, y };
  });
  const end = () => { painting = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
})();
function undoStroke() {
  const canvas = $('#touchCanvas');
  const img = wizUndoStack.pop();
  if (img) canvas.getContext('2d').putImageData(img, 0, 0);
}

function toDetails() {
  wizFinalDataURL = $('#touchCanvas').toDataURL('image/jpeg', 0.9);
  $('#detailPreview').innerHTML = `<img src="${wizFinalDataURL}" alt="">`;
  showStep('stepDetails');
}
$('#btnSaveCard').addEventListener('click', async () => {
  if (!wizCategory) { $('#detailsErr').textContent = 'Pick a category.'; return; }
  const label = $('#cardLabel').value.trim() || 'Untitled';
  const note = $('#cardNote').value.trim();
  const createdAt = new Date().toISOString();
  const plain = { label, category: wizCategory, note, image: wizFinalDataURL, createdAt };
  const enc = await encryptJSON(cryptoKey, plain);
  const rec = { id: uid(), iv: enc.iv, ct: enc.ct, updatedAt: Date.now() };
  await cardPut(rec);
  cards.push({ id: rec.id, updatedAt: rec.updatedAt, ...plain });
  pushCardRemote(rec);
  filter = 'all'; updateFilterChips();
  activeIndex = currentCards().length - 1;
  closeWizard();
  renderDeck();
  toast('Card saved');
});

/* ================= settings ================= */
function openSettings() {
  $('#fbConfig').value = localStorage.getItem(LS_FB) || '';
  $('#fbStatus').textContent = fbase ? 'Connected' : 'Not connected — cards are local-only on this device.';
  $('#settingsErr').textContent = '';
  $('#dlgSettings').showModal();
}
$('#frmSettings').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#settingsErr');
  const cfgStr = $('#fbConfig').value.trim();
  try {
    if (cfgStr) {
      const cfg = JSON.parse(cfgStr);
      await initFirebase(cfg);
      localStorage.setItem(LS_FB, JSON.stringify(cfg));
      toast('Firebase connected');
      if (vaultUnlocked) syncCardsWithRemote();
    } else {
      localStorage.removeItem(LS_FB);
      fbase = null;
      syncStatus('');
    }
    $('#dlgSettings').close();
  } catch (e2) {
    console.warn(e2);
    err.textContent = 'Could not connect — check the config, Anonymous auth, and Firestore setup.';
  }
});
$('#btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ cards }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wallet-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#btnImport').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data.cards) ? data.cards : [];
    for (const c of incoming) {
      const id = uid();
      const plain = { label: c.label || 'Untitled', category: CATS[c.category] ? c.category : 'other', note: c.note || '', image: c.image, createdAt: c.createdAt || new Date().toISOString() };
      const enc = await encryptJSON(cryptoKey, plain);
      const rec = { id, iv: enc.iv, ct: enc.ct, updatedAt: Date.now() };
      await cardPut(rec);
      cards.push({ id, updatedAt: rec.updatedAt, ...plain });
      pushCardRemote(rec);
    }
    cards.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    $('#dlgSettings').close();
    renderDeck();
    toast(`Imported ${incoming.length} card(s)`);
  } catch (err) { console.warn(err); toast('Could not read that backup file'); }
});

/* ================= global click delegation ================= */
document.addEventListener('click', e => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) { closeBtn.closest('dialog').close(); return; }

  const filterChip = e.target.closest('#filterRow .chip');
  if (filterChip) { filter = filterChip.dataset.filter; updateFilterChips(); activeIndex = 0; renderDeck(); return; }

  const catBtn = e.target.closest('.catbtn');
  if (catBtn) {
    const inAdd = catBtn.closest('#catPick');
    if (inAdd) { wizCategory = catBtn.dataset.cat; [...$('#catPick').children].forEach(b => b.classList.toggle('active', b === catBtn)); }
    else { editCategory = catBtn.dataset.cat; [...$('#editCatPick').children].forEach(b => b.classList.toggle('active', b === catBtn)); }
    return;
  }
  const brushBtn = e.target.closest('.brushsize');
  if (brushBtn) {
    wizBrushSize = Number(brushBtn.dataset.size);
    [...brushBtn.parentElement.querySelectorAll('.brushsize')].forEach(b => b.classList.toggle('active', b === brushBtn));
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.action) {
    case 'settings': openSettings(); break;
    case 'lock': lockVault(); break;
    case 'add-card': openAddWizard(); break;
    case 'cancel-wizard': closeWizard(); break;
    case 'rotate-src': wizSrcImage = rotateImage90(wizSrcImage); setupCropStage(); break;
    case 'do-warp': doWarp(); break;
    case 'undo-stroke': undoStroke(); break;
    case 'to-details': toDetails(); break;
    case 'back-touchup': showStep('stepTouchup'); break;
    case 'close-viewer': $('#dlgView').close(); break;
    case 'edit-card': openEditFromViewer(); break;
  }
});

/* ================= privacy veil (hide thumbnails when backgrounded) ================= */
document.addEventListener('visibilitychange', () => {
  $('#privacyVeil').classList.toggle('show', document.hidden && vaultUnlocked);
});

/* ================= init ================= */
async function init() {
  const cfgStr = localStorage.getItem(LS_FB);
  if (cfgStr) { try { await initFirebase(JSON.parse(cfgStr)); } catch (e) { console.warn(e); syncStatus('Firebase unavailable'); } }

  const session = await loadSession();
  if (session && session.exp > Date.now()) {
    cryptoKey = session.key;
    await afterUnlock();
    return;
  }

  let saltRec = await metaGet('salt');
  if (!saltRec && fbase) {
    const remoteMeta = await pullMetaRemote();
    if (remoteMeta) {
      await metaPut('salt', { value: remoteMeta.salt });
      await metaPut('canary', { iv: remoteMeta.canaryIv, ct: remoteMeta.canaryCt });
      saltRec = await metaGet('salt');
    }
  }
  openVaultDialog(!saltRec);
}
init();
