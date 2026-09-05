# Chant audio

Drop the "Sri Rama" recording in this folder as:

```
audio/sri-rama.mp3
```

`.m4a`, `.ogg` and `.wav` are also picked up, in that order after `.mp3`. No
code change is needed — `audio.js` probes for the file once on the first tap,
decodes it, and uses it for every tap from then on.

Until a file is present the app falls back to a synthesized stand-in (two soft
struck tones, one per word) so it is never silent.

## What to aim for

- **Short.** 400–700 ms. It plays on every single tap, so anything longer will
  overlap itself and turn to mud.
- **Quiet and soft-edged.** No hard transient at the start.
- **Trimmed.** No leading silence — the delay before the sound is the delay
  between the tap and the leaf.
- **Small.** Mono, ~64 kbps is plenty. The file is cached by the service
  worker, so it also becomes part of the offline payload.

Playback is rate-limited to one voice per 90 ms and five concurrent voices, so
fast tapping stays pleasant rather than becoming a drone.
