# Kṛti Kōśam — the Tyāgarāja catalog

A structured, versioned dataset of kṛtis by Saint Tyāgarāja (1767–1847), plus a
study app over it. Built for someone two-ish years into Carnatic music: dense
enough to be a reference, personal enough to be their notes.

Open `index.html` over HTTP (`python3 -m http.server` from this folder, or the
GitHub Pages copy). Browsers block `fetch` on `file://`, so a double-click won't
load the data.

---

## The dataset

Four JSON files under `data/`, each validated against a JSON Schema in
`schema/`, tied together by a manifest.

| File | What it holds |
|---|---|
| `data/kritis.json` | The catalog — one record per kṛti: raga, tala, language, pallavi, gloss, deity, group, structure, difficulty, popularity |
| `data/ragas.json` | All 72 melakartas plus the janya ragas the catalog uses — ārōhaṇa/avarōhaṇa, parent mēḷa, chakra, character notes |
| `data/talas.json` | The 11 talas that appear in kṛti attributions — akṣara count, aṅga breakdown, and how to physically count the cycle |
| `data/groups.json` | The named sets — Pañcaratna, Utsava Sampradāya, Divya Nāma, the operas, the regional pañcaratnams |
| `data/dataset.json` | Manifest: dataset version, schema version, and each file's record count + sha256 |

Every file is an envelope, not a bare array:

```json
{
  "$schema": "../schema/kriti.schema.json",
  "version": "1.0.0",
  "updated": "2026-07-30",
  "records": [ … ]
}
```

### A kṛti record

```json
{
  "id": 34,
  "slug": "nagumomu-galavani",
  "title": "Nagumōmu Galavāni",
  "title_telugu": "నగుమోము గలవాని",
  "raga": "Ābhēri",
  "raga_slug": "abheri",
  "tala": "Adi",
  "language": "Telugu",
  "pallavi": "Nagumōmu galavāni nā manōharuni jūci",
  "pallavi_telugu": "నగుమోము గలవాని నా మనోహరుని జూచి",
  "meaning": "Longs for one glimpse of the smiling-faced Lord who has stolen his heart…",
  "deity": "Rama",
  "groups": [],
  "kshetra": null,
  "structure": { "anupallavi": true, "charanams": 1 },
  "difficulty": 3,
  "popularity": 5,
  "confidence": "high",
  "notes": "Probably the single most-performed Tyagaraja kriti…",
  "tags": ["concert-staple", "beginner-friendly"]
}
```

Two fields deserve explanation.

**`id` is a display handle, not a key.** It is the record's position in
alphabetical title order, so adding a kṛti renumbers everything after it. That's
deliberate: a student says "number 34" and gets a stable *catalog*, while nothing
in the app keys off the number. Favourites, bookmarks, statuses, practice
tallies and notes all key off **`slug`**, which never changes once published.
`node renumber.mjs` reassigns ids; CI fails if they drift.

**`confidence` is honest about attribution.** Raga and tala attributions differ
between paṭhāntarams and between published editions. `high` means the attribution
is stable across the sources consulted and I'd stake the row on it. `medium`
means it follows commonly cited listings but is worth checking against your
teacher's version — the app shows a "check attribution" marker, and there's a
"✓ Cross-checked" filter if you only want the solid rows. Compositions whose
*authorship* is doubtful aren't in the dataset at all.

### Versioning

`dataset.json` carries a `version` (the data) and a `schema_version` (the shape).
Per-file `version` fields move with the same rules:

- **patch** — a correction to an existing record
- **minor** — records added, or a new optional field
- **major** — a required field added, removed or retyped

The manifest also pins each file's record count and sha256. Editing a data file
without running `node validate.mjs --update` fails CI, so the manifest can't
silently drift out of sync with the data.

---

## Validation

```
node validate.mjs            # validate; exit 1 on errors
node validate.mjs --strict   # warnings are errors too
node validate.mjs --update   # refresh manifest counts + hashes
node renumber.mjs            # reassign catalog numbers alphabetically
node renumber.mjs --check    # report numbering drift without writing
```

Zero dependencies, on purpose — this repo has no build step and CI shouldn't
need `npm install` to check a data file. `validate.mjs` implements the slice of
JSON Schema 2020-12 the schemas actually use (`type`, `enum`, `pattern`,
`required`, `additionalProperties`, `minLength`/`maxLength`, `minimum`/`maximum`,
`uniqueItems`, `items`, `$ref`), then layers on the checks a generic validator
can't know:

- **Melakarta scales are derived, not trusted.** For every `type: "melakarta"`
  record the validator computes the scale from the mēḷa number using the
  katapayadi arrangement — chakra fixes R and G, position within the chakra fixes
  D and N, mēḷa ≤ 36 fixes M1 — and compares it against the file. The chakra name
  is checked the same way. A wrong ārōhaṇa on a melakarta cannot be committed.
- **Janya scales must live inside their parent mēḷa.** Any swara outside the
  parent's set is flagged unless the record is marked `bhashanga`, which is
  exactly what that classification means.
- **Every reference resolves** — `raga_slug` into `ragas.json`, `tala` into
  `talas.json`, each entry of `groups` into `groups.json`, each janya's `parent`
  onto an actual melakarta.
