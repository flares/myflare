'use strict';

/* ================= constants ================= */
const LS_FB = 'wallet.firebase.config';
const LS_AVATARS = 'wallet.personAvatars';
const AVATAR_EMOJIS = ['👶','🧒','👦','👧','🧑','👨','👩','🧔','🧕','👱','👴','👵','🧓','👨‍🦰','👩‍🦰','👨‍🦱','👩‍🦱','👨‍🦳','👩‍🦳','🧑‍🦲'];
const PBKDF2_ITERS = 310000;
const SESSION_MS = 30 * 60 * 1000; // stay unlocked for 30 min (sliding)
const CARD_LONG = 900, CARD_SHORT = 568; // ISO/IEC 7810 ID-1 ratio (~1.586); orientation picked per card
const OCR_TIMEOUT_MS = 15000;
const CATS = {
  id:      { label: 'ID',      icon: '🪪', color: 'var(--cat-id)' },
  credit:  { label: 'Credit',  icon: '💳', color: 'var(--cat-credit)' },
  debit:   { label: 'Debit',   icon: '💳', color: 'var(--cat-debit)' },
  balance: { label: 'Balance', icon: '🏦', color: 'var(--cat-balance)' },
  other:   { label: 'Other',   icon: '🗂️', color: 'var(--cat-other)' },
};

/* ================= state ================= */
let cryptoKey = null;       // AES-GCM key (in memory only) — null unless the wallet has been locked at least once and is currently unlocked
let vaultEncrypted = false; // true once the user has ever set a passphrase
let vaultUnlocked = false;  // true once the tables are usable (unencrypted-by-default, or unlocked)
let cards = [];               // decrypted/plain, in-memory: {id, category, ...}; category 'notes' holds {person, kv} instead of a photo
let personFilter = 'all';    // person filter / column-highlight
let personAvatars = JSON.parse(localStorage.getItem(LS_AVATARS) || '{}'); // person name -> chosen emoji
let avatarEditPerson = null; // person currently targeted by the avatar picker dialog
let notesEditPerson = null;  // person currently targeted by the notes editor dialog
let notesEditKV = [];        // working copy of that person's key/value rows while the dialog is open
let fbase = null;            // set once Firebase is connected

/* wizard (add-card / retake) state */
let wizSrcImage = null;      // <img> or <canvas> being cropped
let wizFit = null;           // {scale, dx, dy, iw, ih, cssW, cssH}
let wizQuad = null;          // 4 {x,y} corners, CSS-px space of the crop stage
let wizWarped = null;        // canvas after perspective warp
let wizFinalDataURL = null;  // pending front image (new-card flow)
let wizFinalOrientation = 'landscape'; // orientation of the pending front image
let wizBackDataURL = null;   // pending back image (new-card flow)
let wizOcrText = '';
let wizCategory = null;
let wizBrushSize = 14;
let wizUndoStack = [];
let wizBrushUsed = false;
let wizTarget = { cardId: null, side: 'front' }; // where finishSide() writes its result
let dragCorner = -1;
let painting = false;

let editCategory = null;
let currentViewCardId = null;

