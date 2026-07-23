# Forest Friends 🌲🐻

A voice-controlled forest for little kids. A letter appears in the bottom-right;
the child says the animal **for that letter** and it runs into the forest making
its own sound, then roams around. Summon the same animal again and again to fill
the forest with a whole family, and send them home when the crowd gets too big —
all in English **or** Telugu.

> Part of [myflare](../). Static, offline, GitHub-Pages friendly — open
> `index.html` and play.

## How to play

1. Tap **Tap to talk** and allow the microphone.
2. A big letter shows in the bottom-right corner; the bottom row lists every
   animal that starts with that letter (the "index"). **You may only call the
   animal for the current letter** — ask for another and the letter shakes "no".
3. Say the animal and "come":
   - English: **"Bear enter"**, **"Bear come"**
   - Telugu: **"Bear raa"**, **"పులి రా"** (*puli raa* — "tiger, come")
4. It runs, flies, or swims in with a sparkle and its own sound (played **three
   times** so you hear the voice clearly), then **roams the whole forest** — birds
   in the sky, fish and ducks in the pond, everyone else on the ground. 🎉
   After each animal a **new letter** appears automatically.
5. **Tap any animal** to hear its sound again. 🔊
6. Bring in a **whole family at once** with a number: **"3 lions enter"** (up to
   five) — they all roam together. The chip shows a live count badge.
7. Send some home by name with an optional number: **"Lion exit"** (one) or
   **"5 lion exit"** (up to five). *po* / *go* / *bye* / *velli* all work.
7. **Special commands (work on any letter):**
   - **"exit all animals"** / "clear all" / "send everyone home" — empties the forest.
   - **"reduce zoo size"** / "too many animals" — randomly sends about half home.
8. Change the letter with **🎲 New letter**.
9. **No microphone?** **Tap an animal** in the bottom row to summon one, tap a
   roaming animal to send it home, or use the **✂️ Fewer** / **🧹 Exit all**
   buttons. Fully playable without voice.

## Command words it understands

| Action | English | Telugu (spoken) |
|---|---|---|
| Bring in | enter, come, appear, join | raa / ra, randi, vachu |
| Send home | exit, go, out, leave, bye | po, pomma, velli |
| How many | a, one, two … ten, or digits ("5 lion exit") | same |
| Empty forest | exit all / clear all / everyone out | — |
| Thin the crowd | reduce zoo (size) / too many / fewer animals | — |

Counts are capped at **5** per spoken command, and the forest holds at most
**40** animals at once. Animal names are matched on the English name, the Telugu
name (script **and** romanized), likely mis-hearings, and simple plurals, so
"elephant", "elephants", "enugu", and "ఏనుగు" all summon the same friend.

### Forgiving speech ("2 whales" heard as "to Wales")

Speech recognition mangles kids' voices constantly. Because a call is always
**gated to the current letter** (a small set of animals), we can afford to be
generous: if no exact name matches, the transcript is fuzzy-matched (Levenshtein
distance, biased toward the same first letter and similar length) against **only
the current letter's animals**. So on letter **W**, "wales" → **Whale**, "beer"
→ **Bear**, "kangaru" → **Kangaroo**. Common number homophones are handled too:
*to/too* → 2, *for* → 4, *ate* → 8. This can't leak across letters, so a
mis-hearing only ever picks a same-letter animal.

## The map — a top-down forest with a river

The background is a **bird's-eye view** of the forest: a green floor with
scattered round tree canopies, and a **river** winding across it (an SVG path
drawn by `buildRiver()`). Animals roam the whole map, driven by a single
`requestAnimationFrame` loop in `game.js`.

### Three motions, three gaits

Each animal has one of three motion types, each with its own **gait** animation
and its own way of moving:

| Motion | Gait animation | How it moves | Examples |
|---|---|---|---|
| 🐾 Walk | trotting two-step bob | wanders the whole map, bouncing off edges | lion, elephant, bear, zebra … |
| 🐦 Fly | quick wing-flap (rises & squashes, banking) | darts fast across the whole map | bat, bee, eagle, owl, parrot, vulture, nightingale |
| 🐠 Swim | slow side-to-side undulation | follows the **river** centreline up and down the stream | whale, dolphin, frog, turtle, duck, penguin, yabby … |

Walkers and fliers run/fly in from a random side; swimmers appear in the river.
Each instance has its own speed, size and phase, so a herd never marches in
lockstep. Tapping an animal replays its sound; sending one home fades it out.

## Realistic animal sounds (with an offline fallback)

Synthesized voices can only sound so real, so the game tries to play an actual
**recording** first. At play time the visitor's **browser** asks
[Wikimedia Commons](https://commons.wikimedia.org) for a freely-licensed audio
file of the animal (`realsounds.js`): Commons is HTTPS, its API allows
cross-origin requests (`origin=*`), and an HTML5 `<audio>` element plays the
returned file. Results are cached and **prefetched** the moment a letter appears,
so summoning is snappy.

If anything goes wrong — offline, request blocked, no recording for that animal,
or a decode error — it silently falls back to the built-in **synthesized** voice
(played three times). So the game still works with no network at all; it just
sounds more robotic. Nothing is fetched or bundled at build time — the recording
is fetched by the end-user's browser, which keeps the repo tiny and adds no audio
files to host or license.

## Design notes — "publicly available assets"

The game bundles **no media files** — nothing to host, license, or ship:

- **Animals & scenery** are **Unicode emoji** plus pure-CSS/SVG (the forest floor,
  canopies and river are all drawn) — a public, cross-platform asset set rendered
  by the OS. No image files.
- **Animal sounds** prefer a real **freely-licensed recording fetched at runtime
  from Wikimedia Commons** by the visitor's browser (`realsounds.js`), and fall
  back to a **live Web-Audio synthesized** voice (`audio.js`) when offline — so
  there's still nothing to bundle, and the game works with no network.
- **Background music** is always **synthesized live** (a soft looping pentatonic
  tune), no files.
- **Voice input** uses the browser's built-in **Web Speech API**
  (`SpeechRecognition`) — best support in Chrome/Edge. Where it's unavailable the
  tap-to-summon fallback keeps the game fully playable.

> The only optional network request is the Commons audio lookup, made from the
> end-user's browser at play time; everything else is 100% offline.

## Files

```
index.html    scene markup, control bar, letter card, index row, help overlay
styles.css    top-down forest, river, animals, the three gait animations
animals.js    window.ANIMALS dataset — name, emoji, Telugu name, aliases, sound
audio.js      window.GameAudio — synthesized animal sounds + background music
realsounds.js window.RealSounds — real recordings fetched from Wikimedia Commons
game.js       game core — speech, command parsing, top-down scene, river, motions
```

### Data / engine contracts

- `window.ANIMALS`: array of `{ key, name, emoji, telugu, teluguRoman, aliases[], sound }`.
  `window.animalsByLetter(letter)` returns the animals whose English name starts
  with that letter (used to build the index row). Every A–Z letter has ≥2 animals.
- `window.GameAudio`: `unlock()`, `playAnimal(soundName)`, `startMusic()`,
  `stopMusic()`, `isMusicOn()`, `setMusicVolume(v)`. Sound names are a fixed
  vocabulary (roar, growl, chirp, trumpet, buzz, meow, …) shared with the dataset.

## Browser support

- **Voice:** Chrome & Edge (desktop/Android) via the Web Speech API. Safari/iOS
  support is partial; the tap fallback always works.
- **Sound & visuals:** any modern browser with Web Audio + emoji.

## Building blocks

The animal dataset and the sound-synthesis engine were each built as an
independent module against a fixed interface, then wired into the game core here.
