/**
 * audio.js — Forest Friends sound engine
 * -----------------------------------------------------------------------
 * A self-contained, dependency-free sound engine built entirely on top of
 * the Web Audio API. Every sound heard in the game — animal noises and
 * the background music — is synthesized on the fly using oscillators,
 * noise buffers, gain envelopes and filters. There are NO audio files,
 * NO network requests and NO base64-encoded blobs anywhere in this file.
 *
 * Public API (attached to window.GameAudio):
 *   unlock(): Promise<void>          - create/resume the AudioContext.
 *   playAnimal(soundName): void      - play a short synthesized sound.
 *   startMusic(): void               - start looping background music.
 *   stopMusic(): void                - stop the background music.
 *   isMusicOn(): boolean             - whether music is currently playing.
 *   setMusicVolume(v): void          - set music volume (0..1).
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Guard against non-browser environments (no `window`), e.g. if this
  // file is accidentally required from Node.js or a build/lint tool.
  if (typeof window === 'undefined') {
    return;
  }

  // -----------------------------------------------------------------------
  // Shared audio context / master bus
  // -----------------------------------------------------------------------

  var audioCtx = null;      // Single shared AudioContext, created lazily.
  var masterGain = null;    // Master output gain node (moderate volume).
  var musicGain = null;     // Dedicated gain node for background music.

  var MASTER_VOLUME = 0.9;      // Overall ceiling so nothing clips/harshes.
  var DEFAULT_MUSIC_VOLUME = 0.08;

  /**
   * Lazily create the AudioContext and the master gain bus.
   * Wrapped in try/catch because some environments (very old browsers,
   * certain locked-down webviews) may not support Web Audio at all, and
   * we never want a missing feature to throw and break the game.
   */
  function ensureContext() {
    if (audioCtx) return audioCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();

      masterGain = audioCtx.createGain();
      masterGain.gain.value = MASTER_VOLUME;
      masterGain.connect(audioCtx.destination);

      musicGain = audioCtx.createGain();
      musicGain.gain.value = DEFAULT_MUSIC_VOLUME;
      musicGain.connect(masterGain);
    } catch (err) {
      // Web Audio unsupported or blocked — fail silently, game should
      // continue to work without sound.
      audioCtx = null;
      masterGain = null;
      musicGain = null;
    }
    return audioCtx;
  }

  // -----------------------------------------------------------------------
  // Small helpers shared by all synthesized sounds
  // -----------------------------------------------------------------------

  /** Current context time, or 0 if no context is available. */
  function now() {
    return audioCtx ? audioCtx.currentTime : 0;
  }

  /**
   * Apply a smooth attack/decay envelope to a GainNode so that sounds
   * never start or stop abruptly (avoids clicks/pops). All gain changes
   * use ramps rather than instant `setValueAtTime` jumps to (or through)
   * silence.
   *
   * @param {GainNode} gainNode
   * @param {number} startTime      - context time the sound should begin
   * @param {number} attack         - seconds to ramp up to peak
   * @param {number} sustainLevel   - peak gain level
   * @param {number} duration       - total sound duration (seconds)
   * @param {number} release        - seconds to ramp down to (near) 0
   */
  function envelope(gainNode, startTime, attack, sustainLevel, duration, release) {
    var g = gainNode.gain;
    var endTime = startTime + duration;
    var releaseStart = Math.max(startTime + attack, endTime - release);
    g.cancelScheduledValues(startTime);
    g.setValueAtTime(0.0001, startTime);
    g.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0001), startTime + attack);
    g.setValueAtTime(Math.max(sustainLevel, 0.0001), releaseStart);
    g.exponentialRampToValueAtTime(0.0001, endTime);
    // Fully silence just after, so nothing is ever left at -inf dB forever.
    g.linearRampToValueAtTime(0, endTime + 0.02);
  }

  /**
   * Create a white-noise AudioBufferSourceNode of a given duration.
   * Used as the raw material for hisses, roars, growls, screeches, etc.
   */
  function createNoiseSource(duration) {
    var sampleRate = audioCtx.sampleRate;
    var frameCount = Math.max(1, Math.floor(sampleRate * duration));
    var buffer = audioCtx.createBuffer(1, frameCount, sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    var src = audioCtx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  /**
   * Create an oscillator + gain "voice" and connect it to the master bus
   * (optionally through extra nodes). Returns { osc, gain }.
   */
  function createVoice(type, freq, destination) {
    var osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    var gain = audioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(destination || masterGain);
    return { osc: osc, gain: gain };
  }

  /** Add a simple sine-wave vibrato to an oscillator's frequency param. */
  function addVibrato(targetOsc, startTime, duration, rate, depth) {
    var lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    var lfoGain = audioCtx.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain);
    lfoGain.connect(targetOsc.frequency);
    lfo.start(startTime);
    lfo.stop(startTime + duration + 0.05);
    return lfo;
  }

  /** Safely start then stop a source/oscillator node at given times. */
  function playNode(node, startTime, stopTime) {
    try {
      node.start(startTime);
      node.stop(stopTime);
    } catch (e) {
      /* no-op: node may already be scheduled/stopped in edge cases */
    }
  }

  // -----------------------------------------------------------------------
  // Individual animal-sound synthesizers
  // Each function schedules everything relative to `t0` (a context time)
  // and is responsible for its own cleanup (nodes stop themselves).
  // -----------------------------------------------------------------------

  /** roar: low sawtooth + noise, downward pitch sweep, filtered. */
  function synthRoar(t0) {
    var duration = 1.3;
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t0);
    filter.frequency.exponentialRampToValueAtTime(180, t0 + duration);
    filter.Q.value = 1.2;
    filter.connect(masterGain);

    var voice = createVoice('sawtooth', 140, filter);
    voice.osc.frequency.setValueAtTime(140, t0);
    voice.osc.frequency.exponentialRampToValueAtTime(55, t0 + duration);
    envelope(voice.gain, t0, 0.15, 0.5, duration, 0.5);

    var noise = createNoiseSource(duration);
    var noiseGain = audioCtx.createGain();
    var noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(700, t0);
    noiseFilter.frequency.exponentialRampToValueAtTime(150, t0 + duration);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    envelope(noiseGain, t0, 0.1, 0.25, duration, 0.5);

    playNode(voice.osc, t0, t0 + duration + 0.05);
    playNode(noise, t0, t0 + duration + 0.05);
  }

  /** growl: shorter, rougher version of roar. */
  function synthGrowl(t0) {
    var duration = 0.7;
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t0);
    filter.frequency.exponentialRampToValueAtTime(160, t0 + duration);
    filter.Q.value = 3;
    filter.connect(masterGain);

    var voice = createVoice('sawtooth', 110, filter);
    voice.osc.frequency.setValueAtTime(110, t0);
    voice.osc.frequency.exponentialRampToValueAtTime(70, t0 + duration);
    envelope(voice.gain, t0, 0.05, 0.55, duration, 0.3);

    var noise = createNoiseSource(duration);
    var noiseGain = audioCtx.createGain();
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    envelope(noiseGain, t0, 0.05, 0.3, duration, 0.3);

    playNode(voice.osc, t0, t0 + duration + 0.05);
    playNode(noise, t0, t0 + duration + 0.05);
  }

  /** Quick repeated blips shared by chirp/tweet/quack/cluck (parameterized). */
  function repeatedBlips(t0, count, blipDuration, gap, waveform, freqStart, freqEnd, peakGain) {
    var t = t0;
    for (var i = 0; i < count; i++) {
      var voice = createVoice(waveform, freqStart, masterGain);
      voice.osc.frequency.setValueAtTime(freqStart, t);
      voice.osc.frequency.exponentialRampToValueAtTime(freqEnd, t + blipDuration);
      envelope(voice.gain, t, blipDuration * 0.2, peakGain, blipDuration, blipDuration * 0.5);
      playNode(voice.osc, t, t + blipDuration + 0.05);
      t += blipDuration + gap;
    }
    return t; // returns end time
  }

  /** chirp: quick high sine blips (bird-like, bright). */
  function synthChirp(t0) {
    repeatedBlips(t0, 3, 0.11, 0.07, 'sine', 2600, 3400, 0.35);
  }

  /** tweet: similar to chirp but triangle and slightly lower/slower. */
  function synthTweet(t0) {
    repeatedBlips(t0, 3, 0.14, 0.09, 'triangle', 2000, 2800, 0.35);
  }

  /** squeak: very short single high blip. */
  function synthSqueak(t0) {
    var duration = 0.18;
    var voice = createVoice('sine', 1800, masterGain);
    voice.osc.frequency.setValueAtTime(1800, t0);
    voice.osc.frequency.exponentialRampToValueAtTime(2600, t0 + duration);
    envelope(voice.gain, t0, 0.02, 0.3, duration, 0.1);
    playNode(voice.osc, t0, t0 + duration + 0.05);
  }

  /** click: extremely short high blip (shorter/plainer than squeak). */
  function synthClick(t0) {
    var duration = 0.06;
    var voice = createVoice('square', 2200, masterGain);
    envelope(voice.gain, t0, 0.005, 0.25, duration, 0.03);
    playNode(voice.osc, t0, t0 + duration + 0.03);
  }

  /** trumpet: elephant call — brassy sawtooth, rising then falling pitch. */
  function synthTrumpet(t0) {
    var duration = 1.1;
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    filter.Q.value = 1;
    filter.connect(masterGain);

    var voice = createVoice('sawtooth', 220, filter);
    var rise = duration * 0.35;
    voice.osc.frequency.setValueAtTime(220, t0);
    voice.osc.frequency.exponentialRampToValueAtTime(520, t0 + rise);
    voice.osc.frequency.exponentialRampToValueAtTime(300, t0 + duration);

    // Slight vibrato for majesty near the sustain/peak.
    addVibrato(voice.osc, t0 + rise * 0.5, duration - rise * 0.5, 6, 12);

    envelope(voice.gain, t0, 0.08, 0.45, duration, 0.35);
    playNode(voice.osc, t0, t0 + duration + 0.05);

    // A second detuned voice fattens the brassy tone.
    var voice2 = createVoice('sawtooth', 221, filter);
    voice2.osc.detune.value = 8;
    voice2.osc.frequency.setValueAtTime(220, t0);
    voice2.osc.frequency.exponentialRampToValueAtTime(520, t0 + rise);
    voice2.osc.frequency.exponentialRampToValueAtTime(300, t0 + duration);
    envelope(voice2.gain, t0, 0.08, 0.25, duration, 0.35);
    playNode(voice2.osc, t0, t0 + duration + 0.05);
  }

  /** hiss: filtered white noise (snake). */
  function synthHiss(t0) {
    var duration = 0.9;
    var noise = createNoiseSource(duration);
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 5500;
    filter.Q.value = 0.8;
    var gain = audioCtx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    envelope(gain, t0, 0.08, 0.3, duration, 0.4);
    playNode(noise, t0, t0 + duration + 0.05);
  }

  /** screech: filtered noise plus a high sweeping tone. */
  function synthScreech(t0) {
    var duration = 0.8;
    var noise = createNoiseSource(duration);
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, t0);
    filter.frequency.exponentialRampToValueAtTime(6000, t0 + duration);
    filter.Q.value = 6;
    var noiseGain = audioCtx.createGain();
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);
    envelope(noiseGain, t0, 0.03, 0.28, duration, 0.3);
    playNode(noise, t0, t0 + duration + 0.05);

    var voice = createVoice('sawtooth', 2500, masterGain);
    voice.osc.frequency.setValueAtTime(2000, t0);
    voice.osc.frequency.exponentialRampToValueAtTime(4500, t0 + duration * 0.6);
    voice.osc.frequency.exponentialRampToValueAtTime(2200, t0 + duration);
    envelope(voice.gain, t0, 0.03, 0.18, duration, 0.3);
    playNode(voice.osc, t0, t0 + duration + 0.05);
  }

  /** howl: long rising-then-falling sine with vibrato (wolf). */
  function synthHowl(t0) {
    var duration = 1.5;
    var rise = duration * 0.3;
    var voice = createVoice('sine', 300, masterGain);
    voice.osc.frequency.setValueAtTime(280, t0);
    voice.osc.frequency.exponentialRampToValueAtTime(620, t0 + rise);
    voice.osc.frequency.exponentialRampToValueAtTime(260, t0 + duration);
    addVibrato(voice.osc, t0 + rise, duration - rise, 5.5, 18);
    envelope(voice.gain, t0, 0.2, 0.4, duration, 0.5);
    playNode(voice.osc, t0, t0 + duration + 0.05);
  }

  /** moo: low sustained tone (cow). */
  function synthMoo(t0) {
    var duration = 1.1;
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.connect(masterGain);
    var voice = createVoice('sawtooth', 180, filter);
    voice.osc.frequency.setValueAtTime(150, t0);
    voice.osc.frequency.linearRampToValueAtTime(190, t0 + 0.3);
    voice.osc.frequency.linearRampToValueAtTime(140, t0 + duration);
    addVibrato(voice.osc, t0 + 0.2, duration - 0.2, 4, 6);
    envelope(voice.gain, t0, 0.15, 0.4, duration, 0.4);
    playNode(voice.osc, t0, t0 + duration + 0.05);
  }

  /** baa: wavering mid tone (sheep). */
  function synthBaa(t0) {
    var duration = 0.8;
    var voice = createVoice('sawtooth', 400, masterGain);
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    voice.gain.disconnect();
    voice.gain.connect(filter);
    filter.connect(masterGain);
    voice.osc.frequency.setValueAtTime(380, t0);
    voice.osc.frequency.linearRampToValueAtTime(430, t0 + duration * 0.5);
    voice.osc.frequency.linearRampToValueAtTime(360, t0 + duration);
    addVibrato(voice.osc, t0, duration, 9, 25);
    envelope(voice.gain, t0, 0.08, 0.3, duration, 0.3);
    playNode(voice.osc, t0, t0 + duration + 0.05);
  }

  /** oink: two short nasal grunty bursts (pig). */
  function synthOink(t0) {
    var burstDuration = 0.22;
    var gap = 0.12;
    for (var i = 0; i < 2; i++) {
      var t = t0 + i * (burstDuration + gap);
      var filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.connect(masterGain);
      var voice = createVoice('sawtooth', 220, filter);
      voice.osc.frequency.setValueAtTime(180, t);
      voice.osc.frequency.exponentialRampToValueAtTime(260, t + burstDuration * 0.5);
      voice.osc.frequency.exponentialRampToValueAtTime(150, t + burstDuration);
      envelope(voice.gain, t, 0.02, 0.4, burstDuration, 0.15);
      playNode(voice.osc, t, t + burstDuration + 0.05);
    }
  }

  /** meow: two-syllable pitch glide (cat). */
  function synthMeow(t0) {
    var seg1 = 0.28, gap = 0.05, seg2 = 0.32;
    var v1 = createVoice('sawtooth', 600, masterGain);
    var filter1 = audioCtx.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.frequency.value = 2200;
    v1.gain.disconnect();
    v1.gain.connect(filter1);
    filter1.connect(masterGain);
    v1.osc.frequency.setValueAtTime(500, t0);
    v1.osc.frequency.exponentialRampToValueAtTime(850, t0 + seg1);
    envelope(v1.gain, t0, 0.03, 0.3, seg1, 0.08);
    playNode(v1.osc, t0, t0 + seg1 + 0.05);

    var t2 = t0 + seg1 + gap;
    var v2 = createVoice('sawtooth', 750, masterGain);
    var filter2 = audioCtx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 2000;
    v2.gain.disconnect();
    v2.gain.connect(filter2);
    filter2.connect(masterGain);
    v2.osc.frequency.setValueAtTime(800, t2);
    v2.osc.frequency.exponentialRampToValueAtTime(420, t2 + seg2);
    envelope(v2.gain, t2, 0.02, 0.3, seg2, 0.15);
    playNode(v2.osc, t2, t2 + seg2 + 0.05);
  }

  /** bark: two short sharp bursts (dog). */
  function synthBark(t0) {
    var burstDuration = 0.14;
    var gap = 0.1;
    for (var i = 0; i < 2; i++) {
      var t = t0 + i * (burstDuration + gap);
      var filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1600;
      filter.connect(masterGain);
      var voice = createVoice('sawtooth', 350, filter);
      voice.osc.frequency.setValueAtTime(420, t);
      voice.osc.frequency.exponentialRampToValueAtTime(220, t + burstDuration);
      envelope(voice.gain, t, 0.005, 0.45, burstDuration, 0.06);
      playNode(voice.osc, t, t + burstDuration + 0.03);
    }
  }

  /** quack: 2-3 nasal blips (duck). */
  function synthQuack(t0) {
    var t = t0;
    for (var i = 0; i < 3; i++) {
      var duration = 0.13;
      var filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      filter.Q.value = 2;
      filter.connect(masterGain);
      var voice = createVoice('sawtooth', 500, filter);
      voice.osc.frequency.setValueAtTime(550, t);
      voice.osc.frequency.exponentialRampToValueAtTime(350, t + duration);
      envelope(voice.gain, t, 0.01, 0.35, duration, 0.08);
      playNode(voice.osc, t, t + duration + 0.03);
      t += duration + 0.06;
    }
  }

  /** cluck: 2-4 quick blips (chicken). */
  function synthCluck(t0) {
    repeatedBlips(t0, 4, 0.08, 0.06, 'triangle', 700, 500, 0.3);
  }

  /** ribbit: short two-part croak using low square wave (frog). */
  function synthRibbit(t0) {
    var seg1 = 0.12, seg2 = 0.18, gap = 0.04;
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.connect(masterGain);

    var v1 = createVoice('square', 220, filter);
    v1.osc.frequency.setValueAtTime(180, t0);
    v1.osc.frequency.linearRampToValueAtTime(260, t0 + seg1);
    envelope(v1.gain, t0, 0.01, 0.3, seg1, 0.05);
    playNode(v1.osc, t0, t0 + seg1 + 0.03);

    var t2 = t0 + seg1 + gap;
    var v2 = createVoice('square', 150, filter);
    v2.osc.frequency.setValueAtTime(150, t2);
    v2.osc.frequency.linearRampToValueAtTime(100, t2 + seg2);
    envelope(v2.gain, t2, 0.01, 0.3, seg2, 0.08);
    playNode(v2.osc, t2, t2 + seg2 + 0.03);
  }

  /** buzz: amplitude-modulated mid sawtooth (bee). */
  function synthBuzz(t0) {
    var duration = 0.9;
    var carrier = createVoice('sawtooth', 250, masterGain);
    // Amplitude-modulate the carrier's gain with a fast LFO for a buzzy feel.
    var lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 28;
    var lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain);
    lfoGain.connect(carrier.gain.gain); // modulate the gain param itself

    carrier.osc.frequency.setValueAtTime(230, t0);
    carrier.osc.frequency.linearRampToValueAtTime(270, t0 + duration * 0.5);
    carrier.osc.frequency.linearRampToValueAtTime(230, t0 + duration);

    envelope(carrier.gain, t0, 0.1, 0.25, duration, 0.3);
    playNode(carrier.osc, t0, t0 + duration + 0.05);
    playNode(lfo, t0, t0 + duration + 0.05);
  }

  /** neigh: descending whinny with fast vibrato (horse). */
  function synthNeigh(t0) {
    var duration = 1.0;
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
    filter.connect(masterGain);
    var voice = createVoice('sawtooth', 500, filter);
    voice.osc.frequency.setValueAtTime(600, t0);
    voice.osc.frequency.exponentialRampToValueAtTime(750, t0 + 0.15);
    voice.osc.frequency.exponentialRampToValueAtTime(280, t0 + duration);
    addVibrato(voice.osc, t0, duration, 14, 35);
    envelope(voice.gain, t0, 0.05, 0.35, duration, 0.4);
    playNode(voice.osc, t0, t0 + duration + 0.05);
  }

  /** hoot: soft two-note owl call. */
  function synthHoot(t0) {
    var noteDuration = 0.28, gap = 0.12;
    var freqs = [500, 400];
    var t = t0;
    for (var i = 0; i < freqs.length; i++) {
      var voice = createVoice('sine', freqs[i], masterGain);
      voice.osc.frequency.setValueAtTime(freqs[i] * 1.1, t);
      voice.osc.frequency.exponentialRampToValueAtTime(freqs[i], t + noteDuration);
      envelope(voice.gain, t, 0.05, 0.28, noteDuration, 0.15);
      playNode(voice.osc, t, t + noteDuration + 0.05);
      t += noteDuration + gap;
    }
  }

  /** generic: friendly neutral two-note chime (fallback). */
  function synthGeneric(t0) {
    var noteDuration = 0.3, gap = 0.05;
    var freqs = [523.25, 659.25]; // C5, E5 — simple, pleasant.
    var t = t0;
    for (var i = 0; i < freqs.length; i++) {
      var voice = createVoice('triangle', freqs[i], masterGain);
      envelope(voice.gain, t, 0.02, 0.3, noteDuration, 0.15);
      playNode(voice.osc, t, t + noteDuration + 0.05);
      t += noteDuration + gap;
    }
  }

  // Lookup table mapping sound category name -> synth function.
  var ANIMAL_SYNTHS = {
    roar: synthRoar,
    growl: synthGrowl,
    chirp: synthChirp,
    tweet: synthTweet,
    squeak: synthSqueak,
    trumpet: synthTrumpet,
    hiss: synthHiss,
    howl: synthHowl,
    moo: synthMoo,
    baa: synthBaa,
    oink: synthOink,
    meow: synthMeow,
    bark: synthBark,
    quack: synthQuack,
    cluck: synthCluck,
    ribbit: synthRibbit,
    buzz: synthBuzz,
    neigh: synthNeigh,
    hoot: synthHoot,
    screech: synthScreech,
    click: synthClick,
    generic: synthGeneric
  };

  // -----------------------------------------------------------------------
  // Background music
  // -----------------------------------------------------------------------
  // A gentle, looping, kid-friendly melody in C major pentatonic, played
  // with a soft triangle-wave voice and scheduled ahead of time using the
  // classic "lookahead scheduler" pattern (checks audioCtx.currentTime on
  // an interval and schedules any notes that fall within the lookahead
  // window). This keeps timing sample-accurate even though setInterval
  // itself is not.

  var musicState = {
    playing: false,
    schedulerId: null,
    nextNoteTime: 0,
    noteIndex: 0
  };

  // A cheerful, simple pentatonic melody loop (C major pentatonic: C D E G A).
  // Each entry is [frequency in Hz, duration in beats]. A "beat" is scaled
  // by MUSIC_BEAT_SECONDS below. `0` frequency means a rest.
  var MUSIC_NOTES = [
    [523.25, 1], [587.33, 1], [659.25, 1], [783.99, 1],
    [659.25, 1], [587.33, 1], [523.25, 2],
    [0, 1],
    [659.25, 1], [783.99, 1], [880.00, 1], [783.99, 1],
    [659.25, 1], [587.33, 1], [523.25, 2],
    [0, 1]
  ];

  var MUSIC_BEAT_SECONDS = 0.34; // tempo — gentle, unhurried
  var MUSIC_LOOKAHEAD = 0.1;     // how often the scheduler wakes (seconds)
  var MUSIC_SCHEDULE_AHEAD = 0.3; // how far ahead of "now" to schedule notes

  /** Schedule a single soft triangle-wave music note with its own envelope. */
  function scheduleMusicNote(freq, startTime, duration) {
    if (freq <= 0) return; // rest — nothing to schedule
    var voice = createVoice('triangle', freq, musicGain);
    // A touch of low-pass filtering keeps the tone mellow/rounded.
    var filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    voice.gain.disconnect();
    voice.gain.connect(filter);
    filter.connect(musicGain);

    var attack = Math.min(0.08, duration * 0.2);
    var release = Math.min(0.25, duration * 0.4);
    envelope(voice.gain, startTime, attack, 1.0, duration, release);
    playNode(voice.osc, startTime, startTime + duration + 0.05);
  }

  /** The lookahead scheduler tick: fills the schedule-ahead window with notes. */
  function musicSchedulerTick() {
    if (!audioCtx || !musicState.playing) return;
    while (musicState.nextNoteTime < audioCtx.currentTime + MUSIC_SCHEDULE_AHEAD) {
      var note = MUSIC_NOTES[musicState.noteIndex % MUSIC_NOTES.length];
      var freq = note[0];
      var beats = note[1];
      var duration = beats * MUSIC_BEAT_SECONDS;

      scheduleMusicNote(freq, musicState.nextNoteTime, duration * 0.92);

      musicState.nextNoteTime += duration;
      musicState.noteIndex++;
    }
  }

  function startMusic() {
    var ctx = ensureContext();
    if (!ctx) return;
    if (musicState.playing) return; // idempotent: already running
    if (ctx.state === 'suspended') {
      // Best-effort resume; if it fails (no gesture yet) music will still
      // be scheduled and will simply begin audibly once resumed.
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    musicState.playing = true;
    musicState.noteIndex = 0;
    musicState.nextNoteTime = ctx.currentTime + 0.05;
    musicSchedulerTick();
    musicState.schedulerId = window.setInterval(musicSchedulerTick, MUSIC_LOOKAHEAD * 1000);
  }

  function stopMusic() {
    musicState.playing = false;
    if (musicState.schedulerId !== null) {
      window.clearInterval(musicState.schedulerId);
      musicState.schedulerId = null;
    }
    // Any already-scheduled notes will finish naturally with their own
    // release ramps (no abrupt cutoff), since we only stop *scheduling
    // new* notes here.
  }

  function isMusicOn() {
    return !!musicState.playing;
  }

  function setMusicVolume(v) {
    if (!musicGain) {
      // Context may not exist yet; still remember desired volume for
      // when it does get created.
      DEFAULT_MUSIC_VOLUME = clamp01(v);
      return;
    }
    var clamped = clamp01(v);
    var t = now();
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.linearRampToValueAtTime(clamped, t + 0.05);
  }

  function clamp01(v) {
    v = Number(v);
    if (isNaN(v)) return DEFAULT_MUSIC_VOLUME;
    return Math.max(0, Math.min(1, v));
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Create/resume the AudioContext. Must be invoked from within a user
   * gesture handler (e.g. a click) for autoplay policies to allow audio.
   * Safe to call multiple times — subsequent calls just ensure the
   * context is running.
   */
  function unlock() {
    return new Promise(function (resolve) {
      var ctx = ensureContext();
      if (!ctx) {
        resolve();
        return;
      }
      if (ctx.state === 'suspended') {
        ctx.resume().then(function () {
          resolve();
        }).catch(function () {
          // Even if resume fails, resolve — caller shouldn't hang forever.
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Play a short synthesized sound for the given animal/category name.
   * Unknown names fall back to the friendly "generic" chime rather than
   * throwing, so a typo never breaks the game.
   */
  function playAnimal(soundName) {
    var ctx = ensureContext();
    if (!ctx) return;
    try {
      // If the context is suspended (e.g. unlock() hasn't resolved yet on
      // some browsers), attempt a resume so sound isn't silently dropped.
      if (ctx.state === 'suspended') {
        ctx.resume().catch(function () { /* ignore */ });
      }
      var synth = ANIMAL_SYNTHS[soundName] || ANIMAL_SYNTHS.generic;
      synth(ctx.currentTime + 0.01);
    } catch (err) {
      // Never let a synthesis error bubble up into game logic.
      try { console.warn('GameAudio.playAnimal failed:', err); } catch (e2) { /* ignore */ }
    }
  }

  window.GameAudio = {
    unlock: unlock,
    playAnimal: playAnimal,
    startMusic: startMusic,
    stopMusic: stopMusic,
    isMusicOn: isMusicOn,
    setMusicVolume: setMusicVolume
  };

})();
