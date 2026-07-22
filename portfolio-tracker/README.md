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

## Current status — app is live

The app (**Option A** design, mobile-first) is wired and lives at [`index.html`](index.html) + [`app.js`](app.js) + [`styles.css`](styles.css). Pure static files — works on GitHub Pages, no build step.

### What works
- **Vault**: on first use you choose a passphrase; all data is encrypted client-side (PBKDF2 → AES-GCM via Web Crypto) before storage. Unlock on each visit; 🔒 Lock button re-locks.
- **Add portfolio**: owner (with autocomplete of existing people) + portfolio name + optional first fund.
- **Fund dropdown**: typeahead search against `https://api.mfapi.in/mf/search?q=…` (free JSON API over AMFI data, open CORS). Picking a fund fetches its latest NAV; **Buy NAV defaults to the latest NAV** if left blank.
- **Add funds on the fly**: every portfolio card has "+ Add fund". Units accept 3 decimal places; each fund takes an optional **buy date**, which drives **XIRR / CAGR** (annualised return) shown per fund, per portfolio, and overall. Tap a fund row to edit its units/buy NAV/buy date or remove it (edit dialog opens without stealing focus into a text box); delete whole portfolios from the card.
- **Short display names**: long AMFI scheme names (e.g. "Aditya Birla Sun Life Nifty India Defence Index Fund-Direct Plan-Growth") are abbreviated for the fund row ("ABSL Nifty India Defence Index") via a built-in AMC abbreviation table + boilerplate stripper (Direct/Regular/Plan/Growth/IDCW/…); the full name is always kept as a hover title and used everywhere else (search, edit dialog).
- **XIRR / 1D / 1W / 1M toggle**: a "Show" segmented control switches the change metric shown on *every* row at once — funds, portfolio badges, and person subtotals — not just one summary figure. **XIRR/CAGR is the default** (not absolute gain): each fund's annualised return from its buy date, portfolios and people show the same computed from their combined cashflows; a fund with no buy date falls back to its plain since-buy % until you set one. 1D reuses the existing day-over-day NAV cache; 1W/1M pull each held fund's historical NAV series (`api.mfapi.in/mf/{schemeCode}`, cached in memory for the session) and diff against the nearest prior trading day — a "≈" prefix means history is still loading for some funds. All change percentages are shown to **two decimal places**.
- **No cross-person total**: there is deliberately no combined "everyone's money" figure — summing different people's portfolios into one number isn't meaningful. Each portfolio, and each person's subtotal, stands on its own.
- **NAV refresh**: `https://api.mfapi.in/mf/{schemeCode}/latest` per held fund — on demand ("↻ Refresh NAV") and automatically on unlock when data is older than 6 h. Previous-day NAV is kept to show the day's ₹ change.
- **Persistence**: the encrypted blob is always in `localStorage`; optionally synced to **Firebase** (Firestore) — newer copy wins on load.
- **Stays unlocked**: after entering your passphrase once, the derived key is cached (non-extractable, in IndexedDB) for a **30-minute sliding session** — refreshing the page doesn't ask again. 🔒 Lock (top-right) ends the session immediately.
- **Backup**: Settings → Export/Import JSON (decrypted, for your own safekeeping).
- **Not pinch-zoomable** — the app is fixed-scale like a native app; pinch-to-zoom is disabled via the viewport meta tag.

### Firebase setup (optional, for cross-device sync)
1. Create a Firebase project → add a **Web app** → copy its config JSON.
2. Enable **Authentication → Anonymous** sign-in.
3. Create a **Firestore** database, with rules allowing signed-in access, e.g.
   `allow read, write: if request.auth != null;` on `portfolio-tracker/vault`.
4. Paste the config JSON into the app's **Settings** dialog.
Only ciphertext ever reaches Firestore; the passphrase never leaves the device.

⚠️ There is **no passphrase recovery** — the encryption is only as good as that. Export a JSON backup now and then.

### Mockups (historical)
The three UI directions reviewed before building are kept in [`mockups/`](mockups/): [Option A](mockups/option-a-cards.html) (chosen), [Option B](mockups/option-b-ledger.html), [Option C](mockups/option-c-sidebar.html).
