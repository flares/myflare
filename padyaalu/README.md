# Padyaalu (పద్యాలు)

Sub-project of **myflare**. A digital collection of Telugu **śatakamulu** (శతకాలు) —
Vemana, Sumati, Dāśarathi, and others — presented one padyam per **full-page card**,
each annotated with meaning and (eventually) prosody.

## Concept

Classical Telugu didactic poetry is written as *śatakams*: sets of ~100+ standalone
verses (padyaalu), each in a fixed meter and closing with a signature refrain
(*makuṭam*) — e.g. Vemana's *"viśvadābhirāma vinura vema."* This project collects them
so each poem gets a clean, focused, full-screen card you can read, understand, and
scan through one at a time.

## What each poem card shows

1. **Padyam (పద్యం)** — the verse itself, in Telugu, line by line, given visual priority.
2. **Prati padārtham (ప్రతిపదార్థం)** — word-by-word gloss (word → meaning).
3. **Tātparyam (తాత్పర్యం)** — the overall meaning / purport in plain prose.
4. **Chandassu (ఛందస్సు)** — *(phase 2)* the meter, and eventually a gaṇa-by-gaṇa
   scansion breakdown. For now each card names its meter and marks the full
   breakdown as coming.

## Requirements

- **Collection of many śatakams.** Start with the most-loved ones and grow:
  Vemana (వేమన), Sumati (సుమతీ), Dāśarathi (దాశరథీ), and later Bhāskara, Kṛṣṇa,
  Kumārī, Nārāyaṇa, etc.
- **One poem per full-page card**, with easy prev/next navigation (buttons +
  keyboard arrows) and a running counter.
- **Filter by śatakam** so a reader can focus on a single collection or view all.
- **Structured per-poem data** — padyam lines, prati padārtham pairs, tātparyam,
  meter — so content is easy to add and later re-render (search, print, etc.).
- **Chandassu breakdown is the eventual goal**, layered on top of the existing
  data once the reading experience is solid.

## Data model

Each poem is one record (see `data/poems.js`):

```js
{
  id: "vemana-001",
  satakam: "vemana",          // key into SATAKAMS
  number: 1,                   // sequence within this collection
  meter: "ఆటవెలది",            // chandassu (Aataveladi / Kanda / ...)
  lines: [ "...", "...", ... ],// the padyam, one string per line
  pratipadartham: [            // word-by-word gloss
    { word: "ఉప్పు", meaning: "salt" },
    ...
  ],
  tatparyam: "…plain-prose purport…",
  chandassu: null              // gaṇa breakdown — phase 2
}
```

## Current status

**Working first cut.** `index.html` is a self-contained, data-driven reading app
(vanilla JS, no backend, no external dependencies — opens straight from the file
system). It is seeded with a handful of famous, well-known padyaalu, each with
prati padārtham and tātparyam. Meters are named; the gaṇa breakdown is stubbed.

Seed content:

| Śatakam | Meter | Poems seeded |
|---|---|---|
| Vemana (వేమన) | ఆటవెలది | 4 |
| Sumati (సుమతీ) | కంద పద్యం | 2 |

## Planned next steps

1. **Grow the corpus** — more Vemana/Sumati, then Dāśarathi and other śatakams.
   (Verified transcriptions only — accuracy of the padyam text and glosses matters
   more than volume.)
2. **Chandassu engine** — name → gaṇa split → per-syllable laghu/guru scansion,
   rendered under each poem.
3. **Reading niceties** — per-śatakam view, search across padyaalu, transliteration
   toggle (Telugu ⇄ Roman), and print/share of a single card.
