/* auth/firebase-config.js — the two things you edit to control site access.
 *
 * 1. FIREBASE_CONFIG — your Firebase web-app config.
 * 2. ALLOWED_EMAILS / ALLOWED_DOMAINS — who is let in.
 *
 * A Firebase *web* config is not a secret. It is designed to ship in public
 * client code, and committing it here is the normal, supported thing to do.
 * What actually protects a Firebase project is the Authorized-domains list and
 * the Firestore/Storage security rules — not the secrecy of these strings.
 *
 * If you leave FIREBASE_CONFIG blank, the login page falls back to a one-time
 * in-browser setup form and keeps the config in localStorage for that browser
 * only. Filling it in here is what makes the gate work on every device.
 */

export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',          // e.g. 'myflare-xxxxx.firebaseapp.com'
  projectId: '',
  appId: '',               // optional for auth, but harmless to include
  storageBucket: '',       // optional
  messagingSenderId: '',   // optional
};

/* Exact addresses allowed in. Case-insensitive. */
export const ALLOWED_EMAILS = [
  'y.manojkrishna@gmail.com',
];

/* Whole domains allowed in, e.g. 'example.com' lets in anyone @example.com. */
export const ALLOWED_DOMAINS = [];

/* How long a previously-approved browser may open pages while offline.
 * The Firebase SDK is loaded from a CDN, so with no network there is no way to
 * re-verify the session — this keeps the offline PWAs (Kalpavriksha, Kṛti
 * Kōśam) usable instead of hard-locking them. Set to 0 to disable. */
export const OFFLINE_GRACE_DAYS = 14;
