# Forest Friends 🌲🐻

A voice-controlled forest for little kids. A letter appears in the bottom-right;
the child says the animal **for that letter** and it runs into the forest making
its own sound, then roams around. Summon the same animal again and again to fill
the forest with a whole family, and send them home when the crowd gets too big —
all in English **or** Telugu.

> Part of [myflare](../). Static, offline, GitHub-Pages friendly — open
> `index.html` and play.
>
> Planned future ideas live in [`ROADMAP.md`](ROADMAP.md).

## How to play

1. Tap **Tap to talk** and allow the microphone.
2. A big letter shows in the bottom-right corner; the bottom row lists every
   animal that starts with that letter (the "index"). **You may only call the
   animal for the current letter** — ask for another and the letter shakes "no".
3. Say the animal and "come":
   - English: **"Bear enter"**, **"Bear come"**
   - Telugu: **"Bear raa"**, **"పులి రా"** (*puli raa* — "tiger, come")
4. It runs, flies, or swims in with a sparkle and its own authentic recording,
   then **roams the whole forest** — birds
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
10. Open **☰ Menu → All animal sounds** to browse or search all 76 animals and
    play a real recording without summoning one into the scene.

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

## The map — a living illustrated forest

The background is the supplied 10-second illustrated forest film, preserved at
`assets/reference/living-forest-reference.mp4`. It loops silently behind a soft
light-breathing layer and drifting fireflies. On wide screens, a blurred copy
fills the sides while the complete portrait composition remains visible.
Animals roam the scene through a single `requestAnimationFrame` loop.

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

## Authentic animal field recordings

At play time the visitor's browser asks
[iNaturalist](https://www.inaturalist.org) for research-grade observations of
the animal that contain sound (`realsounds.js`). These are real field recordings
tied to an identified taxon, a source observation, a recordist and licence.
Results are cached and prefetched the moment a letter appears, so summoning is
snappy.

Broad everyday labels are mapped to explicit taxa (for example Lion →
`Panthera leo`), and only non-captive research-grade observations are requested.
If no trustworthy recording is found, the game stays quiet and says so instead
of imitating the animal with an oscillator. Nothing is fetched or bundled at
build time — the recording
is fetched by the end-user's browser, which keeps the repo tiny and adds no audio
files to host or license.

## Design notes — "publicly available assets"

The game bundles **no media files** — nothing to host, license, or ship:

- **Animals** are Unicode emoji, optically scaled into five size bands so an ant
  no longer appears as large as an elephant. The supplied forest film is bundled
  as the persistent visual reference and production background.
- **Animal sounds** use only real field recordings fetched at runtime from
  research-grade iNaturalist observations (`realsounds.js`). Each cached result
  retains its source URL, recordist attribution and licence metadata.
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
styles.css    living film treatment, responsive UI and animal gait animations
animals.js    window.ANIMALS dataset — name, emoji, Telugu name, aliases, sound
audio.js      window.GameAudio — background music and small interface cues
realsounds.js window.RealSounds — taxon-identified recordings from iNaturalist
game.js       game core — speech, command parsing, sizing and roaming motions
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

The animal dataset, authentic recording resolver and background-music engine are
independent modules wired into the game core.
