# myflare — project map

`myflare` is a hub of small, independent, static web apps. Root `index.html` is a links page to each subproject; root `README.md` lists them in a table and a file-tree `Structure` block.

## Scope rule (read this first)

Each subproject is self-contained and unrelated to the others. When working on one subproject:

- Only read/edit files inside that subproject's own folder, plus the root `index.html` and root `README.md` if the task requires adding, renaming, or removing a subproject link.
- Do **not** read other subprojects' files. They have their own data, their own conventions, and are irrelevant to the task at hand — reading them burns context for no benefit.
- Each subproject's own `README.md` (inside its folder) has the full spec/status for that subproject — that single file is the only context needed to work on it, beyond the code itself.

## Git workflow

- **Always commit to the `playground` remote branch.** All work — new subprojects, fixes, experiments — goes onto `playground` and is pushed there.
- **Never create a project-specific sub-branch on the remote.** No `claude/<subproject>-...`, no `feature/<subproject>`, no per-subproject branches of any kind get pushed. `playground` is the single shared working branch; `main` is the release branch that `playground` merges into.

## Adding a new subproject

1. Create `<name>/` at the repo root containing at minimum an `index.html` and a `README.md`, plus whatever JS/CSS it needs. Static only — no build step, no bundler, no shared dependencies between subprojects. Must work as a plain file served from GitHub Pages.
2. Add a card for it inside `<main>` in root `index.html`, matching the existing `a.project` markup pattern.
3. Add a row to the table in root `README.md`, and an entry to the `Structure` file-tree block at the bottom of that file.
4. Add the auth gate to every new HTML page (see below).
5. Nothing else at the root changes — there's no shared registry, router, config, or build system to update.

## Auth gate (site-wide)

`auth/` is the one piece of shared code in the repo — the scope rule above does not apply to it. Every page on the site is closed until Firebase confirms a signed-in, allow-listed account.

**Every new HTML page needs these two lines before `</head>`**, with `../` adjusted for folder depth:

```html
<style>html:not(.auth-ok) body{visibility:hidden}</style>
<script type="module" src="../auth/guard.js"></script>
```

The `<style>` is the fail-closed half — if the module never runs, the page stays blank. Read `auth/README.md` before changing anything under `auth/`; it covers the named-Firebase-app split from the subprojects' own anonymous auth, the offline-grace path the two PWAs depend on, and what a client-side gate does and doesn't actually protect.

## Conventions shared across subprojects

- Plain static HTML/CSS/JS. No frameworks, no build step.
- Mobile-first CSS using `:root` custom properties, `color-scheme: light dark`, and a `@media (prefers-color-scheme: dark)` override block for the same variables.
- Font stack: `system-ui, -apple-system, "Segoe UI", sans-serif`.
- Persistence is `localStorage` by default (per-subproject key), or an encrypted vault for sensitive data (see `portfolio-tracker/`) — no shared backend unless a subproject explicitly builds one for itself.
- Every subproject links back to `../index.html` ("myflare home") from its footer.

## Sub-projects

| Sub-project | Folder | What it is |
|---|---|---|
| Portfolio Tracker | `portfolio-tracker/` | Encrypted Indian mutual fund portfolio tracker |
| Padyaalu | `padyaalu/` | Telugu satakaalu reading app with chandassu (prosody) engine |
| Forest Friends | `forest-friends/` | Voice-controlled kids' animal game (English & Telugu) |
| Parayana Tracker | `parayana/` | Tap-a-day calendar counter for Lalitha Sahasranama Parayana, goal-tracked to 41 |
| Kalpavriksha | `kalpavriksha/` | Tap-to-grow full-page tree PWA — one leaf and one "Sri Rama" per tap |
| Paper Football | `paper-football/` | Landscape two-player pitch game — node lattice, dying trail, drafted movement cards |
| Kṛti Kōśam | `tyagaraja/` | Versioned Tyāgarāja kṛti dataset (schema-validated in CI) + study app |

Keep this table (and the root `README.md` table/`Structure` block) in sync whenever a subproject is added, renamed, or removed.
