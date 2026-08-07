/* auth/guard.js — drop this on every page. Nothing renders until Firebase
 * confirms a signed-in, allow-listed user.
 *
 * Usage, in <head>, before anything else:
 *
 *   <style>html:not(.auth-ok) body{visibility:hidden}</style>
 *   <script type="module" src="../auth/guard.js"></script>
 *
 * The style is the fail-closed half: if the module 404s, never runs, or throws,
 * .auth-ok is never added and the page stays blank. The module only ever
 * *removes* the block.
 *
 * Scope, stated plainly: this is a client-side gate on static files. It keeps
 * the site's pages from being *used* by anyone who isn't signed in, but the
 * HTML/JS/JSON are still public URLs that curl can fetch. Anything that must
 * actually stay private belongs behind Firebase security rules (which is where
 * Portfolio Tracker and Wallet already put their encrypted blobs), not behind
 * this gate.
 */

import {
  getConfig,
  getAuth,
  firstAuthState,
  authorize,
  rememberGrant,
  forgetGrant,
  graceGrant,
  loginUrlFor,
  signOutEverywhere,
  HOME_URL,
} from './core.js';

const root = document.documentElement;

/* ---------------- the curtain ---------------- */

const OVERLAY_ID = 'myflare-auth-overlay';

function paintOverlay(title, detail, action) {
  let el = document.getElementById(OVERLAY_ID);
  if (!el) {
    const style = document.createElement('style');
    style.textContent = `
      #${OVERLAY_ID} {
        visibility: visible;
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: .6rem; padding: 2rem 1.5rem; text-align: center;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        background: #f9f9f7; color: #0b0b0b;
      }
      #${OVERLAY_ID} strong { font-size: 1rem; font-weight: 600; }
      #${OVERLAY_ID} span { font-size: .85rem; color: #52514e; max-width: 32ch; line-height: 1.5; }
      #${OVERLAY_ID} button {
        font: inherit; font-size: .85rem; font-weight: 600;
        margin-top: .4rem; padding: .5rem 1.1rem;
        color: #fff; background: #2a78d6;
        border: 0; border-radius: 999px; cursor: pointer;
      }
      @media (prefers-color-scheme: dark) {
        #${OVERLAY_ID} { background: #0d0d0d; color: #fff; }
        #${OVERLAY_ID} span { color: #c3c2b7; }
        #${OVERLAY_ID} button { background: #3987e5; }
      }
    `;
    document.head.appendChild(style);

    el = document.createElement('div');
    el.id = OVERLAY_ID;
    (document.body || root).appendChild(el);
  }

  el.textContent = '';
  const t = document.createElement('strong');
  t.textContent = title;
  el.appendChild(t);
  if (detail) {
    const d = document.createElement('span');
    d.textContent = detail;
    el.appendChild(d);
  }
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', action.onClick);
    el.appendChild(b);
  }
  return el;
}

/* The overlay can only be appended once <body> exists. */
function whenBody() {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

async function showChecking() {
  await whenBody();
  paintOverlay('Checking sign-in…', null, null);
}

function unlock() {
  document.getElementById(OVERLAY_ID)?.remove();
  root.classList.add('auth-ok');
}

function goToLogin(params) {
  location.replace(loginUrlFor({ next: location.href, ...params }));
}

/* ---------------- the gate ---------------- */

async function gate() {
  // Slow paths get a curtain; a warm session usually resolves before this
  // lands, so there's no flash of "Checking…" in the common case.
  const checking = setTimeout(() => { showChecking(); }, 150);

  try {
    if (!getConfig()) {
      goToLogin({ setup: '1' });
      return await never();
    }

    let auth, authMod;
    try {
      ({ auth, authMod } = await getAuth());
    } catch (err) {
      // Couldn't reach the CDN / Firebase. Fall back to a recent verified
      // session so the offline PWAs keep working, otherwise fail closed.
      const grant = graceGrant();
      if (grant) {
        clearTimeout(checking);
        unlock();
        return { user: { email: grant.email, offline: true }, offline: true, signOut: doSignOut };
      }
      clearTimeout(checking);
      await whenBody();
      paintOverlay(
        'Can’t verify sign-in',
        'This page needs to reach Firebase once before it will open. Check your connection and try again.',
        { label: 'Retry', onClick: () => location.reload() },
      );
      throw err;
    }

    const user = await firstAuthState(auth, authMod);

    if (!user) {
      clearTimeout(checking);
      forgetGrant();
      goToLogin({});
      return await never();
    }

    const verdict = await authorize(user);

    if (!verdict.ok) {
      clearTimeout(checking);

      // Couldn't reach the allowlist at all. That's a failure to verify, not a
      // refusal — don't sign the user out over a network blip, and don't let
      // them in either.
      if (verdict.reason === 'backend') {
        await whenBody();
        paintOverlay(
          'Can’t check access right now',
          'Signed in, but the allowlist in Firestore couldn’t be read. Check your connection — if this persists, the Firestore database or its rules may not be set up yet.',
          { label: 'Retry', onClick: () => location.reload() },
        );
        throw verdict.error || new Error('allowlist unreachable');
      }

      const denied = user.email || '';
      await signOutEverywhere();
      location.replace(loginUrlFor({ denied: denied || '1', why: verdict.reason }));
      return await never();
    }

    rememberGrant(user.email);
    clearTimeout(checking);
    unlock();
    return { user, offline: false, signOut: doSignOut };
  } catch (err) {
    clearTimeout(checking);
    throw err;
  }
}

async function doSignOut() {
  await signOutEverywhere();
  location.replace(loginUrlFor({ bye: '1' }));
  return never();
}

/* A redirect is in flight; resolving authReady now would let page code run
 * against a page that is about to be replaced. */
function never() {
  return new Promise(() => {});
}

/* Pages that want the signed-in user (e.g. the home page's logout chip) can
 * `import { authReady } from './auth/guard.js'` — module caching means they
 * get this same run, not a second one. */
export const authReady = gate();

/* Don't let an unhandled rejection spam the console on the redirect paths. */
authReady.catch(() => {});

export { doSignOut as signOut, HOME_URL };
