# auth/ — the site-wide sign-in gate

Every page under `myflare` is closed until Firebase confirms a signed-in account
whose email is on the allowlist. This folder is the only shared code in the repo
— sub-projects are otherwise self-contained, and nothing here reaches into them.

The project is **myflare-b6701**. The allowlist lives in Firestore, so access is
managed from the Firebase console — no code change, no deploy.

## Who gets in

Two things have to be true, and the second is the one that counts:

1. **The gate lets the page render.** `guard.js` checks the signed-in account
   and unhides the page. Client-side, so bypassable by anyone willing to open
   devtools — this controls what is *shown*, not what is *reachable*.
2. **Firestore agrees.** The gate asks Firestore for `allowlist/<your-email>`.
   The rules in [`../firestore.rules`](../firestore.rules) let a signed-in
   account read exactly one document — the one named after its own verified
   address. No document, no entry. That check runs on Google's servers and
   holds regardless of what the browser does.

Point 2 is what makes this real rather than decorative, and it is why
`ACCESS_MODE` defaults to `'firestore'`.

### Managing access

Firebase console → **Firestore Database → Data → `allowlist`**.

- **Grant**: add a document whose **ID is the lowercased email address**. The
  contents don't matter; an empty document is fine.
- **Revoke**: delete that document, or set a field `disabled` (boolean) to
  `true` if you'd rather keep the row around.

Changes take effect on the next page load. No deploy.

Nobody can enumerate the list — the rules only ever let you read your own
entry, so an allow-listed user can't discover who else has access, and an
outsider can't probe for valid addresses.

## What this does and doesn't protect

The **static files are still public**. `index.html`, `app.js` and
`tyagaraja/data/*.json` are fetchable by `curl` straight off GitHub Pages, gate
or no gate. What the gate protects is *use of the site*; what the rules protect
is *data in Firestore*.

There is also a precise sense in which "only I can log in" isn't quite what's
happening. With Google sign-in enabled on the project, anyone can complete a
Google sign-in and get a Firebase session — they just get refused immediately
afterwards, signed out, and can read nothing. If you want them stopped at the
door instead, see **Blocking sign-in outright** below.

If files-must-be-private is the goal, no client-side gate is enough; that needs
a host that authenticates requests (Firebase Hosting + Cloud Functions,
Cloudflare Access, Netlify password protection), not GitHub Pages.

## Files

| File | What it does |
|---|---|
| `firebase-config.js` | **The file you edit.** Project config + `ACCESS_MODE`. |
| `core.js` | Config, the `authorize()` verdict, SDK loading, offline grace. |
| `guard.js` | The gate itself — imported by every page. |
| `login.js` | Drives `../login.html`. |
| `../firestore.rules` | The rules to publish. **This is the enforcement.** |

## Setup checklist

The config is already committed. What's left is console-side:

1. **Authentication → Sign-in method** → enable **Google**.
2. **Authentication → Settings → Authorized domains** → add the domain the site
   is served from (e.g. `yourname.github.io`). `localhost` is there by default.
   Sign-in fails with `auth/unauthorized-domain` until this is done.
3. **Firestore Database** → create a database if there isn't one.
4. **Firestore → Data** → create collection `allowlist`, add a document with ID
   `y.manojkrishna@gmail.com` (empty is fine).
5. **Firestore → Rules** → paste [`../firestore.rules`](../firestore.rules) →
   Publish.
6. Optional but worth it: **Google Cloud console → APIs & Services →
   Credentials** → restrict the browser API key to your domains (HTTP
   referrers). It limits who can burn your quota; it is not an access control.

Skip step 3–5 and the gate fails closed with "Can't check access right now" —
signed in, but unable to read the allowlist. That's deliberate: an unreachable
allowlist is a failure to verify, never an approval.

A Firebase web config is **not a secret** — it is designed to ship in public
client code, and committing it is the supported thing to do. What protects the
project is the authorized-domains list and the security rules.

## Blocking sign-in outright (optional, needs the Blaze plan)