/* ================= tiny helpers ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalizeTag = raw => (raw || '').trim().replace(/^@+/, '').toLowerCase();

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
// Cards are stored plain (enc:false) until the wallet has been locked with a passphrase at least
// once; from then on new/edited cards are stored encrypted (enc:true). Both shapes coexist in the
// same store so "Lock" can re-encrypt everything already there without a data migration step.
async function packCard(plain) {
  if (cryptoKey) { const enc = await encryptJSON(cryptoKey, plain); return { enc: true, iv: enc.iv, ct: enc.ct }; }
  return { enc: false, pt: JSON.stringify(plain) };
}
async function unpackCard(rec) {
  if (rec.enc) {
    if (!cryptoKey) throw new Error('locked');
    return decryptJSON(cryptoKey, rec);
  }
  return JSON.parse(rec.pt);
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
// Sync only ever runs once the wallet is encrypted — never push plaintext to the network.
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
  if (!fbase || !vaultEncrypted) return;
  try {
    const saltRec = await metaGet('salt'), canaryRec = await metaGet('canary');
    await fbase.setDoc(fbase.doc(fbase.db, 'wallet_meta', 'main'), { salt: saltRec.value, canaryIv: canaryRec.iv, canaryCt: canaryRec.ct, updatedAt: Date.now() });
  } catch (e) { console.warn(e); }
}
async function pushCardRemote(rec) {
  if (!fbase || !vaultEncrypted || !rec.enc) return;
  try {
    await fbase.setDoc(fbase.doc(fbase.db, 'wallet_cards', rec.id), rec);
    syncStatus('Synced ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) { console.warn(e); syncStatus('Sync failed'); }
}
async function deleteCardRemote(id) {
  if (!fbase || !vaultEncrypted) return;
  try { await fbase.deleteDoc(fbase.doc(fbase.db, 'wallet_cards', id)); } catch (e) { console.warn(e); }
}
async function getAllRemoteCards() {
  const snap = await fbase.getDocs(fbase.collection(fbase.db, 'wallet_cards'));
  const out = []; snap.forEach(d => out.push(d.data())); return out;
}
async function syncCardsWithRemote() {
  if (!fbase || !vaultEncrypted) return;
  try {
    const remoteRecs = await getAllRemoteCards();
    const localRecs = await cardsGetAll();
    const localById = new Map(localRecs.map(r => [r.id, r]));
    const remoteById = new Map(remoteRecs.map(r => [r.id, r]));
    for (const rr of remoteRecs) { const lr = localById.get(rr.id); if (!lr || rr.updatedAt > lr.updatedAt) await cardPut(rr); }
    for (const lr of localRecs) { const rr = remoteById.get(lr.id); if (lr.enc && (!rr || lr.updatedAt > rr.updatedAt)) pushCardRemote(lr); }
    await loadCardsFromLocal();
    refreshUI();
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
// Square-to-quad projective mapping (Heckbert): given where the unit square's four corners
// (0,0),(1,0),(1,1),(0,1) land, returns a function from any (u,v) in that square to the matching
// point in the quad. Used below with (u,v) = normalized destination-rectangle coordinates and the
// quad = the marked source corners, which gives a true perspective "unwarp" with Canvas2D (which
// has no native projective transform) — unlike a two-triangle affine approximation, there's no
// seam, because every destination pixel is sampled independently rather than one flat transform
// per half of the quad.
function quadProjector(quad) {
  const [{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }] = quad; // tl, tr, br, bl
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const denom = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / denom;
    h = (dx1 * dy3 - dx3 * dy1) / denom;
  }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}
function warpQuadToRect(img, quad, destW, destH) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const srcCanvas = document.createElement('canvas'); srcCanvas.width = iw; srcCanvas.height = ih;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, iw, ih);
  const src = sctx.getImageData(0, 0, iw, ih).data;

  const project = quadProjector(quad);
  const out = document.createElement('canvas'); out.width = destW; out.height = destH;
  const octx = out.getContext('2d');
  const outImg = octx.createImageData(destW, destH);
  const dst = outImg.data;

  for (let y = 0; y < destH; y++) {
    const v = (y + 0.5) / destH;
    for (let x = 0; x < destW; x++) {
      const u = (x + 0.5) / destW;
      const { x: sx, y: sy } = project(u, v);
      if (sx < 0 || sy < 0 || sx > iw - 1 || sy > ih - 1) continue; // stays transparent
      const sx0 = Math.floor(sx), sy0 = Math.floor(sy);
      const sx1 = Math.min(sx0 + 1, iw - 1), sy1 = Math.min(sy0 + 1, ih - 1);
      const fx = sx - sx0, fy = sy - sy0;
      const i00 = (sy0 * iw + sx0) * 4, i10 = (sy0 * iw + sx1) * 4, i01 = (sy1 * iw + sx0) * 4, i11 = (sy1 * iw + sx1) * 4;
      const di = (y * destW + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = src[i00 + ch] + (src[i10 + ch] - src[i00 + ch]) * fx;
        const bot = src[i01 + ch] + (src[i11 + ch] - src[i01 + ch]) * fx;
        dst[di + ch] = top + (bot - top) * fy;
      }
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}
// Picks a landscape or portrait output canvas to match the shape of the marked quad, so a
// portrait ID doesn't get squashed into a fixed landscape rectangle.
function destSizeForQuad(quad) {
  const [tl, tr, br, bl] = quad;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  return w >= h ? { w: CARD_LONG, h: CARD_SHORT } : { w: CARD_SHORT, h: CARD_LONG };
}
function toCanvasXY(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
}
function defaultInsetQuad(cssW, cssH) {
  const insetX = cssW * 0.08, insetY = cssH * 0.08;
  return [
    { x: insetX, y: insetY }, { x: cssW - insetX, y: insetY },
    { x: cssW - insetX, y: cssH - insetY }, { x: insetX, y: cssH - insetY },
  ];
}
// Best-effort card-boundary detection: treats the image border as "background", masks pixels
// that differ from it by more than a threshold, and returns the bounding box of the largest
// connected blob. Works well for a card photographed against a contrasting surface; falls back
// to null (caller uses the default inset quad) when no confident blob is found.
function autoDetectQuad(img) {
  try {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    let br = 0, bg = 0, bb = 0, bn = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < ring || x >= w - ring || y < ring || y >= h - ring) {
        const i = (y * w + x) * 4; br += data[i]; bg += data[i + 1]; bb += data[i + 2]; bn++;
      }
    }
    br /= bn; bg /= bn; bb /= bn;

    const mask = new Uint8Array(w * h);
    const thresh = 42;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
      mask[y * w + x] = Math.sqrt(dr * dr + dg * dg + db * db) > thresh ? 1 : 0;
    }

    const visited = new Uint8Array(w * h);
    const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
    let best = null, bestSize = 0;
    for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
      const idx = sy * w + sx;
      if (!mask[idx] || visited[idx]) continue;
      let head = 0, tail = 0;
      qx[tail] = sx; qy[tail] = sy; tail++; visited[idx] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy, size = 0;
      while (head < tail) {
        const cx = qx[head], cy = qy[head]; head++; size++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        const nb = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nidx = ny * w + nx;
          if (mask[nidx] && !visited[nidx]) { visited[nidx] = 1; qx[tail] = nx; qy[tail] = ny; tail++; }
        }
      }
      if (size > bestSize) { bestSize = size; best = { minX, maxX, minY, maxY }; }
    }
    if (!best) return null;
    const bw = best.maxX - best.minX, bh = best.maxY - best.minY;
    const area = bw * bh, totalArea = w * h;
    if (bestSize < totalArea * 0.06 || area > totalArea * 0.94 || bw < 4 || bh < 4) return null;
    const pad = 0.012;
    const x0 = (best.minX + bw * pad) / scale, x1 = (best.maxX - bw * pad) / scale;
    const y0 = (best.minY + bh * pad) / scale, y1 = (best.maxY - bh * pad) / scale;
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; // original image pixel space
  } catch (e) { console.warn('auto-detect failed', e); return null; }
}

/* ================= OCR (best-effort, on the fly) ================= */
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('could not load OCR engine'));
    document.head.appendChild(s);
  });
}
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
async function runOCR(dataURL) {
  const Tesseract = await withTimeout(loadTesseract(), OCR_TIMEOUT_MS);
  const { data } = await withTimeout(Tesseract.recognize(dataURL, 'eng'), OCR_TIMEOUT_MS);
  return data && data.text ? data.text : '';
}
function parseCardText(text) {
  const upper = text.toUpperCase();
  let category = null;
  if (/\bVISA\b|\bMASTERCARD\b|\bRUPAY\b|\bAMERICAN EXPRESS\b|\bAMEX\b|\bMAESTRO\b/.test(upper)) {
    category = /DEBIT/.test(upper) ? 'debit' : 'credit';
  } else if (/AADHAAR|AADHAR|PERMANENT ACCOUNT NUMBER|INCOME TAX DEPARTMENT|DRIVING LICEN[CS]E|PASSPORT|VOTER/.test(upper)) {
    category = 'id';
  } else if (/ACCOUNT NUMBER|\bIFSC\b|BALANCE|PASSBOOK|STATEMENT/.test(upper)) {
    category = 'balance';
  }
  let cardNumber = '';
  const numMatch = text.match(/\b(?:\d[ -]?){9,19}\b/g);
  if (numMatch && numMatch.length) {
    const raw = numMatch.sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0];
    cardNumber = raw.replace(/\s+/g, ' ').trim();
  }
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const bankLine = lines.find(l => /[A-Za-z]{3,}/.test(l) && l.length < 30 && !/\d{6,}/.test(l));
  const label = bankLine ? bankLine.replace(/[^A-Za-z0-9 .&'-]/g, '').trim().slice(0, 40) : '';
  return { category, cardNumber, label };
}
async function autoOCR() {
  const statusEl = $('#ocrStatus');
  statusEl.textContent = '🔎 Reading card…';
  try {
    const text = await runOCR(wizFinalDataURL);
    wizOcrText = text;
    if (!text.trim()) { statusEl.textContent = ''; return; }
    const parsed = parseCardText(text);
    if (parsed.label && !$('#cardLabel').value.trim()) $('#cardLabel').value = parsed.label;
    if (parsed.cardNumber && !$('#cardNumber').value.trim()) $('#cardNumber').value = parsed.cardNumber;
    if (parsed.category && !wizCategory) {
      wizCategory = parsed.category;
      [...$('#catPick').children].forEach(b => b.classList.toggle('active', b.dataset.cat === parsed.category));
    }
    statusEl.textContent = '✓ Detected text — check the fields below';
  } catch (e) {
    console.warn('OCR unavailable', e);
    statusEl.textContent = '';
  }
}

/* ================= vault: unlock / set passphrase ================= */
let vaultMode = 'unlock';
function openVaultDialog(createMode) {
  vaultMode = createMode ? 'create' : 'unlock';
  $('#vaultTitle').textContent = createMode ? 'Set up a passphrase' : 'Unlock';
  $('#vaultHint').textContent = createMode
    ? 'Choose a passphrase. Everything currently in your wallet — and everything you add from now on — will be encrypted with it, then locked. There is no recovery if you forget it.'
    : 'Enter your passphrase to unlock your wallet.';
  $('#vaultPass2Row').hidden = !createMode;
  $('#vaultPass2').required = createMode;
  $('#vaultCancel').hidden = !createMode;
  $('#vaultErr').textContent = '';
  $('#vaultPass').value = ''; $('#vaultPass2').value = '';
  $('#dlgVault').showModal();
  $('#vaultPass').focus();
}
// Block Escape/backdrop dismissal only while a real unlock is required — creating a passphrase
// (nothing encrypted yet) is fine to cancel out of.
$('#dlgVault').addEventListener('cancel', e => { if (vaultMode === 'unlock' && vaultEncrypted) e.preventDefault(); });

$('#frmVault').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#vaultErr');
  const pass = $('#vaultPass').value;
  try {
    if (vaultMode === 'create') {
      if (pass !== $('#vaultPass2').value) { err.textContent = 'Passphrases do not match.'; return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const newKey = await deriveKey(pass, salt);
      const canary = await encryptJSON(newKey, { ok: true, v: 1 });
      await metaPut('salt', { value: b64(salt) });
      await metaPut('canary', canary);
      await metaPut('encrypted', { value: true });
      cryptoKey = newKey;
      vaultEncrypted = true;
      await reencryptAllCardsLocally();
      pushMetaRemote();
      $('#dlgVault').close();
      // The whole point of tapping "Lock" was to lock — do that now rather than staying unlocked.
      await clearSession();
      cryptoKey = null;
      showLockedScreen();
      toast('Wallet encrypted and locked');
      return;
    } else {
      const saltRec = await metaGet('salt');
      const key = await deriveKey(pass, unb64(saltRec.value));
      const canaryRec = await metaGet('canary');
      await decryptJSON(key, canaryRec); // throws if passphrase is wrong
      cryptoKey = key;
    }
  } catch (e2) {
    console.warn(e2);
    err.textContent = 'Wrong passphrase (or corrupted data).';
    return;
  }
  await saveSession();
  $('#dlgVault').close();
  await afterUnlock();
});

