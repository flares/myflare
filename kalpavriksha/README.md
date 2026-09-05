# Kalpavriksha

A tree that grows a leaf every time you tap it, and says *Sri Rama* each time.

That is the whole app. One full-page tree, one button. No text on the page, no
score, no streak, no encouragement — nothing to read, nothing to interpret.
Just something to tap while your head is loud.

It starts as a single stem with one leaf, close up. As leaves accumulate it
grows twigs, then branches, then a canopy, and the camera pulls back to keep
the whole tree in frame. It is designed to still be a tree — and still be
smooth — past a lakh of taps.

## Using it

- **Tap anywhere** on the tree: a leaf sprouts, a ripple spreads from your
  finger, the chant plays.
- **Details** (the only button, bottom centre): day-wise leaf counts, a running
  total, a copy button, and the link back to the myflare hub.
- Installable to the home screen and works offline (PWA).

Space or Enter also grows a leaf, for keyboard use.

## Audio

`audio.js` looks for `audio/sri-rama.mp3` (then `.m4a`, `.ogg`, `.wav`) and uses
it if present. Until then it plays a synthesized stand-in so the app is never
silent. See [`audio/README.md`](audio/README.md) for what to drop in.

## How it holds up at a lakh

The whole design follows from one constraint: this has to still be a tree, and
still hold a smooth frame rate, after 100,000+ taps on a phone.

**Nothing is stored per leaf.** The tree is a pure function of the leaf count:

```
count → depth → binary skeleton → N twigs → leaves spread across twigs
```

Storage is the running total plus a per-day map, and writes are debounced —
a lakh of leaves costs exactly what ten costs.

**The skeleton only ever extends.** Every node's shape comes from a seed hashed
down from its parent, so adding a level grows new twigs off the existing tree
rather than reshuffling it. The trunk you saw at ten leaves is the same trunk
at a hundred thousand. Branching is sympodial — a dominant continuation plus a
lateral shoot — which reads far more like a real tree than a symmetric fork.

**The skeleton stops at 11 levels** (2048 twigs, 4095 nodes). Past that the
tree stops branching and the twigs simply carry denser foliage, which is what a
real canopy does anyway. Node count is bounded no matter how many times you tap.

**Branches that carry no leaves are not drawn.** Early on this is what gives the
plant a real seedling silhouette instead of a bare skeleton with one leaf
stuck on it.

### Rendering

| Concern | Approach |
|---|---|
| Thick limbs | One tapered quad each, filled individually. Constant-width strokes made limbs look telescoped; ending a segment at the width its continuation begins with reads as one continuous limb. Batching thousands of quads into a single `Path2D` is *not* an option — nonzero winding across the whole canvas costs ~100 ms/frame. |
| Thin twigs | Plain strokes batched into quantised width buckets — a few thousand segments for a handful of `stroke()` calls. Below a few pixels there is no visible step to fix. |
| Leaves, few | Individual sprites, fanned along the twig, up to ~1200 leaves. |
| Leaves, many | Pre-baked cluster sprites (a golden-angle rosette of leaves) blitted with `drawImage`. No per-frame gradients or paths. |
| Canopy depth | Twigs are drawn back-to-front in a fixed, precomputed z order, and tinted by height as well as depth — light from above. No per-frame sorting. |
| Overdraw | A saturated canopy is ~5× overdrawn and its back layers are invisible. Rear twigs are thinned to a budget and the survivors widened. This is the single biggest fill-rate saving. |
| Slow devices | Frame time is tracked with hysteresis; a struggling device drops the foliage budget and the floating motes, and gets them back when it recovers. |

Wind is three lazy sines plus a per-node phase, applied as a rotation relative
to the parent, so it accumulates down the tree the way real branches move —
the trunk barely stirs, the twigs swing.

## Files

```
index.html            ← canvas, the one button, details dialog
styles.css            ← mobile-first, light/dark, dialog & button chrome
tree.js               ← procedural skeleton; count → structure, leaf placement
render.js             ← camera, wind, branches, foliage, atmosphere
audio.js              ← chant playback (file if present, else synthesized)
store.js              ← debounced localStorage tally, per-day counts
app.js                ← wiring: tap → leaf → sound → tally; dialog; copy
sw.js                 ← offline app shell
manifest.webmanifest  ← PWA metadata
icons/                ← app icons (svg + png, incl. maskable)
audio/                ← drop sri-rama.mp3 here
```

Persistence key: `kalpavriksha.v1` in `localStorage`.

## Notes

- The tree is deliberately allowed to bleed off the sides of the screen. A
  phone viewport is far taller than a tree is wide; fitting the width exactly
  left the top two-thirds of the screen empty.
- The home link lives inside the Details dialog rather than in a footer, so the
  page itself stays at exactly one button.
