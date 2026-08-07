/* auth/login.js — drives login.html: setup, Google sign-in, allowlist verdict. */

import {
  getConfig,
  configIsCommitted,
  saveConfig,
  clearConfig,
  getAuth,
  firstAuthState,
  authorize,
  rememberGrant,
  forgetGrant,
  safeNext,
  HOME_URL,
} from './core.js';

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const next = safeNext(params.get('next')) || HOME_URL;

const views = {
  busy: $('view-busy'),
  setup: $('view-setup'),
  signin: $('view-signin'),
  error: $('view-error'),
};

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
}

function note(text, kind) {
  const el = $('note');
  el.textContent = text || '';
  el.hidden = !text;
  el.className = 'note' + (kind ? ' ' + kind : '');
}

function fail(message) {
  $('error-detail').textContent = message;
  show('error');
}

/* ---------------- setup (only when the config file is blank) ---------------- */

function wireSetup() {
  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('setup-json').value.trim();
    if (!raw) return;

    // Accept a bare object literal pasted straight out of the Firebase console
    // ("const firebaseConfig = { ... };"), not just strict JSON.
    let cfg;
    try {
      const body = raw.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      cfg = JSON.parse(body);
    } catch {
      try {
        const body = raw.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
        // eslint-disable-next-line no-new-func
        cfg = Function('"use strict";return (' + body + ')')();
      } catch {
        $('setup-error').textContent = 'That didn’t parse as a Firebase config object.';
        $('setup-error').hidden = false;
        return;
      }
    }

    try {
      saveConfig(cfg);
    } catch (err) {
      $('setup-error').textContent = err.message;
      $('setup-error').hidden = false;
      return;
    }
    location.replace(location.pathname + (params.get('next') ? '?next=' + encodeURIComponent(params.get('next')) : ''));
  });

  $('setup-clear').addEventListener('click', () => {
    clearConfig();
    location.reload();
  });
}

/* ---------------- sign-in ---------------- */

let authCtx = null;

async function signIn() {
  const btn = $('google-btn');
  btn.disabled = true;
  note('');

  try {
    const { auth, authMod } = authCtx;
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    let cred;
    try {
      cred = await authMod.signInWithPopup(auth, provider);
    } catch (err) {
      const code = err && err.code;
      // Popups are blocked or unavailable (in-app browsers, some iOS setups) —
      // fall back to the full-page redirect flow, which resumes on reload.
      if (code === 'auth/popup-blocked'
        || code === 'auth/operation-not-supported-in-this-environment'
        || code === 'auth/popup-closed-by-user'
        || code === 'auth/cancelled-popup-request') {
        if (code === 'auth/popup-closed-by-user') {
          note('Sign-in was cancelled.', 'warn');
          btn.disabled = false;
          return;
        }
        await authMod.signInWithRedirect(auth, provider);
        return;
      }
      throw err;
    }

    await settle(cred.user);
  } catch (err) {
    btn.disabled = false;
    note(describe(err), 'warn');
  }
}

function describe(err) {
  const code = err && err.code;
  if (code === 'auth/unauthorized-domain') {
    return `${location.hostname} isn’t in the Firebase project’s authorized domains. Add it under Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in isn’t enabled for this Firebase project. Turn it on under Authentication → Sign-in method.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error reaching Firebase. Check your connection and try again.';
  }
  if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid') {
    return 'That Firebase API key isn’t valid for this project.';
  }
  return (err && err.message) || 'Sign-in failed.';
}

function refusal(reason, email) {
  const who = email || 'That account';
  switch (reason) {
    case 'not-google':
      return 'This site only accepts Google sign-in.';
    case 'unverified':
      return `${who} has no verified email address.`;
    case 'no-email':
      return 'That sign-in carried no email address.';
    default:
      return `${who} isn’t on the allowlist for this site.`;
  }
}

/* Decide what a signed-in user gets: in, or bounced with a reason. */
async function settle(user) {
  if (!user) {
    show('signin');
    $('google-btn').disabled = false;
    return false;
  }

  const verdict = await authorize(user);

  if (verdict.ok) {
    rememberGrant(user.email);
    location.replace(next);
    return true;
  }

  // Couldn't reach the allowlist — say so rather than blaming the account, and
  // leave the session alone so a retry doesn't need a fresh sign-in.
  if (verdict.reason === 'backend') {
    show('signin');
    $('google-btn').disabled = false;
    note('Signed in, but the allowlist in Firestore couldn’t be read. Check your '
      + 'connection — if this persists, the Firestore database or its rules may not be set up yet.', 'warn');
    return false;
  }

  forgetGrant();
  try { await authCtx.authMod.signOut(authCtx.auth); } catch { /* best effort */ }
  show('signin');
  $('google-btn').disabled = false;
  note(refusal(verdict.reason, user.email), 'deny');
  return false;
}

/* ---------------- boot ---------------- */

async function boot() {
  wireSetup();
  $('google-btn').addEventListener('click', signIn);

  if (!getConfig()) {
    $('setup-committed').hidden = configIsCommitted();
    show('setup');
    return;
  }

  $('setup-clear').hidden = configIsCommitted();

  try {
    authCtx = await getAuth();
  } catch (err) {
    fail(describe(err));
    return;
  }

  // Coming back from signInWithRedirect, this carries the result.
  try {
    const redirected = await authCtx.authMod.getRedirectResult(authCtx.auth);
    if (redirected && redirected.user) {
      if (await settle(redirected.user)) return;
      return;
    }
  } catch (err) {
    note(describe(err), 'warn');
  }

  let user = null;
  try {
    user = await firstAuthState(authCtx.auth, authCtx.authMod);
  } catch (err) {
    fail(describe(err));
    return;
  }

  // Landed here from an explicit sign-out, or from the guard rejecting an
  // account: don't silently bounce them straight back in.
  if (params.has('bye')) {
    show('signin');
    note('You’re signed out.', 'ok');
    return;
  }

  if (params.has('denied')) {
    const who = params.get('denied');
    show('signin');
    note(refusal(params.get('why'), who && who !== '1' ? who : null), 'deny');
    return;
  }

  await settle(user);
}

boot().catch((err) => fail((err && err.message) || String(err)));
