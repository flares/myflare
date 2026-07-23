# Padyaalu (పద్యాలు)

Sub-project of **myflare**. A digital collection of Telugu **śatakamulu** (శతకాలు) —
Vemana, Sumati, Dāśarathi, … — presented one padyam per **full-page card**, each with
meaning (in Telugu) and a live **chandassu** (prosody) breakdown.

> **Live status & roadmap:** open [`settings.html`](settings.html) (linked as
> **స్థితి ⚙** from the reader) for a self-updating dashboard — corpus counts, chandassu /
> meanings progress, goals, and the pending-task list. This README is the reference doc;
> that page is the at-a-glance status.

## Goals

- **Vision** — a clean, faithful, dependency-free digital home for Telugu *śataka*
  literature: every padyam on its own card with Telugu meaning and a live prosody breakdown.
- **Short-term** — finish **Dāśarathi**: verify chandassu for the remaining verses,
  reconcile the few supplied lines whose syllable counts are off, and author Telugu
  prati padārtham + tātparyam for all 104.
- **Long-term** — grow to many śatakams (Bhāskara, Kṛṣṇa, Kumārī, Nārāyaṇa…), complete
  Vemana & Sumati to their full ~100+ verses, and add search, transliteration (Telugu ⇄
  Roman), audio recitation, and deeper prosody (yati/prāsa) checks.

## Capabilities (today)

- Full-page **card reader** — filter by śatakam, prev/next + arrow-key navigation.
- **Telugu meanings** — prati padārtham (word-by-word) + tātparyam (purport).
- **Live chandassu** — per-syllable laghu/guru, named gaṇaalu, metre **auto-detection**
  (ఆటవెలది, కంద, ఉత్పలమాల, చంపకమాల, మత్తేభం, శార్దూలం), and a ✓ verification verdict.
- **Dependency-free** — the same `chandassu.js` engine runs in the browser and in Node;
  `verify.cjs` checks the whole corpus from the command line.

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
  settings.html       ← live status + goals + roadmap / pending-task list
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
  is followed by a samyuktākṣaram (conjunct). Otherwise **laghu**. Refinements:
  arasunna (ఁ) does not force guru; the paadaanta syllable reads flexibly; and a hrasva
  before a **ర-వత్తు conjunct** (ద్ర, త్ర, ప్ర, …) is only *optionally* guru
  (వైకల్పిక గురువు), so it matches either weight.
- **Gaṇa grouping & verification** —
  - **ఆటవెలది** (Vemana): odd paadas = 3 sūrya + 2 indra gaṇaalu; even paadas = 5 sūrya.
  - **కంద పద్యం** (Sumati): all caturmātra gaṇaalu (3 per odd paada, 5 per even), plus the
    positional rules (odd gaṇa ≠ ja; 6th gaṇa = ja or nala).
  - **Vṛttamulu** (Dāśarathi): exact gaṇa-sequence match for **ఉత్పలమాల**,
    **చంపకమాల**, **మత్తేభం**, and **శార్దూలం**, auto-detected per verse. Ingestion
    splits each vṛtta into 4 metrical padas at true syllable boundaries.

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

**Working app + verified engine.** Corpus:

| Śatakam | Metre | Poems | Chandassu verified | Meanings |
|---|---|---|---|---|
| Vemana (వేమన) | ఆటవెలది | 9 | ✓ all 9 | ✓ all |
| Sumati (సుమతీ) | కంద పద్యం | 8 | ✓ all 8 | ✓ all |
| Dāśarathi (దాశరథి) | ఉత్పలమాల / చంపకమాల / మత్తేభం | 104 | 63 of 104 | 3 seeded, rest pending |

**80 of 121 verses** currently pass `verify.cjs` (Vemana + Sumati fully; 63 Dāśarathi
vṛttas). The other 41 Dāśarathi verses are marked `chandassuVerified: false` — the app
still shows their syllable laghu/guru marks, just not a verified gaṇa split yet.

### Notes on the corpus

- **Vemana & Sumati** were reproduced from memory and filtered by the verifier (several
  misremembered lines were caught and dropped). Curated, engine-checked subsets — not the
  full ~100-verse śatakams.
- **Dāśarathi** — the complete 104-verse text was supplied and ingested. Ingestion splits
  each verse into 4 metrical padas and auto-detects the vṛtta; 63 verify exactly. The
  unverified 41 are mostly the longer 5-line vṛttas (mattebha/śārdūla layouts) and a few
  verses with small transcription deviations in the supplied text — to be reconciled.
- **Meanings** for Dāśarathi are the large remaining task: its verses are dense, ornate,
  Sanskrit-compound-heavy Telugu. Three are seeded (verses 16, 24, 25) to establish the
  pattern; the rest show a "త్వరలో" placeholder. External content sites remain blocked by
  the environment network policy, so meanings are authored, not fetched.

## Planned next steps

The live, always-current task list lives on [`settings.html`](settings.html). In short:

1. **Dāśarathi meanings** — author Telugu prati padārtham + tātparyam for the remaining
   ~101 verses (3 seeded).
2. **Dāśarathi chandassu** — handle the longer 5-line vṛttas (మత్తేభం / శార్దూలం layouts)
   so they split into 4 metrical padas and verify; reconcile the ~14 off-count lines.
3. **Grow the corpus** — Vemana & Sumati to full length; add more śatakams.
4. **Reading niceties** — search, per-śatakam view, transliteration, and yati/prāsa checks.
