# Wallet

Sub-project of **myflare**. A digital cardholder — photograph an ID, credit/debit card, or a
bank balance/passbook page, straighten and crop it to a clean rectangle right on the device,
optionally blackout sensitive numbers, and it joins a swipeable stack that feels like flipping
through a real wallet.

## Requirements

- **Capture on the fly**: take a photo (camera) or pick one from the gallery.
- **Straighten & crop**: drag the four corners of a quad onto the card's edges; the photo is
  perspective-warped to a clean rectangle at the standard ID-1 card ratio (85.60 × 53.98 mm —
  the size of every credit/debit card and most ID cards), so every card in the deck is uniform.
- **Touch up**: an optional brush to blackout sensitive numbers (e.g. a CVV) before saving.
- **Cardholder feel**: cards render as a fanned, swipeable deck — tap a card to bring it
  forward, tap again for a fullscreen view. Categorised (ID / Credit / Debit / Balance / Other)
  with quick filter chips.
- **Encrypted**: every card image is AES-GCM encrypted client-side with a passphrase before it
  is ever written to storage — locally (IndexedDB) and, optionally, to Firebase. The passphrase
  never leaves the device, and there is no passphrase recovery.

## Current status — built

Static, no build step, GitHub Pages friendly: [`index.html`](index.html) + [`app.js`](app.js) +
[`styles.css`](styles.css).

### What works
- **Vault**: on first use you choose a passphrase; PBKDF2 → AES-GCM (Web Crypto) derives the
  key, verified against an encrypted canary record (never the raw passphrase). Unlocked session
  is cached (non-extractable key, IndexedDB) for a **30-minute sliding window**; 🔒 Lock re-locks
  immediately. A translucent privacy veil covers the deck whenever the tab is backgrounded.
- **Add a card** (wizard): choose *Take photo* or *Choose from gallery* → **straighten & crop**
  (drag-quad perspective warp, done with a two-triangle affine trick since Canvas2D has no true
  projective transform) → optional **brush touch-up** (S/M/L marker, undo) → **label, category,
  optional note** → saved encrypted.
- **Deck**: swipeable, fanned stack per the "cardholder" brief — tap/swipe to bring a card
  forward, tap the front card for a fullscreen view with Edit/Delete. Category filter chips
  (All / ID / Credit / Debit / Balance / Other) up top. Every card is stored as one fixed-size
  (900×568) JPEG, so the deck always lines up.
- **Firebase sync (optional)**: each card is its own encrypted Firestore document
  (`wallet_cards/{id}`), plus one small `wallet_meta/main` doc holding the salt/canary — so
  adding one card only uploads that one card, not the whole vault. Two-way, last-write-wins per
  card. Only ciphertext ever reaches Firestore.
- **Backup**: Settings → Export/Import JSON (decrypted, for your own safekeeping).

### Firebase setup (optional, for cross-device sync)
1. Create a Firebase project → add a **Web app** → copy its config JSON.
2. Enable **Authentication → Anonymous** sign-in.
3. Create a **Firestore** database, with rules allowing signed-in access, e.g.
   `match /wallet_meta/{doc} { allow read, write: if request.auth != null; }` and the same for
   `wallet_cards/{doc}`.
4. Paste the config JSON into the app's **Settings** dialog.

⚠️ There is **no passphrase recovery**. Export a JSON backup now and then.

### Known limitations (not built)
- No manual drag-to-reorder — the deck orders cards by when they were added.
- Firestore sync doesn't propagate deletions across devices (deleting a card removes it from
  the device you're on and from Firestore, but a second device that's offline at that moment
  won't learn about the delete until it's told some other way).
- The crop tool's quad-to-rectangle warp is a two-triangle affine approximation of a true
  perspective transform — good enough for a card held roughly flat, not a substitute for a real
  document scanner on a badly skewed shot.
