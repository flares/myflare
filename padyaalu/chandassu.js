/* ============================================================================
 * chandassu.js — Telugu prosody (ఛందస్సు) engine
 * ----------------------------------------------------------------------------
 * Splits a pada (line) into aksharaalu (syllables), marks each laghu (I / short)
 * or guru (U / long), groups them into ganaalu, and verifies the whole padyam
 * against a named metre (ఆటవెలది / కంద / ఉత్పలమాల / చంపకమాల).
 *
 * Runs in the browser (window.Chandassu) and in Node (module.exports).
 *
 * Laghu / guru rules — a syllable is GURU (U) when any hold, else LAGHU (I):
 *   1. its vowel is deergham (long): ఆ ఈ ఊ ౠ ఏ ఐ ఓ ఔ  /  ా ీ ూ ౄ ే ై ో ౌ
 *   2. it carries anusvaaram (ం) or visargam (ః)
 *   3. it has a coda half-consonant (e.g. word-final న్, ల్, ర్)
 *   4. it is immediately followed by a samyuktaaksharam (conjunct) — i.e. the
 *      next syllable begins with a consonant cluster
 * Arasunna (ఁ / candrabindu) does NOT force guru.
 * ==========================================================================*/
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.Chandassu = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- Telugu Unicode helpers -------------------------------------------
  const VIRAMA = 0x0c4d, ANUSVARA = 0x0c02, VISARGA = 0x0c03, CANDRABINDU = 0x0c01;
  const isConsonant = (c) => (c >= 0x0c15 && c <= 0x0c39) || (c >= 0x0c58 && c <= 0x0c5a);
  const isIndepVowel = (c) => (c >= 0x0c05 && c <= 0x0c14) || c === 0x0c60 || c === 0x0c61;
  const isVowelSign = (c) => (c >= 0x0c3e && c <= 0x0c4c) || c === 0x0c62 || c === 0x0c63;
  const isMark = (c) => c === ANUSVARA || c === VISARGA || c === CANDRABINDU;
  const LONG_INDEP = new Set([0x0c06, 0x0c08, 0x0c0a, 0x0c0f, 0x0c10, 0x0c13, 0x0c14, 0x0c60, 0x0c61]);
  const LONG_SIGN = new Set([0x0c3e, 0x0c40, 0x0c42, 0x0c44, 0x0c47, 0x0c48, 0x0c4b, 0x0c4c, 0x0c63]);

  /**
   * Split one pada into syllables with laghu/guru weights.
   * Whitespace and punctuation are ignored (scansion is continuous within a pada).
   * @returns {Array<{text, weight:'G'|'L'}>}
   */
  function splitSyllables(text) {
    const cps = [];
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (isConsonant(c) || isIndepVowel(c) || isVowelSign(c) || c === VIRAMA || isMark(c)) cps.push(c);
    }
    const syl = [];
    let i = 0;
    while (i < cps.length) {
      const c = cps[i];
      if (isIndepVowel(c)) {
        const s = { onset: 0, vowelLong: LONG_INDEP.has(c), anusvara: false, visarga: false, coda: 0, chars: [c] };
        i++;
        while (i < cps.length && isMark(cps[i])) {
          if (cps[i] === ANUSVARA) s.anusvara = true;
          else if (cps[i] === VISARGA) s.visarga = true;
          s.chars.push(cps[i]); i++;
        }
        syl.push(s);
      } else if (isConsonant(c)) {
        const s = { onset: 0, vowelLong: false, anusvara: false, visarga: false, coda: 0, chars: [c] };
        i++;
        let isCoda = false;
        // consume leading conjunct: (virama consonant)*
        while (i < cps.length && cps[i] === VIRAMA) {
          s.chars.push(cps[i]); i++;
          if (i < cps.length && isConsonant(cps[i])) {
            if (cps[i] === 0x0c30) s.hasRvattu = true; // ra as a non-first cluster member (ర-వత్తు)
            s.onset++; s.chars.push(cps[i]); i++;
          }
          else { isCoda = true; break; }              // virama with nothing after → half consonant
        }
        if (isCoda) {
          // a bare half-consonant is a coda on the PREVIOUS syllable (makes it guru)
          if (syl.length) { syl[syl.length - 1].coda += 1; syl[syl.length - 1].chars.push(...s.chars); }
          continue;
        }
        if (i < cps.length && isVowelSign(cps[i])) { s.vowelLong = LONG_SIGN.has(cps[i]); s.chars.push(cps[i]); i++; }
        while (i < cps.length && isMark(cps[i])) {
          if (cps[i] === ANUSVARA) s.anusvara = true;
          else if (cps[i] === VISARGA) s.visarga = true;
          s.chars.push(cps[i]); i++;
        }
        syl.push(s);
      } else {
        // stray mark — attach to previous
        if (isMark(c) && syl.length) {
          if (c === ANUSVARA) syl[syl.length - 1].anusvara = true;
          else if (c === VISARGA) syl[syl.length - 1].visarga = true;
          syl[syl.length - 1].chars.push(c);
        }
        i++;
      }
    }
    return syl.map((s, k) => {
      const next = syl[k + 1];
      const hard = s.vowelLong || s.anusvara || s.visarga || s.coda > 0;
      const posGuru = !!(next && next.onset >= 1);
      let weight = "L", flexible = false;
      if (hard) weight = "G";
      else if (posGuru) {
        weight = "G";
        // hrasva before a ర-వత్తు conjunct is only optionally guru (వైకల్పిక గురువు)
        if (next.hasRvattu) flexible = true;
      }
      return { text: String.fromCodePoint(...s.chars), weight, flexible };
    });
  }

  const glOf = (syls) => syls.map((s) => s.weight).join("");

  // ---- Ganaalu (patterns as G/L strings) --------------------------------
  // trisyllabic ganaalu (for vrttamulu)
  const TRI = {
    ya: "LGG", ma: "GGG", ta: "GGL", ra: "GLG", ja: "LGL", bha: "GLL", na: "LLL", sa: "LLG",
    la: "L", ga: "G",
  };
  const TRI_NAME = { LGG: "య", GGG: "మ", GGL: "త", GLG: "ర", LGL: "జ", GLL: "భ", LLL: "న", LLG: "స", L: "ల", G: "గ" };

  // suurya ganaalu (3 maatra):  న (LLL), హ/గల (GL)
  const SURYA = ["LLL", "GL"];
  // indra ganaalu:  నల(LLLL) నగ(LLLG) సల(LLGL) భ(GLL) ర(GLG) త(GGL)
  const INDRA = ["LLLL", "LLLG", "LLGL", "GLL", "GLG", "GGL"];
  // caturmaatra ganaalu (కంద):  గగ(GG) భ(GLL) జ(LGL) స(LLG) నల(LLLL)
  const C4 = ["GG", "GLL", "LGL", "LLG", "LLLL"];

  const GANA_NAME = {
    LLL: "న", GL: "గల", LLLL: "నల", LLLG: "నగ", LLGL: "సల", GLL: "భ", GLG: "ర", GGL: "త",
    GG: "గగ", LGL: "జ", LLG: "స",
  };

  // Try to partition a G/L string into a fixed sequence of gana "slots",
  // each slot being a list of allowed patterns. Returns the chosen patterns or null.
  function partition(gl, slots, idx, pos, acc) {
    if (pos === slots.length) return idx === gl.length ? acc.slice() : null;
    for (const pat of slots[pos]) {
      if (gl.startsWith(pat, idx)) {
        const r = partition(gl, slots, idx + pat.length, pos + 1, acc.concat(pat));
        if (r) return r;
      }
    }
    return null;
  }

  // Match with paadaanta flexibility: the final syllable may be read either way.
  function matchSlots(gl, slots) {
    let r = partition(gl, slots, 0, 0, []);
    if (r) return r;
    if (gl.length) {
      const flip = gl.slice(0, -1) + (gl.slice(-1) === "L" ? "G" : "L");
      r = partition(flip, slots, 0, 0, []);
      if (r) return r;
    }
    return null;
  }

  const rep = (arr, n) => Array.from({ length: n }, () => arr);

  // ---- Metre definitions -------------------------------------------------
  // Fixed vrttamulu: exact gana sequence (hence exact G/L pattern) per paada.
  const GANA_SEQ = {
    "ఉత్పలమాల": ["bha", "ra", "na", "bha", "bha", "ra", "la", "ga"], // 20, yati 10
    "చంపకమాల":  ["na", "ja", "bha", "ja", "ja", "ja", "ra"],          // 21, yati 11
    "మత్తేభం":   ["sa", "bha", "ra", "na", "ma", "ya", "la", "ga"],    // 20, yati 14
    "శార్దూలం":  ["ma", "sa", "ja", "sa", "ta", "ta", "ga"],           // 19, yati 13
  };
  const VRTTAS = Object.entries(GANA_SEQ).map(([name, seq]) => {
    const groups = seq.map((g) => TRI[g]);
    return { name, seq, groups, pattern: groups.join(""), names: groups.map((g) => TRI_NAME[g]) };
  });
  const UTPALAMALA = VRTTAS[0].pattern;
  const CHAMPAKAMALA = VRTTAS[1].pattern;

  // Match a syllable list against an exact vrtta pattern. A syllable may match
  // either weight when it is flexible (hrasva before ర-వత్తు) or paadaanta (last).
  // On success, rewrites flexible/paadaanta weights to the pattern for display.
  function matchVrtta(syls, pattern) {
    if (syls.length !== pattern.length) return false;
    for (let k = 0; k < syls.length; k++) {
      if (syls[k].weight === pattern[k]) continue;
      if (syls[k].flexible || k === syls.length - 1) continue;
      return false;
    }
    for (let k = 0; k < syls.length; k++)
      if (syls[k].flexible || k === syls.length - 1) syls[k].weight = pattern[k];
    return true;
  }

  function ganaNamesFor(patternGroups) {
    return patternGroups.map((p) => GANA_NAME[p] || TRI_NAME[p] || "?");
  }

  // ---- Per-metre analyzer -----------------------------------------------
  // Each returns { metre, paadas:[{text, syllables, ganas:[{text,gl,name}], ok, note}], ok }
  const METRES = {
    "ఆటవెలది": function (paadas) {
      return paadas.map((line, pi) => {
        const syls = splitSyllables(line);
        const gl = glOf(syls);
        const odd = pi % 2 === 0; // paadas 1,3 (index 0,2)
        const slots = odd
          ? [SURYA, SURYA, SURYA, INDRA, INDRA]
          : rep(SURYA, 5);
        const groups = matchSlots(gl, slots);
        return buildPaada(line, syls, gl, groups, groups ? groups.map((g) => GANA_NAME[g]) : null,
          odd ? "3 సూర్య + 2 ఇంద్ర గణాలు" : "5 సూర్య గణాలు");
      });
    },
    "కంద పద్యం": function (paadas) {
      // paadas 1,3 → 3 ganaalu; 2,4 → 5 ganaalu; all caturmaatra.
      const out = paadas.map((line, pi) => {
        const syls = splitSyllables(line);
        const gl = glOf(syls);
        const n = pi % 2 === 0 ? 3 : 5;
        const groups = matchSlots(gl, rep(C4, n));
        return buildPaada(line, syls, gl, groups, groups ? groups.map((g) => GANA_NAME[g]) : null,
          n + " చతుర్మాత్రా గణాలు");
      });
      // positional rules, evaluated per half (paada1+2, paada3+4)
      for (const [a, b] of [[0, 1], [2, 3]]) {
        if (!out[a].ganas || !out[b].ganas) continue;
        const half = out[a].ganas.concat(out[b].ganas); // 8 ganaalu
        half.forEach((g, k) => {
          const oneBased = k + 1;
          if (oneBased % 2 === 1 && g.gl === "LGL") tagFail(out, a, b, k, "బేసి గణం జ-గణం కారాదు");
          if (oneBased === 6 && !(g.gl === "LGL" || g.gl === "LLLL")) tagFail(out, a, b, k, "6వ గణం జ లేదా నల కావాలి");
        });
      }
      return out;
    },
  };
  // metre-name aliases
  METRES["కంద"] = METRES["కంద పద్యం"];
  // one entry per vrtta: match each paada against that vrtta's exact pattern
  for (const v of VRTTAS) {
    METRES[v.name] = (paadas) => paadas.map((line) => oneVrtta(line, v));
  }

  function oneVrtta(line, v) {
    const syls = splitSyllables(line);
    const ok = matchVrtta(syls, v.pattern);
    const p = buildPaada(line, syls, glOf(syls), ok ? v.groups : null, ok ? v.names : null, v.name);
    p.metre = v.name;
    return p;
  }

  // Auto-detect: try every vrtta, return the analysis for the first that matches.
  function detectVrtta(line) {
    for (const v of VRTTAS) { const p = oneVrtta(line, v); if (p.ok) return p; }
    const syls = splitSyllables(line);
    const p = buildPaada(line, syls, glOf(syls), null, null, "గణ క్రమం సరిపోలలేదు");
    p.metre = "?";
    return p;
  }

  // Best single metre for a whole padyam (the vrtta all paadas share).
  function detectMetre(paadas) {
    for (const v of VRTTAS) if (paadas.every((l) => matchVrtta(splitSyllables(l), v.pattern))) return v.name;
    return null;
  }

  function buildPaada(text, syls, gl, groups, names, note) {
    const p = { text, gl, syllables: syls, ok: !!groups, note, ganas: null };
    if (groups) {
      let idx = 0;
      p.ganas = groups.map((pat, gi) => {
        const cnt = pat.length;
        const chunk = syls.slice(idx, idx + cnt);
        idx += cnt;
        return { gl: pat, name: names ? names[gi] : GANA_NAME[pat] || "?", syllables: chunk,
                 text: chunk.map((s) => s.text).join("") };
      });
    }
    return p;
  }

  function tagFail(out, a, b, kInHalf, msg) {
    const na = out[a].ganas.length;
    const paada = kInHalf < na ? a : b;
    out[paada].ok = false;
    out[paada].ruleNote = (out[paada].ruleNote ? out[paada].ruleNote + "; " : "") + msg;
  }

  /**
   * Analyze a full padyam.
   * @param {string[]} paadas  the 4 (or 2) display lines of the padyam
   * @param {string} metre     metre name (ఆటవెలది / కంద పద్యం / ఉత్పలమాల / చంపకమాల)
   * @returns {{metre, ok, paadas:[...]}}
   */
  function analyze(paadas, metre) {
    let fn = METRES[metre];
    // Generic vrtta: auto-detect each paada's metre (utpala / champaka / mattebha / sardula).
    if (!fn && (metre === "వృత్తం" || metre === "ఉత్పలమాల / చంపకమాల")) {
      const res = paadas.map((line) => detectVrtta(line));
      const names = [...new Set(res.map((p) => p.metre))];
      return { metre: names.length === 1 ? names[0] : metre, ok: res.every((p) => p.ok), paadas: res };
    }
    if (!fn) {
      // unknown metre: still mark syllables, no gana grouping
      const res = paadas.map((line) => {
        const syls = splitSyllables(line);
        return buildPaada(line, syls, glOf(syls), null, null, "గణ విభజన లేదు");
      });
      return { metre, ok: false, paadas: res, unknown: true };
    }
    const res = fn(paadas);
    return { metre, ok: res.every((p) => p.ok), paadas: res };
  }

  return { splitSyllables, analyze, detectMetre, GANA_NAME, SURYA, INDRA, C4, VRTTAS, UTPALAMALA, CHAMPAKAMALA };
});
