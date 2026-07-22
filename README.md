# myflare

Personal web interface — a hub page (`index.html`) linking to individual sub-projects, each living in its own subfolder.

## Sub-projects

| Sub-project | Folder | Status |
|---|---|---|
| Portfolio Tracker | [`portfolio-tracker/`](portfolio-tracker/) | UI mockups under review — see [`portfolio-tracker/README.md`](portfolio-tracker/README.md) |
| Padyaalu | [`padyaalu/`](padyaalu/) | Working reading app with seed corpus — see [`padyaalu/README.md`](padyaalu/README.md) |

## Structure

```
index.html              ← main hub page with links to sub-projects
portfolio-tracker/
  README.md             ← project spec & requirements
  index.html            ← sub-project landing page
  mockups/              ← unwired UI samples for review
padyaalu/
  README.md             ← project spec & requirements
  index.html            ← full-page-card reading app
  data/poems.js         ← the padyam corpus (data)
```