async function reencryptAllCardsLocally() {
  const recs = await cardsGetAll();
  for (const r of recs) {
    if (r.enc) continue; // already encrypted (e.g. pulled from a device that locked first)
    try {
      const plain = JSON.parse(r.pt);
      const packed = await packCard(plain);
      const rec = { id: r.id, updatedAt: r.updatedAt, ...packed };
      await cardPut(rec);
      pushCardRemote(rec);
    } catch (e) { console.warn('could not re-encrypt card', r.id, e); }
  }
}

async function afterUnlock() {
  vaultUnlocked = true;
  await loadCardsFromLocal();
  refreshUI();
  updateLockIcon();
  if (fbase) syncCardsWithRemote();
}
async function loadCardsFromLocal() {
  const recs = await cardsGetAll();
  const decoded = [];
  for (const r of recs) {
    try { decoded.push({ id: r.id, updatedAt: r.updatedAt, ...(await unpackCard(r)) }); }
    catch (e) { console.warn('skipping unreadable card', r.id, e); }
  }
  decoded.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  cards = decoded;
}
function showLockedScreen() {
  vaultUnlocked = false; cards = [];
  $('#idMatrixSection').innerHTML = ''; $('#bankMatrixSection').innerHTML = '';
  const empty = $('#tablesEmpty');
  empty.hidden = false;
  empty.innerHTML = `<div class="plus">🔒</div><p>Wallet is locked.</p>
    <div class="modalactions" style="justify-content:center;margin-top:1rem">
      <button class="btn primary" data-action="lock">Unlock</button>
    </div>`;
  $('#personFilterRow').innerHTML = ''; $('#personFilterRow').hidden = true;
  updateLockIcon();
}
function updateLockIcon() {
  const btn = document.querySelector('[data-action="lock"]');
  if (!btn) return;
  btn.title = !vaultEncrypted ? 'Set up a passphrase & lock' : (cryptoKey ? 'Lock' : 'Unlock');
}
async function onLockButtonClick() {
  if (!vaultEncrypted) { openVaultDialog(true); return; }
  if (cryptoKey) {
    await clearSession();
    cryptoKey = null;
    showLockedScreen();
    return;
  }
  openVaultDialog(false);
}

