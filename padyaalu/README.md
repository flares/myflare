# Padyaalu (పద్యాలు)

Sub-project of **myflare**. A digital collection of Telugu **śatakamulu** (శతకాలు) —
Vemana, Sumati, Dāśarathi, … — presented one padyam per **full-page card**, each with
meaning (in Telugu) and a live **chandassu** (prosody) breakdown.

## What each poem card shows

1. **Padyam (పద్యం)** — the verse in **4 lines** (paadaalu). A line too long for the
   screen wraps with a hanging indent so the runover is clearly offset (`--runover`).
2. **Prati padārtham (ప్రతిపదార్థం)** — word-by-word gloss, **in Telugu**.
3. **Tātparyam (తాత్పర్యం)** — the purport, **in Telugu**.
4. **Chandassu (ఛందస్సు)** — computed live: each syllable marked **U** (గురువు) / **I**
   (లఘువు), grouped into **gaṇaalu** (named), with a ✓/✗ verdict on whether the padyam
   scans for its declared metre.

## Architecture

```
padyaalu/
  index.html          ← the reading app (fetches the JSON data, renders cards)
  chandassu.js        ← the prosody engine (browser + Node); no dependencies
  verify.cjs          ← Node script: scans every poem, exits non-zero on any failure
  data/
    satakams.json     ← metadata + load order for each śatakam
    vemana.json       ← poems (padyam + Telugu meanings) — one file per śatakam
    sumati.json
    dasarathi.json
```

Poem text and meanings live in **JSON data files** (one per śatakam) so files stay
small and content is easy to add. Chandassu is **not stored** — it is computed from the
padyam by `chandassu.js`, so the data never drifts from the scansion.

### Poem record

```json
{
  "id": "vemana-001", "number": 1, "meter": "ఆటవెలది",
  "padyam": ["…", "…", "…", "…"],
  "pratipadartham": [ { "padam": "ఉప్పు", "artham": "ఉప్పు (లవణము)" }, … ],
  "tatparyam": "…"
}
```

## The chandassu engine (`chandassu.js`)

- **Syllable splitting** — parses Telugu Unicode (consonants, vowels, mātras, virama,
  anusvāram/visargam) into aksharaalu.
- **Laghu / guru** — a syllable is **guru** if: its vowel is deergham (long); it carries
  anusvāram (ం) or visargam (ః); it has a coda half-consonant (e.g. word-final న్); or it
  is followed by a samyuktākṣaram (conjunct). Otherwise **laghu**. (Arasunna ఁ does not
  force guru; paadaanta syllable is read flexibly.)
- **Gaṇa grouping & verification** —
  - **ఆటవెలది** (Vemana): odd paadas = 3 sūrya + 2 indra gaṇaalu; even paadas = 5 sūrya.
  - **కంద పద్యం** (Sumati): all caturmātra gaṇaalu (3 per odd paada, 5 per even), plus the
    positional rules (odd gaṇa ≠ ja; 6th gaṇa = ja or nala).
  - **ఉత్పలమాల / చంపకమాల** (Dāśarathi): exact gaṇa-sequence (bha-ra-na-bha-bha-ra-la-ga /
    na-ja-bha-ja-ja-ja-ra) match.

### Run the verifier

```bash
node padyaalu/verify.cjs        # ✓/✗ per poem; non-zero exit if any fail
node padyaalu/verify.cjs -v     # also print the gaṇa breakdown for each paada
```

The verifier is a genuine correctness check: while seeding, it caught a mistyped Sumati
line (an extra syllable → 21 mātras where a kanda paada needs 20), which was then fixed.

## Running the app

Because the data is in separate JSON files, the page must be **served over HTTP**
(browsers block `fetch` of local files over `file://`):

```bash
python3 -m http.server        # then open http://localhost:8000/padyaalu/
```

## Current status

**Working app + verified engine.** Seed corpus:

| Śatakam | Metre | Poems | Verified |
|---|---|---|---|
| Vemana (వేమన) | ఆటవెలది | 4 | ✓ |
| Sumati (సుమతీ) | కంద పద్యం | 2 | ✓ |
| Dāśarathi (దాశరథి) | ఉత్పలమాల / చంపకమాల | 0 | — |

> **On the full corpus:** the intended source (andhrabharati.com) and every other
> external content site (Wikisource, etc.) are **blocked by this environment's network
> policy**, so the complete texts of the three śatakams could not be fetched here. The
> app, data schema, Telugu meanings, and the chandassu engine are all built and proven
> on a verified seed set; the corpus can be grown as soon as the poem texts are available
> (see next steps).

## Planned next steps

1. **Ingest the full corpus** — Vemana, Sumati, Dāśarathi (each ~100+ padyaalu) once the
   source is reachable or the texts are supplied. Every ingested poem is auto-checked by
   `verify.cjs`.
2. **Draft prati padārtham + tātparyam (Telugu)** for the corpus.
3. **Reading niceties** — per-śatakam view, search, and yati/prāsa checks in the engine.