- **Catalog integrity** — slugs unique, ids contiguous from 1, ids in
  alphabetical title order, no two records sharing a title and raga.
- **Script sanity** — a non-null `*_telugu` field must actually contain Telugu
  codepoints, and `pallavi` must not (Telugu belongs in `pallavi_telugu`).
- **Swara notation** — every scale starts and ends on S, no swara repeats back to
  back, tokens restricted to the 16 valid sthānas.

Errors fail the build. Warnings are the dataset's own to-do list — an incomplete
pañcaratna set, a group nobody points at — printed on every run so the gaps stay
visible instead of being forgotten. `--strict` turns them into failures if you
want a hard gate.

CI runs this on every push and PR touching `tyagaraja/data`, `tyagaraja/schema`
or the scripts: `.github/workflows/tyagaraja-dataset.yml`.

---

## Coverage — read this before trusting a row

Tyāgarāja is credited with roughly 700 compositions, of which a few hundred
circulate with reliable raga and tala attributions. **This catalog is a working
subset, not a complete one.** It was compiled from commonly cited listings and
standard theory references, then machine-checked as described above. The
validator prints the gaps on every run, and the Groups view in the app marks
sets that aren't catalogued yet.

Known gaps, all currently reported as validator warnings:

- Utsava Sampradāya and Divya Nāma are thinly covered against their real extent.
- Lālgudi Pañcaratnam is absent; Tiruvoṭṭiyūr, Kōvūr and Śrīraṅgam are partial.
- Naukā Caritram and Prahlāda Bhakti Vijayam have no individual songs yet.
- Telugu script is filled in for only some records; the rest are `null` rather
  than guessed, because mangled Telugu is worse than none.

Records were deliberately **excluded** where authorship was wrong or unclear.
Pieces by Muttusvāmi Dīkṣitar, Annamācārya and others that are commonly
misfiled under Tyāgarāja in online lists were dropped during compilation, as
were rows whose pallavi text or deity couldn't be reconciled.

### Adding a kṛti

1. Append a record to `records` in `data/kritis.json` with every field present
   (`null` for unknown optionals). If its raga isn't in `data/ragas.json`, add
   that first — the reference is the gatekeeper.
2. `node renumber.mjs` — reassigns catalog numbers.
3. `node validate.mjs --update` — validates and refreshes the manifest.
4. Bump the `version` in `data/kritis.json` and `data/dataset.json` (minor for
   additions, patch for corrections).

If you're correcting an attribution, change `confidence` to match how sure you
are, and say what you checked against in `notes`. The dataset is more useful
honest than complete.

---

## The app

Four views over the same filtered set, so a filter you set in one carries to all
of them.

- **Catalog** — dense rows: catalog number, title (transliteration and Telugu),
  first line of the pallavi, raga, tala, language, mēḷa, difficulty, group
  badges, practice count. Star and flag toggles live on the row.
- **Rāgas** — one card per raga in view: mēḷa and parent, ārōhaṇa/avarōhaṇa as
  swara chips, character notes, and the kṛtis under it. Toggle to include ragas
  with no kṛti yet, so it doubles as a melakarta reference.
- **Groups** — the named sets with their history, a study note on how to
  approach each, and members with learnt/learning state.
- **Progress** — learnt and learning counts, difficulty bars, group coverage,
  your raga repertoire, recently practised, and a "next up" list drawn from what
  you've bookmarked, easiest first.

Detail panel shows the pallavi in both scripts, the gloss, the full raga card
(scale, mēḷa, character), the tala card (aṅgas plus how to count the cycle), the
group's context, a practice log, and a free-text notes field that autosaves.

**Study state**, per kṛti, keyed by slug: status (to learn / learning / learnt),
favourite, bookmark, practice tally with last-practised date, and notes. All of
it in `localStorage` under `tyagaraja.study.v1` — nothing leaves the browser.
Export and import JSON from the ⤓ button; import merges rather than overwrites,
and skips slugs it doesn't recognise.

**Shortcuts**: `/` search · `j`/`k` next/previous · `f` favourite · `b` bookmark ·
`1`/`2`/`3` status · `p` log a practice session · `x` clear filters · `?` help ·
`Esc` close.

Search folds diacritics, so `nagumomu`, `Nagumōmu` and `#34` all find the same
row, and it reaches into pallavi, meaning, tags, raga names and raga aliases —
searching `todi` finds Hanumatōḍi, `pantuvarali` finds Kāmavardhini.

---

## Files

```
README.md         ← this file
index.html        ← topbar, filter rail, four views, detail panel, dialogs
styles.css        ← mobile-first light/dark, dense rows, cards, swara chips
app.js            ← load, filter, sort, render, study state, import/export
validate.mjs      ← zero-dep schema + domain validator (see Validation)
renumber.mjs      ← alphabetical catalog numbering
data/
  dataset.json    ← manifest: versions, counts, hashes
  kritis.json     ← the catalog
  ragas.json      ← 72 melakartas + janyas in use
  talas.json      ← 11 talas with anga breakdown and counting
  groups.json     ← named sets with history and study notes
schema/
  dataset.schema.json  kriti.schema.json  raga.schema.json
  tala.schema.json     group.schema.json
```