The allowlist refuses people *after* Google hands them a session. To refuse
before a session is ever issued, add a blocking function — this needs the Blaze
(pay-as-you-go) plan and the Firebase CLI, and it is the only way to stop
strangers from appearing in your Authentication → Users list at all.

```js
// functions/index.js
const { beforeUserSignedIn } = require('firebase-functions/v2/identity');
const { getFirestore } = require('firebase-admin/firestore');
require('firebase-admin/app').initializeApp();

exports.gate = beforeUserSignedIn(async (event) => {
  const email = (event.data.email || '').toLowerCase();
  const doc = await getFirestore().doc(`allowlist/${email}`).get();
  if (!doc.exists || doc.data().disabled === true) {
    throw new (require('firebase-functions/v2/identity').HttpsError)(
      'permission-denied', 'Not on the allowlist.');
  }
});
```

Then Authentication → Settings → **Blocking functions** → set *Before sign-in*.
The same `allowlist` collection drives it, so there's still one place to manage.

## Falling back to an in-repo list

Set `ACCESS_MODE = 'local'` in `firebase-config.js` and the gate uses
`ALLOWED_EMAILS` / `ALLOWED_DOMAINS` from that file instead, with no Firestore
involved. Useful if you'd rather not run a database, but understand the
trade-off: that check is client-side only, so it decides what renders and
nothing more. Changing who has access then means editing the file and deploying.

## Putting the gate on a new page

Two lines in `<head>`, before `</head>`:

```html
<style>html:not(.auth-ok) body{visibility:hidden}</style>
<script type="module" src="../auth/guard.js"></script>
```

Adjust `../` for depth (`auth/…` at the repo root, `../../auth/…` two levels
down). The `<style>` is the fail-closed half: if the module 404s or throws,
`.auth-ok` never lands and the page stays blank. The module only ever *removes*
the block, so there is no way for a broken script to accidentally open a page.

To read the signed-in user, import the same module — module caching means you
get the run the `<head>` tag already started, not a second auth check:

```js
import { authReady } from './auth/guard.js';
const { user, offline, signOut } = await authReady;
```

`authReady` deliberately never resolves on the paths that end in a redirect, so
page code can't briefly run for a user who is about to be bounced.

## Design notes

**Named Firebase app.** The gate initializes `initializeApp(config, 'myflare-auth')`
rather than the default app. Portfolio Tracker and Wallet each call
`initializeApp()` with their own pasted config and then `signInAnonymously()`;
sharing the default app would either throw `app/duplicate-app` or swap the
signed-in user for an anonymous one. The named app keeps the two apart, and
those sub-projects needed no changes.

**Unreachable ≠ approved.** `authorize()` distinguishes "Firestore says no"
from "couldn't ask Firestore". A refusal signs the user out and sends them to
the login page with a reason. A failure to reach the allowlist leaves the
session alone and shows a retry — the page stays hidden either way. A network
blip should not cost you your session, and it must never be mistaken for a yes.

**Offline grace.** The Firebase SDK loads from a CDN, so with no network there
is no way to re-verify anything — which would hard-lock the two offline PWAs
(Kalpavriksha, Kṛti Kōśam). When, and only when, the SDK itself is unreachable,
the gate falls back to a record of the last verified sign-in, if it is less than
`OFFLINE_GRACE_DAYS` old.

Be clear about what this costs: offline, the Firestore allowlist cannot be
consulted, so a revoked account keeps working on a device that stays offline
until its grant ages out — up to `OFFLINE_GRACE_DAYS`. It closes the moment that
device reconnects. Set `OFFLINE_GRACE_DAYS = 0` to drop the grace entirely and
fail closed offline, at the cost of the two PWAs no longer opening on a plane.

Both PWAs precache `guard.js`, `core.js` and `firebase-config.js` in their
service workers. Registration scope limits which *pages* a worker controls, not
which URLs it may serve, so `../auth/*` caches fine from `/kalpavriksha/`.

**Revoking access.** Delete the person's document from `allowlist` (or set
`disabled: true`). They are refused at the next page load on any online device,
and Firestore stops serving them data immediately regardless of what their
browser believes. The offline caveat above is the one exception.
