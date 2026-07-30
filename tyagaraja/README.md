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
  "id": 63,
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
  "tags": ["concert-staple", "beginner-friendly"],
  "sahityam": [
    { "kind": "pallavi",    "label_telugu": "పల్లవి",    "telugu": "…", "verified": true },
    { "kind": "anupallavi", "label_telugu": "అనుపల్లవి", "telugu": "…", "verified": true }
  ],
  "pratipadartham": [
    { "word": "నగుమోము", "meaning_telugu": "…", "meaning": "the smiling face" }
  ]
}
```

`sahityam` holds the composition's sections in Telugu script and
`pratipadartham` a word-by-word gloss of the pallavi. Both are nullable, and
**a partial `sahityam` is the normal case, not a defect**: a section is present
only when its wording was corroborated against a published lyric source, and
omitted otherwise. Nothing is ever reconstructed from the metre or inferred
from what a line "should" say — for devotional text a student will memorise,
a missing charaṇam is recoverable and a wrong one is not. Each section carries
its own `verified` flag, and the app says plainly when only part of a
composition is on file. The prati-pada-artham glosses are written for this
dataset rather than lifted from a published translation.

Two fields deserve explanation.

**`id` is a display handle, not a key.** It is the record's position in
alphabetical title order, so adding a kṛti renumbers everything after it. That's
deliberate: a student says "number 63" and gets a stable *catalog*, while nothing
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

- Utsava Sampradāya has 9 of its roughly 20 kīrtanas; Divya Nāma is thin against
  its real extent, which runs to over a hundred.
- Lālgudi Pañcaratnam is absent and Śrīraṅgam has one of five. Tiruvoṭṭiyūr and
  Kōvūr are complete at five each.
- Sītā Rāma Vijayam has no songs yet. Naukā Caritram and Prahlāda Bhakti
  Vijayam have eight each, well short of their full length.
- Telugu script: all 123 rāga names are filled (`ragas.json`'s `name_telugu`).
  Kṛti titles and pallavis are at 133/140 and 126/140 — the rest are `null`
  rather than guessed, because mangled devotional text is worse than none.
- Full `sahityam` beyond the pallavi exists for 29 kṛtis (80 sections, all
  corroborated). Most are pallavi + anupallavi: the long multi-charaṇam works
  (the Pañcaratna especially) could not be verified section by section, so their
  charaṇams are absent rather than reconstructed. `pratipadartham` covers the
  pallavi of 46 kṛtis.

Records were deliberately **excluded** where authorship was wrong or unclear.
Twelve candidates were dropped as misattributions — pieces that circulate
widely under Tyāgarāja's name in online lists but belong to other composers:

| Dropped | Actually by |
|---|---|
| Akṣayaliṅga Vibhō, Ānandāmṛtakarṣiṇi, Bhajarē Rē Citta, Cintaya Mākanda, Śrī Subrahmaṇyāya Namastē | Muttusvāmi Dīkṣitar |
| Talli Ninnu Nēra Nammiti, Ō Jagadamba, Marivēre Gati Evvaramma | Śyāmā Śāstri |
| Brōchēvārevarurā | Mysore Vāsudēvācār |
| Palukē Baṅgāramayēna | Bhadrācala Rāmadāsu |
| Koṇḍalalō Nelakonna | Annamācārya |

The Kāmbhōji "Śrī Subrahmaṇyāya Namastē" is the newest of those and the most
instructive: it survived initial compilation at `high` confidence and was only
caught later, when filling in its sāhityam turned up a unanimous Dīkṣitar
attribution. Sourcing the lyrics is itself an attribution check.

Seven further records carry a `notes` entry recording a specific divergence
found against published sources — a pallavi that continues differently, a title
shared by two kṛtis in different rāgas, a rāga that most editions disagree with.
Those were downgraded to `medium` rather than silently re-attributed: weakening
a claim is safe, swapping in a replacement sourced from a search snippet is not.

A further handful were dropped because the pallavi text, raga or deity couldn't
be reconciled across sources. Duplicates arriving under variant spellings were
folded together rather than left to sit as two rows.

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

- **Catalog** — dense rows: catalog number, title, first line of the pallavi,
  raga, tala, language, mēḷa, difficulty, group badges, practice count. Star
  and flag toggles live on the row.
- **Rāgas** — one card per raga in view: mēḷa and parent, ārōhaṇa/avarōhaṇa as
  swara chips, character notes, and the kṛtis under it. Toggle to include ragas
  with no kṛti yet, so it doubles as a melakarta reference.
- **Groups** — the named sets with their history, a study note on how to
  approach each, and members with learnt/learning state.
- **Progress** — learnt and learning counts, difficulty bars, group coverage,
  your raga repertoire, recently practised, and a "next up" list drawn from what
  you've bookmarked, easiest first.

Detail panel shows the sāhityam section by section in Telugu, the prati-pada-artham
where it exists, the gloss, the full raga card (scale, mēḷa, character), the tala
card (aṅgas plus how to count the cycle), the group's context, a practice log,
and a free-text notes field that autosaves.

**Script.** Telugu is the default: titles, sāhityam, rāga names and swaras all
render in lipi, with ārōhaṇa/avarōhaṇa as `స రి₂ గ₃` (the Latin notation stays
on hover). Records with no Telugu yet fall back to transliteration on their own.
Settings (⚙) switches between Telugu only, Telugu + transliteration, and
transliteration only.

**Installable.** `manifest.webmanifest` plus a service worker make this a
standalone PWA. The shell is cache-first so it launches instantly and works
offline; the dataset JSON is network-first with a cache fallback, so a newly
published version appears without waiting for a cache bust. Bump `CACHE` in
`sw.js` when shipping. Settings offers an install button where the browser
supports it, and spells out the Share → Add to Home Screen route on iOS.

**Navigation.** Opening a kṛti pushes a history entry, so the back button (or
the phone's back gesture) closes the detail and returns you to the list at the
scroll position you left, rather than dropping out of the app. Scroll is
restored from history state, since the list re-renders on each navigation and
the browser's own restoration would fire against a stale height. On a phone,
dragging in from the left screen edge opens the filter rail; swiping left
closes it.

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
