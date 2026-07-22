# Portfolio Tracker

Sub-project of **myflare**. Tracks Indian mutual fund portfolios with live NAV data.

## Requirements

### People & portfolios
- Portfolios belong to **people**, and each person can have **multiple portfolios** (two-level hierarchy: person → portfolios → funds).
- Initial set — 5 portfolios across 4 people:
  - **Manoj** — Retirement, Kids Education
  - **Savarnika** — Main Portfolio
  - **Nanna** — Retirement
  - **Amma** — Exploratory
- Provide an **"Add portfolio"** option (and the ability to introduce new people).
- Mobile-first: the top of the page shows a **compact summary of every portfolio (grouped by person)** without much scrolling; details follow below.

### Holdings (per portfolio)
Each entry the user adds consists of:
- **Mutual fund name** (scheme)
- **Units held** ("shares")
- **Buy NAV** (purchase NAV per unit)

### Live NAV
- Fetch the **current NAV in (near) real-time from a trusted source** and compute current value, absolute gain/loss, and percentage gain/loss per fund, per portfolio, and overall.
- Candidate sources (to be finalized during wiring):
  - **AMFI** (Association of Mutual Funds in India) — official daily NAV feed: `https://www.amfiindia.com/spages/NAVAll.txt`
  - **mfapi.in** — free JSON API layered over AMFI data: `https://api.mfapi.in/mf/{schemeCode}`
- Note: Indian MF NAVs are published **once per business day** (typically after market close), so "realtime" effectively means "latest published NAV," refreshed on page load / on demand.

### Persistence
- Raw portfolio/fund data is persisted as an **encrypted blob** in a **Firebase** backend (Firestore or Realtime Database).
- Encryption happens **client-side** before upload (e.g., AES-GCM via Web Crypto API with a user-supplied passphrase), so Firebase only ever stores ciphertext.

## Current status

**Frontend UI direction under review.** Three unwired sample pages (static HTML, sample data, no JavaScript/backend) are in [`mockups/`](mockups/):

| Sample | File | Direction |
|---|---|---|
| Option A | [`mockups/option-a-cards.html`](mockups/option-a-cards.html) | Dashboard with summary stat tiles + portfolio cards grid |
| Option B | [`mockups/option-b-ledger.html`](mockups/option-b-ledger.html) | Dense single-page ledger — all funds in one grouped table |
| Option C | [`mockups/option-c-sidebar.html`](mockups/option-c-sidebar.html) | App-style dark UI — sidebar portfolio navigation + detail pane |

Once one direction is approved, wiring proceeds: forms, NAV fetch, encryption, Firebase persistence.

## Planned next steps (after UI approval)
1. Wire chosen mockup into the working app (vanilla JS or a light framework — TBD).
2. NAV fetch layer with scheme-code lookup and daily-NAV caching.
3. Client-side encryption (Web Crypto AES-GCM) + Firebase read/write of the blob.
4. Add/edit/delete flows for portfolios and holdings.
