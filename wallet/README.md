# Wallet

Sub-project of **myflare**. A digital cardholder — photograph an ID, credit/debit card, or a
bank balance/passbook page, get the boundary auto-detected and straightened to a clean
rectangle right on the device, optionally blackout sensitive numbers, and it joins a fanned,
swipeable stack that feels like flipping through a real wallet.

## Requirements

- **No passphrase up front**: the wallet opens straight into the deck and cards are usable
  immediately. A passphrase is only asked for when you explicitly tap **🔒 Lock** (which sets it
  up the first time and encrypts everything you already have) or opt to encrypt a backup export.
- **Capture on the fly**: take a photo (camera) or pick one from the gallery.
- **Auto-detect + straighten & crop**: the card's boundary is guessed automatically (see below);
  drag any of the four corners to adjust. The photo is perspective-warped to a clean rectangle at
  the standard ID-1 ratio (85.60 × 53.98 mm), in **landscape or portrait** — matching the shape
  you drew — so a vertical ID never comes out squashed into a landscape frame.
- **Touch up**: an optional brush to blackout sensitive numbers (e.g. a CVV) before saving.
- **Front & back**: a card can have a back photo too (add it during creation, or later from the
  card's Edit screen). The viewer shows both together — stacked one below another for a landscape
  card, side by side for a portrait one — each with its own Share button.
- **Share & copy**: share either photo through the device's native share sheet (falls back to a
  download if unavailable), and a copyable card/ID number field with a one-tap Copy button.
- **People & tags**: every card can be tagged with a person's name (autocompleted from names
  you've used before) and a short `@handle`-style tag (e.g. `@aadhar`, `@pan`) for grouping the
  same kind of document across people.
- **ID cards and bank cards, side by side**: the home page splits into two decks — ID Cards and
  Bank Cards — shown side by side on wider screens and stacked on phones, each independently
  swipeable, plus a filter row for person on top of the existing category filter.
- **ID coverage table**: a table below the decks lists ID types (by tag) as rows and people as
  columns, with a ✓/– for who has which — a quick way to see who's still missing an ID on file.
- **Cardholder feel**: cards render as a bigger, fanned, swipeable deck with a "deal-in" entrance
  animation and live drag-follow on swipe. Tap a card to bring it forward, tap again for a
  fullscreen view.
- **Encrypted once locked**: after you set a passphrase, every card is AES-GCM encrypted
  client-side before it's written to storage — locally (IndexedDB) and, optionally, to Firebase.
  The passphrase never leaves the device, and there is no passphrase recovery.

## Current status — built

Static, no build step, GitHub Pages friendly: [`index.html`](index.html) + [`app.js`](app.js) +
[`styles.css`](styles.css).

### What works
- **Unencrypted-by-default, lock on demand**: cards are stored plain in IndexedDB until you tap
  🔒, at which point a passphrase is chosen, PBKDF2 → AES-GCM (Web Crypto) derives a key, every
  existing card is re-encrypted in place, and the wallet locks immediately. From then on, tapping
  🔒 while unlocked locks it (clearing the 30-minute sliding session); tapping it while locked
  re-prompts for the passphrase. A translucent privacy veil also covers the deck whenever the tab
  is backgrounded.
- **Auto-detect boundary**: a lightweight on-device heuristic — treat the photo's border as
  "background", mask pixels that differ from it by more than a threshold, flood-fill to find the
  largest connected blob, and use its bounding box as the starting quad. Works well for a card on
  a contrasting surface; a **🔍 Auto-detect** button re-runs it (e.g. after rotating), and manual
  corner-dragging is always the fallback for busy backgrounds or edge cases.
- **Add a card** (wizard): *Take photo* or *Choose from gallery* → **auto-detected straighten &
  crop** (drag-quad perspective warp via a two-triangle affine trick, since Canvas2D has no true
  projective transform; output orientation matches the quad's own aspect ratio) → optional
  **brush touch-up** (S/M/L marker, undo) → **person, tag, label, category, card/ID number,
  note**, with an optional **+ Add back photo** loop back through capture/crop/touch-up before the
  final save. Person and tag fields autocomplete from names/tags used before (shared
  `<datalist>`s), and OCR pre-fills label/category/number when it can read the photo.
- **OCR**: dynamically loads Tesseract.js from a CDN only when a photo is captured (never on page
  load), runs in the background with a timeout, and fails silently (never blocks Save) if
  unavailable — e.g. offline.
- **Two decks, ID and Bank**: the home page always splits cards into an "🪪 ID Cards" deck and a
  "💳 Bank Cards" deck (credit/debit/balance/other), each independently swipeable with its own
  "deal-in" entrance animation, live drag-follow, and blank "+ Add card" slot. Category filter
  chips narrow to one deck at a time; a person filter row (built from names you've used) narrows
  both. Portrait and landscape cards both render correctly (`object-fit: contain`, never
  stretched).
- **ID × people matrix**: below the decks, a table of every distinct ID tag (rows) against every
  distinct person (columns) with a ✓ where that person has that document on file.
- **Firebase sync (optional)**: only ever engages once the wallet is encrypted — nothing
  plaintext is pushed. Each card is its own encrypted Firestore document (`wallet_cards/{id}`),
  plus one small `wallet_meta/main` doc holding the salt/canary, so adding one card only uploads
  that one card. Two-way, last-write-wins per card.
- **Backup**: Settings → Export/Import JSON, with an optional "encrypt this backup with a
  passphrase" checkbox — independent of whether the wallet itself is locked.

### Firebase setup (optional, for cross-device sync)
1. Create a Firebase project → add a **Web app** → copy its config JSON.
2. Enable **Authentication → Anonymous** sign-in.
3. Create a **Firestore** database, with rules allowing signed-in access, e.g.
   `match /wallet_meta/{doc} { allow read, write: if request.auth != null; }` and the same for
   `wallet_cards/{doc}`.
4. Paste the config JSON into the app's **Settings** dialog. Sync only starts moving data once
   the wallet has been locked with a passphrase.

⚠️ There is **no passphrase recovery**. Export a JSON backup now and then.

### Known limitations (not built)
- No manual drag-to-reorder — the deck orders cards by when they were added.
- Firestore sync doesn't propagate deletions across devices.
- The crop tool's quad-to-rectangle warp is a two-triangle affine approximation of a true
  perspective transform — good enough for a card held roughly flat, not a substitute for a real
  document scanner on a badly skewed shot.
- Auto-detect is a background-contrast heuristic, not real computer vision — it can miss on busy
  backgrounds or when the card nearly fills the frame; manual corner-dragging always works.
- OCR is best-effort text extraction plus regex heuristics, not a real card-data parser — always
  double-check the pre-filled label/category/number before saving.
- The export-encryption passphrase prompt, and any encrypted-import passphrase prompt, use the
  browser's built-in `prompt()` dialog rather than an in-app one.
- Sharing a photo uses the Web Share API where the browser supports sharing files (most mobile
  browsers); elsewhere it falls back to a plain download.
- The card/ID number field is optional plaintext-in-vault (still encrypted at rest once locked,
  same as everything else) — it exists specifically so it can be copied out, which is a different
  trade-off than the photo-only approach for the rest of the card.
- The "@tag" grouping used by the ID × people table is free text you choose per card — cards left
  without a tag fall back to grouping by their label, so keep tags consistent (e.g. always
  `@aadhar`, not sometimes `@Aadhaar`) for the table to line up.
