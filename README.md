# myflare

Personal web interface — a hub page (`index.html`) linking to individual sub-projects, each living in its own subfolder.

## Sub-projects

| Sub-project | Folder | Status |
|---|---|---|
| Portfolio Tracker | [`portfolio-tracker/`](portfolio-tracker/) | Live — encrypted MF portfolio tracker; see [`portfolio-tracker/README.md`](portfolio-tracker/README.md) |
| Padyaalu | [`padyaalu/`](padyaalu/) | Working reading app with seed corpus — see [`padyaalu/README.md`](padyaalu/README.md) |
| Forest Friends | [`forest-friends/`](forest-friends/) | Voice-controlled kids' animal game (English & Telugu) — see [`forest-friends/README.md`](forest-friends/README.md) |

## Todo / planning

New ideas are logged on the [todo board](todo/index.html) (linked from the home
page) and go through a planning phase — tracked in [`todo/`](todo/) — before
being promoted into their own sub-project folder above. See
[`todo/README.md`](todo/README.md) for the workflow.

## Structure

```
index.html              ← main hub page with links to sub-projects, incl. Todo
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
```