/* ================= filters, datalists, matrix-table rendering ================= */
function refreshDatalists() {
  const persons = [...new Set(cards.map(c => c.person).filter(Boolean))].sort();
  $('#personList').innerHTML = persons.map(p => `<option value="${esc(p)}">`).join('');
  const tags = [...new Set(cards.map(c => c.tag).filter(Boolean))].sort();
  $('#tagList').innerHTML = tags.map(t => `<option value="@${esc(t)}">`).join('');
}

/* ---- person avatars: a chosen emoji per person, persisted; a stable default until chosen ---- */
function defaultAvatarFor(name) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_EMOJIS[Math.abs(h) % AVATAR_EMOJIS.length];
}
function personAvatar(name) { return personAvatars[name] || defaultAvatarFor(name); }
function openAvatarPicker(person) {
  avatarEditPerson = person;
  $('#avatarPersonName').textContent = person;
  const current = personAvatar(person);
  $('#emojiGrid').innerHTML = AVATAR_EMOJIS.map(em =>
    `<button type="button" class="emojibtn ${em === current ? 'active' : ''}" data-emoji="${em}">${em}</button>`).join('');
  $('#dlgAvatar').showModal();
}

// Real names only — used for the avatar row and for deciding which table column to highlight.
function namedPersons() { return [...new Set(cards.map(c => c.person).filter(Boolean))].sort(); }
// Table columns: named persons plus a trailing "Unassigned" bucket if any card has no person set.
function tableColumns() {
  const cols = namedPersons();
  return cards.some(c => !c.person && c.category !== 'notes') ? [...cols, 'Unassigned'] : cols;
}
function colCls(p) {
  if (personFilter === 'all') return '';
  return p === personFilter ? ' class="colhi"' : ' class="coldim"';
}

function renderPersonFilterRow() {
  const persons = namedPersons();
  const row = $('#personFilterRow');
  if (!persons.length) { row.innerHTML = ''; row.hidden = true; return; }
  if (personFilter !== 'all' && !persons.includes(personFilter)) personFilter = 'all';
  row.hidden = false;
  const allChip = `<div class="avatarchip">
    <button type="button" class="avatarblob all ${personFilter === 'all' ? 'active' : ''}" data-personfilter="all" aria-label="All people">👥</button>
    <span class="avatarname">All</span>
  </div>`;
  const chips = persons.map(p => `<div class="avatarchip">
    <button type="button" class="avatarblob ${personFilter === p ? 'active' : ''}" data-personfilter="${esc(p)}" aria-label="${esc(p)}">${personAvatar(p)}</button>
    <button type="button" class="avataredit" data-editavatar="${esc(p)}" aria-label="Change avatar for ${esc(p)}">✏️</button>
    <span class="avatarname">${esc(p)}</span>
  </div>`).join('');
  row.innerHTML = allChip + chips;
}

/* ---- per-person notes: free-form key/value reminders, stored as a category:'notes' pseudo-card
   so they ride the same encrypt-at-rest / Firebase-sync path as everything else ---- */
function personNotesRecord(person) { return cards.find(c => c.category === 'notes' && c.person === person); }
function notesRowHTML(persons) {
  const cells = persons.map(p => {
    const rec = personNotesRecord(p);
    const has = !!(rec && rec.kv && rec.kv.length);
    return `<td${colCls(p)}><button type="button" class="matrixtick notesbtn${has ? ' has' : ''}" data-notes-person="${esc(p)}" aria-label="${has ? 'Edit' : 'Add'} notes for ${esc(p)}">${has ? '📝' : '+'}</button></td>`;
  }).join('');
  return `<tr class="notesrow"><th scope="row">📝 Notes</th>${cells}</tr>`;
}
function openNotesEditor(person) {
  notesEditPerson = person;
  const rec = personNotesRecord(person);
  notesEditKV = rec && rec.kv && rec.kv.length ? rec.kv.map(x => ({ k: x.k || '', v: x.v || '' })) : [{ k: '', v: '' }];
  $('#notesPersonName').textContent = 'for ' + person;
  renderNotesEditor();
  $('#dlgNotes').showModal();
}
function renderNotesEditor() {
  $('#notesRows').innerHTML = notesEditKV.map((kv, i) => `
    <div class="noterow" data-i="${i}">
      <input type="text" class="notekey" placeholder="Label, e.g. Locker no." value="${esc(kv.k)}" maxlength="40">
      <input type="text" class="noteval" placeholder="Value" value="${esc(kv.v)}" maxlength="80">
      <button type="button" class="noterm" data-action="remove-note-row" aria-label="Remove field">✕</button>
    </div>`).join('');
}
async function saveNotesEditor() {
  const kv = notesEditKV.map(x => ({ k: x.k.trim(), v: x.v.trim() })).filter(x => x.k || x.v);
  const existing = personNotesRecord(notesEditPerson);
  if (!kv.length) {
    if (existing) {
      cards = cards.filter(c => c.id !== existing.id);
      await cardDelete(existing.id);
      deleteCardRemote(existing.id);
    }
  } else if (existing) {
    existing.kv = kv;
    existing.updatedAt = Date.now();
    await persistCard(existing);
  } else {
    const rec = { id: uid(), category: 'notes', person: notesEditPerson, kv, createdAt: new Date().toISOString(), updatedAt: Date.now() };
    cards.push(rec);
    await persistCard(rec);
  }
  $('#dlgNotes').close();
  refreshUI();
  toast('Notes saved');
}

