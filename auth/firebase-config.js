/* auth/firebase-config.js — which Firebase project the gate uses, and where the
 * list of allowed accounts lives.
 *
 * A Firebase *web* config is not a secret. It is designed to ship in public
 * client code, and committing it is the normal, supported thing to do. What
 * protects the project is the Authorized-domains list, the API-key referrer
 * restriction, and the Firestore security rules — not the secrecy of these
 * strings. See ../firestore.rules and auth/README.md.
 */

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC3sVI2pCm0zL1Ub0zQvNxEFmNTVV7t8js',
  authDomain: 'myflare-b6701.firebaseapp.com',
  projectId: 'myflare-b6701',
  storageBucket: 'myflare-b6701.firebasestorage.app',
  messagingSenderId: '423722364541',
  appId: '1:423722364541:web:dae43b9f9ebc56a58dcb14',
};

/* Where the allowlist lives.
 *
 *   'firestore' — the allowlist is the `allowlist` collection in Firestore, and
 *                 you manage it from the Firebase console. Security rules make
 *                 it the real authority: a browser that fakes its way past the
 *                 client check still cannot read a document it isn't listed
 *                 for. ALLOWED_EMAILS below is ignored in this mode.
 *
 *   'local'     — the allowlist is ALLOWED_EMAILS / ALLOWED_DOMAINS below, and
 *                 changing it means editing this file and deploying. No
 *                 Firestore needed. Convenient, but the check is client-side
 *                 only and therefore bypassable.
 */
export const ACCESS_MODE = 'firestore';

/* The Firestore collection holding one document per allowed account, keyed by
 * lowercased email address. Only read in 'firestore' mode. */
export const ALLOWLIST_COLLECTION = 'allowlist';

/* Only used when ACCESS_MODE is 'local'. */
export const ALLOWED_EMAILS = [
  'y.manojkrishna@gmail.com',
];

/* Whole domains, e.g. 'example.com'. Only used when ACCESS_MODE is 'local'. */
export const ALLOWED_DOMAINS = [];

/* Sign-in must have gone through Google, not any other provider that might get
 * enabled on the project later (email/password, anonymous, …). */
export const REQUIRE_GOOGLE = true;

/* How long a previously-approved browser may open pages while offline.
 * The Firebase SDK is loaded from a CDN, so with no network there is no way to
 * re-verify the session — this keeps the offline PWAs (Kalpavriksha, Kṛti
 * Kōśam) usable instead of hard-locking them. Set to 0 to disable. */
export const OFFLINE_GRACE_DAYS = 14;
