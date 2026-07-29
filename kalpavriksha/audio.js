/* audio.js — the "Sri Rama" utterance played on every tap.
 *
 * Two paths, in priority order:
 *   1. A real recording at audio/sri-rama.{mp3,m4a,ogg,wav}. Drop the file in
 *      and it is picked up automatically — no code change needed.
 *   2. A synthesized stand-in: two soft struck tones, one per word, so the app
 *      is never silent while the recording is missing.
 *
 * Everything runs off one AudioContext and one decoded buffer, so the hundred
 * thousandth tap is exactly as cheap as the first.
 */
var Chant = (function () {
  'use strict';

  var CANDIDATES = [
    'audio/sri-rama.mp3',
    'audio/sri-rama.m4a',
    'audio/sri-rama.ogg',
    'audio/sri-rama.wav'
  ];

  var MIN_GAP = 90;   /* ms between voices — rapid tapping stays pleasant */
  var MAX_VOICES = 5;

  var ctx = null;
  var master = null;
  var buffer = null;
  var lookedForFile = false;
  var lastAt = 0;
  var voices = 0;

  function ensureContext() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  function lookForFile() {
    if (lookedForFile || !ctx) return;
    lookedForFile = true;

    var i = 0;
    (function next() {
      if (i >= CANDIDATES.length) return;
      var url = CANDIDATES[i++];
      fetch(url, { cache: 'force-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error('missing');
          return res.arrayBuffer();
        })
        .then(function (bytes) {
          /* A GitHub Pages 404 page would decode to nothing; guard on size. */
          if (bytes.byteLength < 1024) throw new Error('not audio');
          return ctx.decodeAudioData(bytes);
        })
        .then(function (decoded) { buffer = decoded; })
        .catch(next);
    })();
  }

  function releaseVoice() { voices = Math.max(0, voices - 1); }

  function playBuffer(t0) {
    var src = ctx.createBufferSource();
    var gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = 0.9;
    src.connect(gain);
    gain.connect(master);
    src.onended = releaseVoice;
    src.start(t0);
  }

  /* One struck syllable: a soft body plus a quieter octave, quickly damped. */
  function syllable(t0, freq, dur, level) {
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t0);
    filter.frequency.exponentialRampToValueAtTime(700, t0 + dur);
    filter.Q.value = 0.6;

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(level, t0 + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    filter.connect(gain);
    gain.connect(master);

    var body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(freq, t0);
    body.connect(filter);
    body.start(t0);
    body.stop(t0 + dur + 0.02);

    var shimmer = ctx.createOscillator();
    var shimmerGain = ctx.createGain();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(freq * 2.02, t0);
    shimmerGain.gain.setValueAtTime(0.32, t0);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(filter);
    shimmer.start(t0);
    shimmer.stop(t0 + dur + 0.02);

    body.onended = releaseVoice;
  }

  /* "Sri" then "Ra-ma" — a falling third, the way it is chanted. */
  function playSynth(t0) {
    voices++;                       /* the pair counts as one voice */
    syllable(t0, 329.63, 0.42, 0.30);
    syllable(t0 + 0.20, 261.63, 0.55, 0.26);
  }

  function play() {
    var now = Date.now();
    if (now - lastAt < MIN_GAP) return;
    if (voices >= MAX_VOICES) return;
    lastAt = now;

    if (!ensureContext()) return;
    lookForFile();

    var t0 = ctx.currentTime + 0.005;
    if (buffer) {
      voices++;
      playBuffer(t0);
    } else {
      playSynth(t0);
    }
  }

  /* Called from the first real gesture so iOS unlocks the context. */
  function unlock() {
    if (!ensureContext()) return;
    lookForFile();
  }

  return { play: play, unlock: unlock, usingRecording: function () { return !!buffer; } };
})();
