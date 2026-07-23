# Forest Friends 🌲🐻

A voice-controlled forest for little kids. A letter appears in the bottom-right;
the child says an animal for that letter and it walks into the forest making its
own sound. Say **any** animal to bring it in or send it home — in English **or**
Telugu.

> Part of [myflare](../). Static, offline, GitHub-Pages friendly — open
> `index.html` and play.

## How to play

1. Tap **Tap to talk** and allow the microphone.
2. A big letter shows in the bottom-right corner; the bottom row lists every
   animal that starts with that letter (the "index").
3. Say the animal and "come":
   - English: **"Bear enter"**, **"Bear come"**
   - Telugu: **"Bear raa"**, **"పులి రా"** (*puli raa* — "tiger, come")
4. The animal walks in with a sparkle and its own sound. When it matches the
   prompt letter, a new letter appears. 🎉
5. Send an animal home: **"Lion go"**, **"Lion po"** (*po* — "go"), **"Lion bye"**.
6. **No microphone?** Just **tap an animal** in the bottom row — tap again to send
   it away. Fully playable without voice.

## Command words it understands

| Action | English | Telugu (spoken) |
|---|---|---|
| Bring in | enter, come, appear, in | raa / ra, randi, vachu |
| Send home | go, out, leave, bye | po, pomma, velli |

Animal names are matched on the English name, the Telugu name (script **and**
romanized), and a list of likely mis-hearings, so "elephant", "enugu", and
"ఏనుగు" all summon the same friend.

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
