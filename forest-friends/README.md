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
4. It runs in from a random side with a sparkle and its own sound, then **roams
   the forest continuously**. 🎉
5. **Summon it again and again** — several copies of the same animal roam together
   ("Lion enter, Lion enter, Lion enter" → three lions). The chip shows a live
   count badge.
6. Send some home by name with an optional number: **"Lion exit"** (one) or
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

## How animals move

Once summoned, every animal is driven by a single `requestAnimationFrame` loop
(`game.js`): it walks in from off-screen, then wanders left/right with a gentle
waddle and bob, turning at random intervals and bouncing off the edges. Each
instance has its own speed, size (a little depth variation), and phase, so a herd
never marches in lockstep. Sending one home just steers it off the nearest edge.

## Design notes — "publicly available assets"

Everything is generated on the device, so there are **no downloads, no external
requests, and nothing to break offline**:

- **Animals & scenery** are **Unicode emoji** — a public, cross-platform asset set
  rendered by the OS (🐻 🦁 🐘 🌲 🌞). No image files to host or license.
- **Animal sounds & background music** are **synthesized live** with the Web Audio
  API (`audio.js`) — oscillators, noise and gain envelopes shaped into a roar, a
  chirp, an elephant trumpet, etc., plus a soft looping pentatonic tune. No audio
  files, so nothing to hotlink or attribute.
- **Voice input** uses the browser's built-in **Web Speech API**
  (`SpeechRecognition`) — best support in Chrome/Edge. Where it's unavailable the
  tap-to-summon fallback keeps the game fully playable.

## Files

```
index.html    scene markup, control bar, letter card, index row, help overlay
styles.css    the forest (CSS gradients + emoji), animals, animations
animals.js    window.ANIMALS dataset — name, emoji, Telugu name, aliases, sound
audio.js      window.GameAudio — synthesized animal sounds + background music
game.js       game core — speech recognition, command parsing, scene, letter index
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
