# Forest Friends — planned extensions

Ideas to implement **later** (captured, not yet built). No work has started on
these — this file is just the backlog.

## Polish / feel
- [ ] **Slower jiggle.** Reduce the gait/jiggle speed of the animals — the
      walk/fly/swim animations currently feel too fast and busy.

## Audio
- [ ] **Forest ambience for background music.** Replace the synthesized
      background tune with genuine forest sounds (birdsong, wind, stream).
- [ ] **Realistic animal sounds.** Continue toward real recordings for the
      per-animal voices (building on the runtime Wikimedia Commons lookup +
      synth fallback already in `realsounds.js`).
- [ ] **Idle ambient calls.** Every once in a while, a roaming animal
      spontaneously makes its own sound (random, low frequency), so the forest
      feels alive even when idle.

## Background
- [ ] **AI-generated background video.** Support 3–4 background videos
      (provided by the user) that loop behind the scene, instead of / in
      addition to the CSS top-down forest.

## New voice commands — per-animal actions
- [ ] **Action verbs.** Allow commands like **"giraffe jump"**, **"giraffe
      run"** (per-animal one-off animations/behaviors). Extend the command
      grammar beyond enter/exit to a set of actions.

## New voice commands — group choreography
- [ ] **"Animals assemble"** → all animals gather for a **forest meeting**:
      they fall in line / circle up with **one animal presiding**. During the
      meeting they move only slightly. They **disperse after ~10 seconds**.
- [ ] **"Animals attention"** → everyone **pauses and stares at the screen**
      (faces forward, stops roaming) until released.
- [ ] **"Animals march"** → animals form a **battalion, 3 in a row**, in a long
      marching chain, and do a **lap around the screen** (a march-past), then
      return to normal roaming.

---
_Notes for whoever picks these up: the group-choreography items imply a small
"mode" state machine over the roaming loop (normal / assemble / attention /
march), each temporarily overriding per-instance movement targets and then
restoring free roaming. Per-animal action verbs slot into the command parser in
`game.js` (`interpret()`), alongside the existing enter/exit handling._
