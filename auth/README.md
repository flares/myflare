# auth/ — the site-wide sign-in gate

Every page under `myflare` is closed until Firebase confirms a signed-in account
whose email is on the allowlist. This folder is the only shared code in the repo
— sub-projects are otherwise self-contained, and nothing here reaches into them.

## What it honestly is

This is a **client-side gate on static files**. It stops the site from being
*used* by anyone who isn't signed in: no page renders, no app state loads, no
sub-project UI appears. It does **not** make the files private — `index.html`,
`app.js` and `tyagaraja/data/*.json` are still public URLs that `curl` can fetch
straight off GitHub Pages, gate or no gate.

So:

- **Fine to rely on this for**: keeping the site personal, keeping strangers out
  of the apps, having a single sign-in across all the sub-projects.
- **Do not rely on this for**: hiding anything actually sensitive. Real secrets
  belong behind Firebase security rules — which is exactly where Portfolio
  Tracker and Wallet already put their encrypted blobs. Those two encrypt
  client-side with a passphrase, and that remains the thing protecting them.

If files-must-be-private is the goal, the gate isn't enough; that needs a host
that authenticates requests (Firebase Hosting + Cloud Functions, Cloudflare
Access, Netlify password protection), not GitHub Pages.

## Files

| File | What it does |
|---|---|
| `firebase-config.js` | **The file you edit.** Firebase config + who is allowed in. |
| `core.js` | Config resolution, allowlist matching, SDK loading, offline grace. |
| `guard.js` | The gate itself — imported by every page. |
| `login.js` | Drives `../login.html`. |

## Setup

1. Firebase console → create a project → **Add app → Web**. Copy the config.
2. Authentication → **Sign-in method** → enable **Google**.
3. Authentication → **Settings → Authorized domains** → add the domain the site
   is served from (e.g. `yourname.github.io`). `localhost` is there by default.
4. Paste the config into `FIREBASE_CONFIG` in `firebase-config.js`, and put the
   addresses you want to let in into `ALLOWED_EMAILS`.

Step 4 is skippable for a quick trial: with `FIREBASE_CONFIG` left blank the
login page shows a one-time form that stores the config in `localStorage` for
that browser only. Filling in the file is what makes the gate work everywhere.

A Firebase web config is **not a secret** — it is designed to ship in public
client code, and committing it is the supported thing to do. What protects the
project is the authorized-domains list and the security rules.

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

**Offline grace.** The Firebase SDK loads from a CDN, so with no network there
is no way to re-verify a session — which would hard-lock the two offline PWAs
(Kalpavriksha, Kṛti Kōśam). When, and only when, the SDK is unreachable, the
gate falls back to a record of the last verified sign-in, if it is still on the
allowlist and less than `OFFLINE_GRACE_DAYS` old. Set that to `0` to turn the
behaviour off and fail closed instead.

Both PWAs precache `guard.js`, `core.js` and `firebase-config.js` in their
service workers. Registration scope limits which *pages* a worker controls, not
which URLs it may serve, so `../auth/*` caches fine from `/kalpavriksha/`.

**Removing someone's access.** Take them out of `ALLOWED_EMAILS` and deploy.
They are refused at the next page load on any device that can reach the network.
A device that is *offline* keeps using its cached copy of `firebase-config.js`,
so a stale offline grant can outlive the removal by up to `OFFLINE_GRACE_DAYS`
— it closes as soon as that device comes online, or when the grant expires. If
that window matters, set `OFFLINE_GRACE_DAYS` to `0`.
