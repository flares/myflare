/* auth/core.js — shared Firebase-auth plumbing for every page on the site.
 *
 * Deliberately uses a *named* Firebase app ('myflare-auth'). Portfolio Tracker
 * and Wallet each call initializeApp() with their own pasted config and then
 * signInAnonymously(); if the gate used the default app too, those calls would
 * either throw app/duplicate-app or replace the signed-in user with an
 * anonymous one. A separate named app keeps the two worlds from colliding.
 */

import {
  FIREBASE_CONFIG,
  ALLOWED_EMAILS,
  ALLOWED_DOMAINS,
  OFFLINE_GRACE_DAYS,
} from './firebase-config.js';

const SDK_VERSION = '10.12.5';   // same version the subprojects already pull
const APP_NAME = 'myflare-auth';
const LS_CONFIG = 'myflare.auth.config';
const LS_GRANT = 'myflare.auth.lastgrant';

/* Resolved against this module's own URL, so the site works from a repo
 * subpath (GitHub Pages project sites) as well as from a domain root. */
export const LOGIN_URL = new URL('../login.html', import.meta.url).href;
export const HOME_URL = new URL('../index.html', import.meta.url).href;

/* ---------------- config ---------------- */

/* authDomain is what Google sign-in redirects through; apiKey identifies the
 * project. Everything else is optional as far as auth is concerned. */
function usable(cfg) {
  return !!(cfg && typeof cfg === 'object' && cfg.apiKey && cfg.authDomain);
}

export function getConfig() {
  if (usable(FIREBASE_CONFIG)) return FIREBASE_CONFIG;
  try {
    const cached = JSON.parse(localStorage.getItem(LS_CONFIG) || 'null');
    if (usable(cached)) return cached;
  } catch { /* corrupt entry — treat as absent */ }
  return null;
}

/* True when the config file itself is filled in, i.e. the browser-local
 * fallback is not in play. Used by the login page to decide what to offer. */
export function configIsCommitted() {
  return usable(FIREBASE_CONFIG);
}

export function saveConfig(cfg) {
  if (!usable(cfg)) throw new Error('Config needs at least apiKey and authDomain.');
  localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
}

export function clearConfig() {
  try { localStorage.removeItem(LS_CONFIG); } catch { /* nothing to clear */ }
}

/* ---------------- allowlist ---------------- */

const norm = (s) => String(s || '').trim().toLowerCase();

export function isAllowed(email) {
  const e = norm(email);
  if (!e) return false;

  const emails = ALLOWED_EMAILS.map(norm).filter(Boolean);
  const domains = ALLOWED_DOMAINS.map((d) => norm(d).replace(/^@/, '')).filter(Boolean);

  // An empty allowlist means "any account that can sign in", which is a much
  // weaker gate — but it is an explicit choice, not an accident.
  if (!emails.length && !domains.length) return true;

  if (emails.includes(e)) return true;
  return domains.some((d) => e.endsWith('@' + d));
}

/* ---------------- SDK / auth instance ---------------- */

let sdkPromise = null;

export function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
    ]).then(([appMod, authMod]) => ({ appMod, authMod }))
      .catch((err) => { sdkPromise = null; throw err; });   // let a retry work
  }
  return sdkPromise;
}

let authPromise = null;

export function getAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      const cfg = getConfig();
      if (!cfg) throw Object.assign(new Error('Firebase is not configured.'), { code: 'myflare/no-config' });
      const { appMod, authMod } = await loadSdk();
      const app = appMod.getApps().find((a) => a.name === APP_NAME)
        || appMod.initializeApp(cfg, APP_NAME);
      return { auth: authMod.getAuth(app), authMod };
    })().catch((err) => { authPromise = null; throw err; });
  }
  return authPromise;
}

/* Resolves with the first auth state Firebase reports — the restored session
 * if there is one, or null once it is sure there isn't. */
export function firstAuthState(auth, authMod) {
  return new Promise((resolve, reject) => {
    const stop = authMod.onAuthStateChanged(
      auth,
      (user) => { stop(); resolve(user); },
      (err) => { stop(); reject(err); },
    );
  });
}

/* ---------------- offline grace ---------------- */

export function rememberGrant(email) {
  try {
    localStorage.setItem(LS_GRANT, JSON.stringify({ email: norm(email), at: Date.now() }));
  } catch { /* private mode — offline grace simply won't be available */ }
}

export function forgetGrant() {
  try { localStorage.removeItem(LS_GRANT); } catch { /* nothing to clear */ }
}

/* A previously-verified, still-allow-listed, still-fresh session, or null.
 * Only consulted when the SDK itself could not be reached. */
export function graceGrant() {
  if (!(OFFLINE_GRACE_DAYS > 0)) return null;
  try {
    const rec = JSON.parse(localStorage.getItem(LS_GRANT) || 'null');
    if (!rec || !isAllowed(rec.email)) return null;
    if (!(Date.now() - rec.at < OFFLINE_GRACE_DAYS * 86400000)) return null;
    return rec;
  } catch {
    return null;
  }
}

/* ---------------- navigation helpers ---------------- */

/* Never hand a redirect target we didn't originate — an attacker-supplied
 * ?next= pointing off-site would turn the login page into an open redirect. */
export function safeNext(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin) return null;
    if (url.href.replace(/#.*$/, '') === LOGIN_URL.replace(/#.*$/, '')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function loginUrlFor(params) {
  const url = new URL(LOGIN_URL);
  for (const [k, v] of Object.entries(params || {})) {
    if (v) url.searchParams.set(k, v);
  }
  return url.href;
}

export async function signOutEverywhere() {
  forgetGrant();
  try {
    const { auth, authMod } = await getAuth();
    await authMod.signOut(auth);
  } catch { /* already gone, or offline — the local grant is cleared regardless */ }
}
