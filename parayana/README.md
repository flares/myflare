# Parayana Tracker

A single-page counter for tracking daily Lalitha Sahasranama Parayana recitations toward a goal of **41**, done at an irregular pace (sometimes 3× a day, sometimes 1×).

## What it does

- A calendar grid covering a fixed 24-day span (`2026-07-18` – `2026-08-10`, configurable at the top of `app.js`).
- **Tap** a day to add one parayana to that day; the cell shades green and deepens as the count rises.
- **Long-press** a day to reset it back to zero.
- A sticky bottom bar always shows the running total against the goal (`N / 41`) with a progress bar — the thing meant to be visible the instant the page opens.
- All state lives in `localStorage` (`parayana.counts.v1`, `{ "YYYY-MM-DD": count }`) — no backend, no accounts.

## Design constraints

- Mobile-only, iPhone-first: fixed max-width column, non-zoomable viewport (`user-scalable=no`, `maximum-scale=1`), `apple-mobile-web-app-capable` for add-to-home-screen use.
- No date-range picker — the span is a constant in `app.js` (`START_DATE`, `DAYS`, `GOAL`). Change those three values to shift the tracked window; that's the intended way to "reconfigure" it rather than adding settings UI.

## Files

```
index.html   ← markup + the fixed bottom total bar
app.js       ← calendar generation, tap/long-press handling, localStorage persistence
styles.css   ← mobile-first styling, green shading scale for counts
```