function buildCardRowsMap(list) {
  const rowsMap = new Map(); // rowKey -> Map(person -> card), last card added wins if duplicates
  for (const c of list) {
    const rowKey = c.tag ? '@' + c.tag : (c.label || 'Untitled');
    const person = c.person || 'Unassigned';
    if (!rowsMap.has(rowKey)) rowsMap.set(rowKey, new Map());
    rowsMap.get(rowKey).set(person, c);
  }
  return rowsMap;
}
function renderIdMatrix() {
  const section = $('#idMatrixSection');
  const persons = tableColumns();
  const idCards = cards.filter(c => c.category === 'id');
  const rowsMap = buildCardRowsMap(idCards);
  const rowKeys = [...rowsMap.keys()].sort();
  const thead = `<tr><th>ID type</th>${persons.map(p => `<th${colCls(p)}>${esc(p)}</th>`).join('')}</tr>`;
  const typeRows = rowKeys.map(r => {
    const byPerson = rowsMap.get(r);
    const cells = persons.map(p => {
      const card = byPerson.get(p);
      return card
        ? `<td${colCls(p)}><button type="button" class="matrixtick" data-card-id="${card.id}" aria-label="Open ${esc(r)} for ${esc(p)}">✓</button></td>`
        : `<td${colCls(p)}><span class="na">–</span></td>`;
    }).join('');
    return `<tr><th scope="row">${esc(r)}</th>${cells}</tr>`;
  }).join('');
  section.innerHTML = `<div class="matrixhead">🪪 ID cards by person</div>
    <p class="hint">Tap a ✓ to open that card, or 📝 to edit that person's notes.</p>
    <div class="matrixscroll"><table class="matrix"><thead>${thead}</thead><tbody>${notesRowHTML(persons)}${typeRows}</tbody></table></div>`;
}
function renderBankMatrix() {
  const section = $('#bankMatrixSection');
  const persons = tableColumns();
  const bankCards = cards.filter(c => c.category !== 'id' && c.category !== 'notes');
  if (!bankCards.length) { section.innerHTML = ''; return; }
  const rowsMap = new Map(); // rowKey -> { label, byPerson }
  for (const c of bankCards) {
    const cat = CATS[c.category] || CATS.other;
    const rowKey = c.tag ? '@' + c.tag : (c.label || 'Untitled');
    const rowLabel = `${cat.icon} ${c.tag ? '@' + esc(c.tag) : esc(c.label || 'Untitled')}`;
    const person = c.person || 'Unassigned';
    if (!rowsMap.has(rowKey)) rowsMap.set(rowKey, { label: rowLabel, byPerson: new Map() });
    rowsMap.get(rowKey).byPerson.set(person, c);
  }
  const rowKeys = [...rowsMap.keys()].sort();
  const thead = `<tr><th>Card</th>${persons.map(p => `<th${colCls(p)}>${esc(p)}</th>`).join('')}</tr>`;
  const tbody = rowKeys.map(r => {
    const { label, byPerson } = rowsMap.get(r);
    const cells = persons.map(p => {
      const card = byPerson.get(p);
      return card
        ? `<td${colCls(p)}><button type="button" class="matrixtick" data-card-id="${card.id}" aria-label="Open ${label} for ${esc(p)}">✓</button></td>`
        : `<td${colCls(p)}><span class="na">–</span></td>`;
    }).join('');
    return `<tr><th scope="row">${label}</th>${cells}</tr>`;
  }).join('');
  section.innerHTML = `<div class="matrixhead">💳 Bank cards by person</div>
    <p class="hint">Tap a ✓ to open that card.</p>
    <div class="matrixscroll"><table class="matrix"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}
function renderTables() {
  const empty = $('#tablesEmpty');
  if (!cards.length) {
    empty.hidden = false;
    empty.innerHTML = `<div class="plus">🪪</div><p>No cards yet.</p>
      <div class="modalactions" style="justify-content:center;margin-top:1rem">
        <button class="btn primary" data-action="add-card">+ Add your first card</button>
      </div>`;
    $('#idMatrixSection').innerHTML = ''; $('#bankMatrixSection').innerHTML = '';
    return;
  }
  empty.hidden = true;
  renderIdMatrix();
  renderBankMatrix();
}
function refreshUI() {
  refreshDatalists();
  renderPersonFilterRow();
  renderTables();
}

/* ================= fullscreen viewer ================= */
// A landscape card's front+back stack one below another (uses screen height well); a portrait
// card's sit side by side (uses screen width well) — matches how you'd naturally lay two photos
// out on a table.
function viewerPaneHTML(src, label, side) {
  return `<div class="viewerpane">
    <img src="${src}" alt="">
    <div class="panetools">${label ? `<span class="sidelabel">${esc(label)}</span>` : ''}<button class="sharebtn" data-share="${side}">📤 Share</button></div>
  </div>`;
}
function openViewer(card) {
  currentViewCardId = card.id;
  const cat = CATS[card.category] || CATS.other;
  $('#viewerLabel').textContent = `${cat.icon} ${card.label || 'Untitled'}`;
  const stage = $('#viewerStage');
  const isSide = !!card.imageBack && card.orientation === 'portrait';
  stage.className = 'viewerstage' + (isSide ? ' side' : '');
  let html = viewerPaneHTML(card.image, card.imageBack ? 'Front' : '', 'front');
  if (card.imageBack) html += viewerPaneHTML(card.imageBack, 'Back', 'back');
  stage.innerHTML = html;
  if (card.cardNumber) { $('#viewerNumberRow').hidden = false; $('#viewerNumber').textContent = card.cardNumber; }
  else { $('#viewerNumberRow').hidden = true; }
  const bits = [];
  if (card.person) bits.push('👤 ' + card.person);
  if (card.tag) bits.push('@' + card.tag);
  if (card.note) bits.push(card.note);
  $('#viewerNote').textContent = bits.join(' · ');
  $('#dlgView').showModal();
}
async function copyCardNumber() {
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card || !card.cardNumber) return;
  try { await navigator.clipboard.writeText(card.cardNumber); toast('Copied'); }
  catch (e) { console.warn(e); toast('Could not copy — select the text manually'); }
}
async function shareCardPhoto(isBack) {
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card) return;
  const dataURL = isBack ? card.imageBack : card.image;
  if (!dataURL) return;
  const filename = `${(card.label || 'card').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${isBack ? 'back' : 'front'}.jpg`;
  try {
    const blob = await (await fetch(dataURL)).blob();
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: card.label || 'Card' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.warn('share failed, falling back to download', e);
  }
  const a = document.createElement('a'); a.href = dataURL; a.download = filename; a.click();
}
function updateEditPhotoTiles(card) {
  $('#editFrontImg').innerHTML = `<img src="${card.image}" alt="">`;
  const hasBack = !!card.imageBack;
  $('#editBackImg').innerHTML = hasBack ? `<img src="${card.imageBack}" alt="">` : '<span class="phototile-placeholder">+</span>';
  $('#editBackActionBtn').textContent = hasBack ? '🔄 Retake' : '+ Add back';
  $('#editBackRemoveBtn').hidden = !hasBack;
}
async function removeBackPhoto() {
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card || !card.imageBack) return;
  if (!confirm('Remove the back photo for this card?')) return;
  card.imageBack = null;
  card.updatedAt = Date.now();
  await persistCard(card);
  updateEditPhotoTiles(card);
  refreshUI();
  toast('Back photo removed');
}
function openEditFromViewer() {
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card) return;
  $('#editLabel').value = card.label || '';
  $('#editNote').value = card.note || '';
  $('#editPerson').value = card.person || '';
  $('#editTag').value = card.tag ? '@' + card.tag : '';
  $('#editNumber').value = card.cardNumber || '';
  editCategory = card.category;
  [...$('#editCatPick').children].forEach(b => b.classList.toggle('active', b.dataset.cat === editCategory));
  updateEditPhotoTiles(card);
  $('#dlgView').close();
  $('#dlgEdit').showModal();
}
$('#frmEdit').addEventListener('submit', async e => {
  e.preventDefault();
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card) { $('#dlgEdit').close(); return; }
  try {
    card.label = $('#editLabel').value.trim() || 'Untitled';
    card.note = $('#editNote').value.trim();
    card.person = $('#editPerson').value.trim();
    card.tag = normalizeTag($('#editTag').value);
    card.cardNumber = $('#editNumber').value.trim();
    card.category = editCategory || card.category;
    card.updatedAt = Date.now();
    await persistCard(card);
    $('#dlgEdit').close();
    refreshUI();
    toast('Saved');
  } catch (err) { console.error(err); toast('Could not save — see console for details'); }
});
$('#btnDeleteCard').addEventListener('click', async () => {
  const card = cards.find(c => c.id === currentViewCardId);
  if (!card) return;
  if (!confirm('Delete this card? This cannot be undone.')) return;
  cards = cards.filter(c => c.id !== card.id);
  await cardDelete(card.id);
  deleteCardRemote(card.id);
  $('#dlgEdit').close();
  refreshUI();
  toast('Card deleted');
});
async function persistCard(card) {
  const { id, updatedAt, ...plain } = card;
  const packed = await packCard(plain);
  const rec = { id, updatedAt, ...packed };
  await cardPut(rec);
  pushCardRemote(rec);
}
// Jump from the Edit dialog straight into capture->crop->touchup for one side of an existing card.
function startRetake(cardId, side) {
  wizTarget = { cardId, side };
  $('#dlgEdit').close();
  wizSrcImage = null; wizQuad = null; wizWarped = null;
  $('#sourceTitle').textContent = side === 'front' ? 'Retake front photo' : 'Add / retake back photo';
  $('#sourceHint').textContent = 'This replaces the existing photo for this side.';
  showStep('stepSource');
  $('#dlgAdd').showModal();
}

/* ================= add-card wizard ================= */
function showStep(id) {
  [...$('#wizard').children].forEach(s => s.hidden = s.id !== id);
}
function openAddWizard() {
  wizTarget = { cardId: null, side: 'front' };
  wizSrcImage = null; wizQuad = null; wizWarped = null; wizFinalDataURL = null; wizBackDataURL = null;
  wizFinalOrientation = 'landscape';
  wizOcrText = ''; wizCategory = null; wizUndoStack = [];
  $('#sourceTitle').textContent = 'Add a card';
  $('#sourceHint').textContent = "Photograph an ID, credit/debit card, or balance/passbook page. It's cropped and processed on this device.";
  $('#cardLabel').value = ''; $('#cardNote').value = ''; $('#cardNumber').value = '';
  $('#cardPerson').value = ''; $('#cardTag').value = '';
  $('#detailsErr').textContent = ''; $('#ocrStatus').textContent = '';
  [...$('#catPick').children].forEach(b => b.classList.toggle('active', b.dataset.cat === wizCategory));
  updateWizPhotoTiles();
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

// Fits a box of natural size (iw,ih) within the space actually available on screen — the step's
// own width, and a fraction of the viewport height — so a tall portrait photo can never balloon
// past what's visible (which used to push the Next/Cancel buttons off-screen with no way to
// scroll to them).
function fitStageBox(stepEl, iw, ih, maxHFrac) {
  const availW = stepEl.getBoundingClientRect().width || window.innerWidth;
  const availH = window.innerHeight * maxHFrac;
  const scale = Math.min(availW / iw, availH / ih);
  return { cssW: iw * scale, cssH: ih * scale };
}
function setupCropStage() {
  const iw = wizSrcImage.naturalWidth || wizSrcImage.width, ih = wizSrcImage.naturalHeight || wizSrcImage.height;
  const stage = $('#cropStage');
  requestAnimationFrame(() => {
    const { cssW, cssH } = fitStageBox($('#stepCrop'), iw, ih, 0.42);
    stage.style.width = cssW + 'px'; stage.style.height = cssH + 'px';
    const canvas = $('#cropCanvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cssW, cssH);
    ctx.drawImage(wizSrcImage, 0, 0, iw, ih, 0, 0, cssW, cssH);
    wizFit = { scale: cssW / iw, dx: 0, dy: 0, iw, ih, cssW, cssH };
    const detected = autoDetectQuad(wizSrcImage);
    wizQuad = detected
      ? detected.map(p => ({ x: p.x * wizFit.scale + wizFit.dx, y: p.y * wizFit.scale + wizFit.dy }))
      : defaultInsetQuad(cssW, cssH);
    $('#cropOverlay').setAttribute('viewBox', `0 0 ${cssW} ${cssH}`);
    drawQuadOverlay();
  });
}
function runAutoDetect() {
  if (!wizSrcImage || !wizFit) return;
  const detected = autoDetectQuad(wizSrcImage);
  wizQuad = detected
    ? detected.map(p => ({ x: p.x * wizFit.scale + wizFit.dx, y: p.y * wizFit.scale + wizFit.dy }))
    : defaultInsetQuad(wizFit.cssW, wizFit.cssH);
  drawQuadOverlay();
  if (!detected) toast('Could not detect edges — adjust the corners manually');
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
  const { w, h } = destSizeForQuad(srcPts);
  wizWarped = warpQuadToRect(wizSrcImage, srcPts, w, h);
  showStep('stepTouchup');
  setupTouchStage();
}
function setupTouchStage() {
  const canvas = $('#touchCanvas');
  canvas.width = wizWarped.width; canvas.height = wizWarped.height;
  const stage = canvas.parentElement;
  requestAnimationFrame(() => {
    const { cssW, cssH } = fitStageBox($('#stepTouchup'), wizWarped.width, wizWarped.height, 0.42);
    stage.style.width = cssW + 'px'; stage.style.height = cssH + 'px';
  });
  const ctx = canvas.getContext('2d');
  ctx.drawImage(wizWarped, 0, 0);
  wizUndoStack = [];
  wizBrushUsed = false;
  updateTouchupCTA();
}
function updateTouchupCTA() {
  const btn = document.querySelector('#stepTouchup [data-action="to-details"]');
  if (btn) btn.textContent = wizBrushUsed ? 'Next' : 'Skip';
}
(function wireBrushOnce() {
  const canvas = document.getElementById('touchCanvas');
  canvas.addEventListener('pointerdown', e => {
    painting = true; canvas.setPointerCapture(e.pointerId);
    wizBrushUsed = true; updateTouchupCTA();
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
  if (!wizUndoStack.length) { wizBrushUsed = false; updateTouchupCTA(); }
}

function updateWizPhotoTiles() {
  $('#wizFrontImg').innerHTML = wizFinalDataURL ? `<img src="${wizFinalDataURL}" alt="">` : '';
  const hasBack = !!wizBackDataURL;
  $('#wizBackImg').innerHTML = hasBack ? `<img src="${wizBackDataURL}" alt="">` : '<span class="phototile-placeholder">+</span>';
  $('#wizBackActionBtn').textContent = hasBack ? '🔄 Retake back' : '+ Add back';
  $('#wizBackRemoveBtn').hidden = !hasBack;
}
// Called after the touchup step, for whichever side/target is currently active.
async function finishSide() {
  const dataURL = $('#touchCanvas').toDataURL('image/jpeg', 0.9);
  if (wizTarget.cardId) {
    try {
      const card = cards.find(c => c.id === wizTarget.cardId);
      if (card) {
        if (wizTarget.side === 'front') {
          card.image = dataURL;
          card.orientation = wizWarped.width >= wizWarped.height ? 'landscape' : 'portrait';
        } else card.imageBack = dataURL;
        card.updatedAt = Date.now();
        await persistCard(card);
        refreshUI();
        toast(wizTarget.side === 'front' ? 'Front photo updated' : 'Back photo saved');
      }
    } catch (err) { console.error(err); toast('Could not save that photo'); }
    closeWizard();
    return;
  }
  if (wizTarget.side === 'back') {
    wizBackDataURL = dataURL;
    updateWizPhotoTiles();
    showStep('stepDetails');
    return;
  }
  wizFinalDataURL = dataURL;
  wizFinalOrientation = wizWarped.width >= wizWarped.height ? 'landscape' : 'portrait';
  updateWizPhotoTiles();
  showStep('stepDetails');
  autoOCR();
}
function startAddBack() {
  wizTarget = { cardId: null, side: 'back' };
  wizSrcImage = null; wizQuad = null; wizWarped = null;
  $('#sourceTitle').textContent = 'Add back photo';
  $('#sourceHint').textContent = 'Photograph the back of the same card.';
  showStep('stepSource');
}
function startRetakeFrontInWizard() {
  wizTarget = { cardId: null, side: 'front' };
  wizSrcImage = null; wizQuad = null; wizWarped = null;
  $('#sourceTitle').textContent = 'Retake front photo';
  $('#sourceHint').textContent = 'Retake the front photo for this card.';
  showStep('stepSource');
}

$('#btnSaveCard').addEventListener('click', async () => {
  if (!wizCategory) { $('#detailsErr').textContent = 'Pick a category.'; return; }
  if (!wizFinalDataURL) { $('#detailsErr').textContent = 'Something went wrong with the photo — please retake it.'; return; }
  $('#detailsErr').textContent = '';
  try {
    const label = $('#cardLabel').value.trim() || 'Untitled';
    const note = $('#cardNote').value.trim();
    const person = $('#cardPerson').value.trim();
    const tag = normalizeTag($('#cardTag').value);
    const cardNumber = $('#cardNumber').value.trim();
    const createdAt = new Date().toISOString();
    const plain = {
      label, category: wizCategory, tag, person, cardNumber, note, orientation: wizFinalOrientation,
      image: wizFinalDataURL, imageBack: wizBackDataURL || null, ocrText: wizOcrText || '', createdAt,
    };
    const packed = await packCard(plain);
    const rec = { id: uid(), updatedAt: Date.now(), ...packed };
    await cardPut(rec);
    cards.push({ id: rec.id, updatedAt: rec.updatedAt, ...plain });
    pushCardRemote(rec);
    personFilter = 'all';
    closeWizard();
    refreshUI();
    toast('Card saved');
  } catch (err) {
    console.error('save card failed', err);
    $('#detailsErr').textContent = 'Could not save this card — see console for details.';
    toast('Save failed');
  }
});

/* ================= settings ================= */
function openSettings() {
  $('#fbConfig').value = localStorage.getItem(LS_FB) || '';
  $('#fbStatus').textContent = !vaultEncrypted
    ? 'Sync stays off until your wallet is locked with a passphrase.'
    : (fbase ? 'Connected' : 'Not connected — cards are local-only on this device.');
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
      if (vaultUnlocked && vaultEncrypted) syncCardsWithRemote();
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
function downloadJSON(obj, encrypted) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wallet-backup-${encrypted ? 'encrypted-' : ''}${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('#btnExport').addEventListener('click', async () => {
  if ($('#exportEncrypt').checked) {
    const pass = prompt('Passphrase to encrypt this backup with:');
    if (!pass) return;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pass, salt);
    const enc = await encryptJSON(key, { cards });
    downloadJSON({ walletExport: 1, encrypted: true, salt: b64(salt), iv: enc.iv, ct: enc.ct }, true);
  } else {
    downloadJSON({ walletExport: 1, encrypted: false, cards }, false);
  }
});
$('#btnImport').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    let incoming;
    if (data.encrypted) {
      const pass = prompt('Passphrase this backup was encrypted with:');
      if (!pass) return;
      const key = await deriveKey(pass, unb64(data.salt));
      const decoded = await decryptJSON(key, data);
      incoming = Array.isArray(decoded.cards) ? decoded.cards : [];
    } else {
      incoming = Array.isArray(data.cards) ? data.cards : [];
    }
    for (const c of incoming) {
      const id = uid();
      const plain = {
        label: c.label || 'Untitled', category: CATS[c.category] ? c.category : 'other',
        tag: normalizeTag(c.tag), person: c.person || '', cardNumber: c.cardNumber || '',
        note: c.note || '', orientation: c.orientation === 'portrait' ? 'portrait' : 'landscape',
        image: c.image, imageBack: c.imageBack || null, ocrText: c.ocrText || '',
        createdAt: c.createdAt || new Date().toISOString(),
      };
      const packed = await packCard(plain);
      const rec = { id, updatedAt: Date.now(), ...packed };
      await cardPut(rec);
      cards.push({ id, updatedAt: rec.updatedAt, ...plain });
      pushCardRemote(rec);
    }
    cards.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    $('#dlgSettings').close();
    refreshUI();
    toast(`Imported ${incoming.length} card(s)`);
  } catch (err) { console.warn(err); toast('Could not read that backup file (wrong passphrase?)'); }
});

/* ================= global click delegation ================= */
document.addEventListener('click', e => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) { closeBtn.closest('dialog').close(); return; }

  const editAvatarBtn = e.target.closest('[data-editavatar]');
  if (editAvatarBtn) { openAvatarPicker(editAvatarBtn.dataset.editavatar); return; }

  const emojiBtn = e.target.closest('.emojibtn');
  if (emojiBtn) {
    personAvatars[avatarEditPerson] = emojiBtn.dataset.emoji;
    localStorage.setItem(LS_AVATARS, JSON.stringify(personAvatars));
    $('#dlgAvatar').close();
    renderPersonFilterRow();
    return;
  }

  const personChip = e.target.closest('#personFilterRow .avatarblob');
  if (personChip) { personFilter = personChip.dataset.personfilter; renderPersonFilterRow(); renderTables(); return; }

  const matrixTick = e.target.closest('.matrixtick[data-card-id]');
  if (matrixTick) {
    const card = cards.find(c => c.id === matrixTick.dataset.cardId);
    if (card) openViewer(card);
    return;
  }

  const notesBtn = e.target.closest('.matrixtick[data-notes-person]');
  if (notesBtn) { openNotesEditor(notesBtn.dataset.notesPerson); return; }

  const shareBtn = e.target.closest('.sharebtn');
  if (shareBtn) { shareCardPhoto(shareBtn.dataset.share === 'back'); return; }

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
    case 'lock': onLockButtonClick(); break;
    case 'add-card': openAddWizard(); break;
    case 'cancel-wizard': closeWizard(); break;
    case 'rotate-src': wizSrcImage = rotateImage90(wizSrcImage); setupCropStage(); break;
    case 'auto-detect': runAutoDetect(); break;
    case 'do-warp': doWarp(); break;
    case 'undo-stroke': undoStroke(); break;
    case 'to-details': finishSide(); break;
    case 'add-back': startAddBack(); break;
    case 'remove-back-wiz': wizBackDataURL = null; updateWizPhotoTiles(); break;
    case 'retake-front-wiz': startRetakeFrontInWizard(); break;
    case 'back-touchup': showStep('stepTouchup'); break;
    case 'close-viewer': $('#dlgView').close(); break;
    case 'edit-card': openEditFromViewer(); break;
    case 'copy-number': copyCardNumber(); break;
    case 'retake-front': startRetake(currentViewCardId, 'front'); break;
    case 'retake-back': startRetake(currentViewCardId, 'back'); break;
    case 'remove-back': removeBackPhoto(); break;
    case 'add-note-row': notesEditKV.push({ k: '', v: '' }); renderNotesEditor(); break;
    case 'remove-note-row': {
      const row = actionEl.closest('.noterow');
      notesEditKV.splice(Number(row.dataset.i), 1);
      if (!notesEditKV.length) notesEditKV.push({ k: '', v: '' });
      renderNotesEditor();
      break;
    }
    case 'save-notes': saveNotesEditor(); break;
  }
});

$('#notesRows').addEventListener('input', e => {
  const row = e.target.closest('.noterow'); if (!row) return;
  const i = Number(row.dataset.i);
  if (e.target.classList.contains('notekey')) notesEditKV[i].k = e.target.value;
  else if (e.target.classList.contains('noteval')) notesEditKV[i].v = e.target.value;
});

/* ================= privacy veil (hide thumbnails when backgrounded) ================= */
document.addEventListener('visibilitychange', () => {
  $('#privacyVeil').classList.toggle('show', document.hidden && vaultUnlocked);
});

/* ================= init ================= */
async function init() {
  const cfgStr = localStorage.getItem(LS_FB);
  if (cfgStr) { try { await initFirebase(JSON.parse(cfgStr)); } catch (e) { console.warn(e); syncStatus('Firebase unavailable'); } }

  const encFlag = await metaGet('encrypted');
  vaultEncrypted = !!(encFlag && encFlag.value);

  if (!vaultEncrypted && fbase) {
    // Detect a vault already encrypted on another device before defaulting to plaintext mode here.
    const remoteMeta = await pullMetaRemote();
    if (remoteMeta) {
      await metaPut('salt', { value: remoteMeta.salt });
      await metaPut('canary', { iv: remoteMeta.canaryIv, ct: remoteMeta.canaryCt });
      await metaPut('encrypted', { value: true });
      vaultEncrypted = true;
    }
  }

  if (!vaultEncrypted) {
    await afterUnlock();
    return;
  }

  const session = await loadSession();
  if (session && session.exp > Date.now()) {
    cryptoKey = session.key;
    await afterUnlock();
    return;
  }

  showLockedScreen();
  openVaultDialog(false);
}
init();
