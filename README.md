# myflare

Personal web interface — a hub page (`index.html`) linking to individual sub-projects, each living in its own subfolder.

## Access

The site is private: every page is gated behind Firebase Google sign-in
(project `myflare-b6701`), and only allow-listed accounts get in. Anyone else
lands on [`login.html`](login.html). The **Sign out** button is in the
home-page header.

**The allowlist lives in Firestore**, so access is managed from the Firebase
console — no code change, no deploy. Add a document to the `allowlist`
collection whose ID is the lowercased email address to grant access; delete it
(or set `disabled: true`) to revoke. The rules in
[`firestore.rules`](firestore.rules) are what actually enforce this: they let a
signed-in account read exactly one document, the one named after its own
verified address.

Setup steps and an honest account of what the gate does and doesn't protect are
in [`auth/README.md`](auth/README.md). Short version: it keeps the site from
being *used* by strangers and keeps Firestore data unreadable to them, but the
static files are still public URLs on GitHub Pages.

## Sub-projects

| Sub-project | Folder | Status |
|---|---|---|
| Portfolio Tracker | [`portfolio-tracker/`](portfolio-tracker/) | Live — encrypted MF portfolio tracker; see [`portfolio-tracker/README.md`](portfolio-tracker/README.md) |
| Padyaalu | [`padyaalu/`](padyaalu/) | Working reading app with seed corpus — see [`padyaalu/README.md`](padyaalu/README.md) |
| Forest Friends | [`forest-friends/`](forest-friends/) | Voice-controlled kids' animal game (English & Telugu) — see [`forest-friends/README.md`](forest-friends/README.md) |
| Parayana Tracker | [`parayana/`](parayana/) | Lalitha Sahasranama Parayana tally — see [`parayana/README.md`](parayana/README.md) |
| Wallet | [`wallet/`](wallet/) | Encrypted digital cardholder — capture, crop & store ID/credit/debit cards as images — see [`wallet/README.md`](wallet/README.md) |
| Kalpavriksha | [`kalpavriksha/`](kalpavriksha/) | Tap-to-grow tree PWA, one leaf and one “Sri Rama” per tap — see [`kalpavriksha/README.md`](kalpavriksha/README.md) |
| Paper Football | [`paper-football/`](paper-football/) | Two-player landscape pitch game with drafted movement cards — see [`paper-football/README.md`](paper-football/README.md) |
| Kṛti Kōśam | [`tyagaraja/`](tyagaraja/) | Versioned Tyāgarāja kṛti dataset + schema validation in CI, with a study app over it — see [`tyagaraja/README.md`](tyagaraja/README.md) |

## Todo / planning

New ideas are logged on the [todo board](todo/index.html) (linked from the home
page) and go through a planning phase — tracked in [`todo/`](todo/) — before
being promoted into their own sub-project folder above. See
[`todo/README.md`](todo/README.md) for the workflow.

## Structure

```
index.html              ← main hub page with links to sub-projects, incl. Todo
login.html              ← Google sign-in / first-run Firebase setup
firestore.rules         ← the security rules that actually enforce the allowlist
auth/
  README.md             ← setup steps, scope of the gate & design notes
  firebase-config.js    ← project config + ACCESS_MODE
  core.js               ← config, the authorize() verdict, SDK, offline grace
  guard.js              ← the gate; imported by every page
  login.js              ← drives login.html
todo/
  README.md             ← idea → planning → promotion workflow
  index.html            ← todo/status board
  notes/                ← one planning note per idea (pre-promotion)
portfolio-tracker/
  README.md             ← project spec, feature list & Firebase setup
  index.html            ← the app (static, GitHub Pages friendly)
  app.js  styles.css    ← app logic & styles
  mockups/              ← UI samples reviewed before building
padyaalu/
  README.md             ← project spec & requirements
  index.html            ← full-page-card reading app
  settings.html         ← live status, goals & pending-task roadmap
  chandassu.js          ← prosody engine (browser + Node)
  verify.cjs            ← scansion verifier for the corpus
  data/                 ← poem text + Telugu meanings, one JSON per satakam
forest-friends/
  README.md             ← project spec & design notes
  index.html            ← the forest scene, controls & letter index
  styles.css            ← CSS forest, animal animations
  animals.js            ← animal dataset (emoji, Telugu names, aliases, sound)
  audio.js              ← Web Audio synthesized sounds + background music
  game.js               ← voice recognition, command parsing, game core
parayana/
  README.md             ← project spec & config notes
  index.html            ← calendar markup + sticky total bar
  app.js                ← calendar generation, tap/long-press, localStorage persistence
  styles.css            ← mobile-first styling, green shading scale
wallet/
  README.md             ← project spec & design notes
  index.html            ← deck view, add-card wizard, viewer, dialogs
  app.js                ← crypto, storage, perspective-crop warp, deck logic
  styles.css            ← cardholder deck, crop/brush stages, dialogs
kalpavriksha/
  README.md             ← project spec & the scaling design notes
  index.html            ← canvas, the one button, details dialog
  styles.css            ← mobile-first light/dark, button & dialog chrome
  tree.js               ← procedural skeleton: count → structure → leaf slots
  render.js             ← camera, wind, branches, foliage, atmosphere
  audio.js              ← chant playback (file if present, else synthesized)
  store.js              ← debounced localStorage tally, per-day counts
  app.js                ← tap → leaf → sound → tally; dialog & copy
  sw.js  manifest.webmanifest  icons/   ← PWA shell
  audio/                ← drop sri-rama.mp3 here
paper-football/
  README.md             ← rules, card deck & design brief (read before any change)
  index.html            ← start / draft / game screens + pitch SVG shell
  styles.css            ← layout, pitch chrome, cards, overlays, dark mode
  cards.js              ← 12-card movement deck & card mini-grid renderer
  board.js              ← pitch, goals & lattice drawing, ball flight, trail
  game.js               ← state machine, legal moves, win detection
tyagaraja/
  README.md             ← dataset spec, schema/versioning rules & coverage caveats
  index.html            ← topbar, filter rail, four views, detail panel
  styles.css            ← dense mobile-first light/dark, cards, swara chips
  app.js                ← filter/sort/render, study state, import & export
  validate.mjs          ← zero-dep schema + Carnatic-theory validator
  renumber.mjs          ← alphabetical catalog numbering
  data/                 ← manifest + kritis, ragas, talas, groups
  schema/               ← JSON Schema 2020-12 for each data file
.github/workflows/
  tyagaraja-dataset.yml ← CI: validate dataset, numbering & manifest freshness
```
