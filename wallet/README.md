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
  card's Edit screen); the fullscreen viewer gets a Flip control when one is present.
- **On-the-fly OCR (best-effort)**: after the front photo is captured, the card is scanned for
  text in the background; issuer/label, a probable category, and a masked last-4 note are
  pre-filled (never a raw full number) — always editable before you save.
- **Cardholder feel**: cards render as a fanned, swipeable deck with a "deal-in" entrance
  animation and live drag-follow on swipe. Tap a card to bring it forward, tap again for a
  fullscreen view. Categorised (ID / Credit / Debit / Balance / Other) with quick filter chips.
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
  **brush touch-up** (S/M/L marker, undo) → **label, category, optional note**, with an optional
  **+ Add back photo** loop back through capture/crop/touch-up before the final save.
- **OCR**: dynamically loads Tesseract.js from a CDN only when a photo is captured (never on page
  load), runs in the background with a timeout, and fails silently (never blocks Save) if
  unavailable — e.g. offline.
- **Deck**: swipeable, fanned stack — tap/swipe to bring a card forward (with live drag-follow
  while swiping the front card), a "deal-in" animation plus a neighbor pulse when a new card is
  saved, tap the front card for a fullscreen view with Edit/Delete/Flip. Category filter chips
  (All / ID / Credit / Debit / Balance / Other) up top. Portrait and landscape cards both render
  correctly (`object-fit: contain`, never stretched).
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
  double-check the pre-filled label/category/note before saving.
- The export-encryption passphrase prompt uses the browser's built-in `prompt()` dialog rather
  than an in-app one.
