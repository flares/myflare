# Wallet

Sub-project of **myflare**. A digital cardholder — photograph an ID, credit/debit card, or a
bank balance/passbook page, get the boundary auto-detected and straightened to a clean
rectangle right on the device, optionally blackout sensitive numbers, and browse everything
through a pair of clean "who has what" tables instead of hunting through a stack.

## Requirements

- **No passphrase up front**: the wallet opens straight into the tables and cards are usable
  immediately. A passphrase is only asked for when you explicitly tap **🔒 Lock** (which sets it
  up the first time and encrypts everything you already have) or opt to encrypt a backup export.
- **Capture on the fly**: take a photo (camera) or pick one from the gallery.
- **Auto-detect + straighten & crop**: the card's boundary is guessed automatically (see below);
  drag any of the four corners to adjust. The photo is perspective-warped to a clean rectangle at
  the standard ID-1 ratio (85.60 × 53.98 mm), in **landscape or portrait** — matching the shape
  you drew — so a vertical ID never comes out squashed into a landscape frame, and with no visible
  seam even on a strongly skewed shot (see "true perspective warp" below).
- **Touch up**: an optional brush to blackout sensitive numbers (e.g. a CVV) before saving.
- **Front & back, with clear photo tiles**: a card can have a back photo too. The wizard's details
  step and the Edit dialog both show a front tile and a back tile side by side — each with its own
  thumbnail and a **🔄 Retake** button, plus **+ Add back** / **✕ Remove** on the back tile — so
  adding, replacing, or dropping the back photo is always a direct, visible action instead of a
  buried checkbox-like slot.
- **Share & copy**: share either photo through the device's native share sheet (falls back to a
  download if unavailable), and a copyable card/ID number field with a one-tap Copy button.
- **People & tags**: every card can be tagged with a person's name (autocompleted from names
  you've used before) and a short `@handle`-style tag (e.g. `@aadhar`, `@pan`) for grouping the
  same kind of document across people.
- **Two tables, not a deck**: the home page is two "card type × person" tables — 🪪 **ID cards by
  person** and 💳 **Bank cards by person** — centered on the page, with sticky headers and a
  tappable ✓ in every filled cell that jumps straight to that card's fullscreen view. There's no
  swipeable stack and no category-level filter (all/ID/credit/debit/…) to fight through.
- **Person avatars, as a column highlight**: a row of circular per-person emoji avatars sits above
  the tables (tap ✏️ to pick a different emoji). Selecting a person doesn't hide anyone — it
  highlights their column across both tables and dims the rest, so you keep the overview while
  focusing on one person.
- **Per-person notes**: a pinned **📝 Notes** row at the top of the ID table gives every person a
  spot for free-form key/value reminders (locker numbers, policy numbers, anything worth keeping
  handy) — tap their cell to open an editor, add as many fields as needed. Stored the same
  encrypted way as everything else.
- **Add a card, from one obvious button**: a full-width **➕ Add a card** button sits right under
  the title, always one tap away — no floating button, no digging through a stack for a blank slot.
- **Encrypted once locked**: after you set a passphrase, every card (and every person's notes) is
  AES-GCM encrypted client-side before it's written to storage — locally (IndexedDB) and,
  optionally, to Firebase. The passphrase never leaves the device, and there is no passphrase
  recovery.

## Current status — built

Static, no build step, GitHub Pages friendly: [`index.html`](index.html) + [`app.js`](app.js) +
[`styles.css`](styles.css).

### What works
- **Unencrypted-by-default, lock on demand**: cards are stored plain in IndexedDB until you tap
  🔒, at which point a passphrase is chosen, PBKDF2 → AES-GCM (Web Crypto) derives a key, every
  existing card is re-encrypted in place, and the wallet locks immediately. From then on, tapping
  🔒 while unlocked locks it (clearing the 30-minute sliding session); tapping it while locked
  re-prompts for the passphrase. A translucent privacy veil also covers the tables whenever the
  tab is backgrounded.
- **Auto-detect boundary**: a lightweight on-device heuristic — treat the photo's border as
  "background", mask pixels that differ from it by more than a threshold, flood-fill to find the
  largest connected blob, and use its bounding box as the starting quad. Works well for a card on
  a contrasting surface; a **🔍 Auto-detect** button re-runs it (e.g. after rotating), and manual
  corner-dragging is always the fallback for busy backgrounds or edge cases.
- **Add a card** (wizard): *Take photo* or *Choose from gallery* → **auto-detected straighten &
  crop** (drag-quad **true perspective warp** — a per-pixel projective remap with bilinear
  sampling, not a two-triangle affine approximation, so there's no diagonal seam even on a
  strongly skewed shot; output orientation matches the quad's own aspect ratio) → optional
  **brush touch-up** (S/M/L marker, undo) → a **details step** showing front/back photo tiles
  (retake either, add/remove the back) plus **person, tag, label, category, card/ID number,
  note**. Person and tag fields autocomplete from names/tags used before (shared `<datalist>`s),
  and OCR pre-fills label/category/number when it can read the photo.
- **OCR**: dynamically loads Tesseract.js from a CDN only when a photo is captured (never on page
  load), runs in the background with a timeout, and fails silently (never blocks Save) if
  unavailable — e.g. offline.
- **Two tables, ID and Bank**: the home page always shows both an "🪪 ID cards by person" table and
  a "💳 Bank cards by person" table (credit/debit/balance/other together as rows), each row a card
  type/tag and each column a person, with a tappable ✓ opening that exact card in the fullscreen
  viewer. A row of circular person avatars (built from names you've used) highlights one person's
  column across both tables at once — nothing is hidden, just emphasized/dimmed. Portrait and
  landscape cards both render correctly in the viewer (`object-fit: contain`, never stretched).
- **Person avatars**: each person in the filter row gets an emoji avatar — a stable default picked
  from their name, or your own choice via the small ✏️ button on their circle, saved per person in
  `localStorage` (`wallet.personAvatars`).
- **Per-person notes**: a pinned Notes row in the ID table stores free-form key/value pairs per
  person as a `category:'notes'` pseudo-card (`{person, kv:[{k,v}]}`) — riding the exact same
  encrypt-at-rest and Firebase-sync path as photo cards, just without a photo.
- **Front/back photo tiles**: both the add-card wizard's details step and the Edit dialog show
  matching front/back tiles with thumbnails and direct **Retake** / **Add back** / **Remove**
  actions — retaking the front mid-wizard re-runs OCR (without clobbering fields you've already
  typed), and removing a back photo needs no recapture.
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
- Firestore sync doesn't propagate deletions across devices.
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
