/* ===================================================================
   Forest Friends — game core
   Ties together: the animal dataset (animals.js -> window.ANIMALS),
   the synthesized sound engine (audio.js -> window.GameAudio), the
   Web Speech API for voice commands, and the forest scene.

   Behaviour:
   - A letter is shown. The child may only call animals for that letter.
   - Summoned animals enter from a random side with their own sound and
     then roam the scene continuously (via a requestAnimationFrame loop).
   - The same animal can be summoned many times; instances accumulate.
   - "Lion exit" / "5 lion exit" removes up to N of that animal.
   - Special ungated commands: "exit all animals" and "reduce zoo size".
   =================================================================== */
(function () {
  "use strict";

  var ANIMALS = window.ANIMALS || [];
  var AUDIO = window.GameAudio || null;

  // ---- DOM handles -------------------------------------------------
  var stage        = document.getElementById("stage");
  var treeline     = document.getElementById("treeline");
  var letterGlyph  = document.getElementById("letterGlyph");
  var letterCard   = document.getElementById("letterCard");
  var indexRow     = document.getElementById("indexRow");
  var indexLetter  = document.getElementById("indexLetter");
  var indexExample = document.getElementById("indexExample");
  var indexExample2= document.getElementById("indexExample2");
  var heardBubble  = document.getElementById("heardBubble");
  var micBtn       = document.getElementById("micBtn");
  var micLabel     = document.getElementById("micLabel");
  var musicBtn     = document.getElementById("musicBtn");
  var newLetterBtn = document.getElementById("newLetterBtn");
  var clearBtn     = document.getElementById("clearBtn");
  var reduceBtn    = document.getElementById("reduceBtn");
  var langSelect   = document.getElementById("langSelect");
  var helpBtn      = document.getElementById("helpBtn");
  var helpOverlay  = document.getElementById("helpOverlay");
  var helpClose    = document.getElementById("helpClose");
  var helpStart    = document.getElementById("helpStart");

  // ---- state -------------------------------------------------------
  var currentLetter = "A";
  var instances = [];          // live roaming animals (multiple per key allowed)
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  var audioReady = false;
  var ENTER_CAP = 5;           // max instances added by a single spoken command
  var EXIT_CAP  = 5;           // max instances removed by a single spoken command
  var ZOO_CAP   = 40;          // hard ceiling on total animals roaming at once
  var stageW = 0, stageH = 0;

  // command vocabulary ------------------------------------------------
  var ENTER_WORDS = ["enter","come","comes","coming","raa","ra","randi","vachu","vachchu","vachi",
                     "appear","arrive","hello","hi","play","join"];
  var EXIT_WORDS  = ["exit","go","goes","going","out","leave","leaves","bye","goodbye",
                     "po","pommu","pomma","velli","vellu","vellipo","away","home"];
  var NUMBERS = { a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7,
                  eight:8, nine:9, ten:10, "1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10 };

  // -------------------------------------------------------------------
  //  Spoken-word -> animal lookup (longest phrase wins)
  // -------------------------------------------------------------------
  var aliasIndex = [];
  function buildAliasIndex() {
    aliasIndex.length = 0;
    ANIMALS.forEach(function (a) {
      var phrases = [a.name, a.key, a.teluguRoman].concat(a.aliases || []);
      if (a.telugu) phrases.push(a.telugu);
      phrases.forEach(function (p) { if (p) aliasIndex.push({ phrase: norm(p), animal: a }); });
    });
    aliasIndex.sort(function (x, y) { return y.phrase.length - x.phrase.length; });
  }

  function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9ఀ-౿\s]/g, " ")
            .replace(/\s+/g, " ").trim();
  }
  function has(text, word) { return text.indexOf(" " + word + " ") !== -1; }

  // -------------------------------------------------------------------
  //  Scene setup
  // -------------------------------------------------------------------
  function measureStage() {
    var r = stage.getBoundingClientRect();
    stageW = r.width; stageH = r.height;
  }

  function plantTrees() {
    var kinds = ["🌲","🌳","🌴","🌲","🌳","🎋","🌲","🌳","🌴","🌲","🌳"];
    var n = Math.max(6, Math.min(11, Math.round(window.innerWidth / 130)));
    treeline.innerHTML = "";
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.textContent = kinds[i % kinds.length];
      treeline.appendChild(s);
    }
  }

  // -------------------------------------------------------------------
  //  Letter + index bar
  // -------------------------------------------------------------------
  function animalsForLetter(L) {
    if (typeof window.animalsByLetter === "function") return window.animalsByLetter(L);
    return ANIMALS.filter(function (a) {
      return a.name.replace(/[^a-z]/i, "").charAt(0).toUpperCase() === L;
    });
  }
  function lettersWithAnimals() {
    return LETTERS.filter(function (L) { return animalsForLetter(L).length > 0; });
  }
  function firstLetterOf(a) {
    return a.name.replace(/[^a-z]/i, "").charAt(0).toUpperCase();
  }

  function setLetter(L) {
    currentLetter = L;
    letterGlyph.textContent = L;
    indexLetter.textContent = L;
    letterCard.classList.remove("bump", "nope"); void letterCard.offsetWidth;
    letterCard.classList.add("bump");
    renderIndex(L);
  }
  function randomLetter() {
    var pool = lettersWithAnimals(), next;
    do { next = pool[Math.floor(Math.random() * pool.length)]; }
    while (pool.length > 1 && next === currentLetter);
    setLetter(next);
  }

  function renderIndex(L) {
    var list = animalsForLetter(L);
    indexRow.innerHTML = "";
    if (list[0]) indexExample.textContent = list[0].name;
    if (list[1] || list[0]) indexExample2.textContent = (list[1] || list[0]).name;
    list.forEach(function (a) {
      var chip = document.createElement("button");
      chip.className = "chip";
      chip.dataset.key = a.key;
      chip.innerHTML =
        '<span class="chip-count" hidden>0</span>' +
        '<span class="chip-emoji">' + a.emoji + '</span>' +
        '<span class="chip-name">' + a.name + '</span>' +
        '<span class="chip-tel">' + (a.teluguRoman || "") + '</span>';
      chip.addEventListener("click", function () { ensureAudio(); enterN(a, 1); });
      indexRow.appendChild(chip);
    });
    refreshChips();
  }

  function countByKey(key) {
    var n = 0;
    for (var i = 0; i < instances.length; i++)
      if (instances[i].key === key && !instances[i].leaving) n++;
    return n;
  }
  function refreshChips() {
    Array.prototype.forEach.call(indexRow.children, function (chip) {
      var n = countByKey(chip.dataset.key);
      var badge = chip.querySelector(".chip-count");
      chip.classList.toggle("active", n > 0);
      badge.hidden = n === 0;
      badge.textContent = n;
    });
  }

  // -------------------------------------------------------------------
  //  Roaming engine (requestAnimationFrame)
  // -------------------------------------------------------------------
  var rafId = null, lastT = 0;

  function startLoop() {
    if (rafId == null) { lastT = performance.now(); rafId = requestAnimationFrame(tick); }
  }
  function tick(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    update(dt, now);
    rafId = instances.length ? requestAnimationFrame(tick) : null;
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function update(dt, now) {
    for (var i = instances.length - 1; i >= 0; i--) {
      var it = instances[i];
      if (it.entering) {
        it.x += it.vx * dt;
        if (it.x >= it.margin && it.x <= stageW - it.w - it.margin) {
          it.entering = false; scheduleTurn(it, now);
        }
      } else if (it.leaving) {
        it.x += it.vx * dt;
        if (it.x < -it.w - 80 || it.x > stageW + 80) { removeInstance(i); continue; }
      } else {
        it.x += it.vx * dt;
        if (it.x < it.margin) { it.x = it.margin; it.vx = Math.abs(it.vx); }
        else if (it.x > stageW - it.w - it.margin) { it.x = stageW - it.w - it.margin; it.vx = -Math.abs(it.vx); }
        if (now > it.nextTurn) scheduleTurn(it, now);
      }
      var y = it.baseTop + Math.sin(now * 0.002 + it.phase) * it.amp;
      var dir = it.vx > 0 ? -1 : 1;   // flip to face travel direction
      it.el.style.transform = "translate(" + it.x.toFixed(1) + "px," + y.toFixed(1) + "px) " +
                              "scale(" + (dir * it.scale).toFixed(3) + "," + it.scale.toFixed(3) + ")";
      it.el.style.zIndex = 100 + Math.round(it.baseTop);
    }
  }

  function scheduleTurn(it, now) {
    var speed = Math.max(24, stageW * rand(0.04, 0.10));  // px/s
    it.vx = speed * (Math.random() < 0.5 ? -1 : 1);
    it.nextTurn = now + rand(1400, 4200);
  }

  function removeInstance(i) {
    var it = instances[i];
    if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
    instances.splice(i, 1);
    refreshChips();
  }

  // -------------------------------------------------------------------
  //  Enter / exit
  // -------------------------------------------------------------------
  function spawnOne(a) {
    if (instances.length >= ZOO_CAP) {
      showBubble("🐾 The zoo is full! Say “reduce zoo size”.", true);
      return false;
    }
    measureStage();
    var el = document.createElement("div");
    el.className = "animal";
    el.innerHTML = '<span class="a-emoji">' + a.emoji + '</span>' +
                   '<span class="a-name">' + a.name + (a.teluguRoman ? " · " + a.teluguRoman : "") + '</span>';
    stage.appendChild(el);

    var box = el.getBoundingClientRect();
    var w = box.width || 90, h = box.height || 90;
    var scale = rand(0.78, 1.08);
    var side = Math.random() < 0.5 ? -1 : 1;   // -1 enters from left, 1 from right
    var enterSpeed = Math.max(120, stageW * 0.35);

    var it = {
      key: a.key, sound: a.sound, el: el, w: w * scale, h: h * scale,
      x: side < 0 ? -(w * scale) - 40 : stageW + 40,
      vx: side < 0 ? enterSpeed : -enterSpeed,
      baseTop: rand(0, Math.max(8, stageH - h * scale)),
      phase: rand(0, Math.PI * 2), amp: rand(5, 12), scale: scale,
      margin: 4, entering: true, leaving: false, nextTurn: 0
    };
    instances.push(it);

    el.addEventListener("click", function () {
      ensureAudio(); beginExit(it); playReject();  // tap a critter to send it home
    });

    playSound(a);
    sparkle(it);
    refreshChips();
    startLoop();
    return true;
  }

  // summon N instances of an animal, staggered like a little parade
  function enterN(a, n) {
    n = Math.max(1, Math.min(ENTER_CAP, n | 0));
    var made = 0;
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () { spawnOne(a); }, i * 200);
      })(i);
      made++;
    }
    showBubble((made > 1 ? made + " " : "") + a.name + (made > 1 ? "s" : "") + " coming in! " + a.emoji);
  }

  function beginExit(it) {
    if (it.leaving) return;
    it.leaving = true; it.entering = false;
    var toLeft = it.x < stageW / 2;
    it.vx = (toLeft ? -1 : 1) * Math.max(160, stageW * 0.5);
    it.el.classList.add("bye");
    refreshChips();
    startLoop();
  }

  // exit up to n instances of a given animal key
  function exitByKey(a, n) {
    n = Math.max(1, Math.min(EXIT_CAP, n | 0));
    var removed = 0;
    for (var i = 0; i < instances.length && removed < n; i++) {
      if (instances[i].key === a.key && !instances[i].leaving) { beginExit(instances[i]); removed++; }
    }
    if (removed) showBubble("👋 " + removed + " " + a.name + (removed > 1 ? "s" : "") + " going home!");
    else showBubble("No " + a.name + "s here to send home.", true);
  }

  function exitAll() {
    var n = 0;
    instances.forEach(function (it) { if (!it.leaving) { beginExit(it); n++; } });
    showBubble(n ? "👋 Bye everyone! (" + n + ")" : "The forest is already empty.");
  }

  // randomly send home about half of the roaming animals
  function reduceZoo() {
    var live = instances.filter(function (it) { return !it.leaving; });
    if (!live.length) { showBubble("Nothing to reduce — the forest is empty."); return; }
    // shuffle
    for (var i = live.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = live[i]; live[i] = live[j]; live[j] = t;
    }
    var kick = Math.ceil(live.length / 2);
    for (var k = 0; k < kick; k++) beginExit(live[k]);
    playReject();
    showBubble("✂️ Zoo trimmed! Sent " + kick + " home, " + (live.length - kick) + " left.");
  }

  function sparkle(it) {
    var marks = ["⭐","✨","🌟"];
    for (var i = 0; i < 3; i++) {
      var s = document.createElement("span");
      s.className = "sparkle";
      s.textContent = marks[i % marks.length];
      s.style.left = (it.x + it.w / 2 + rand(-20, 20)) + "px";
      s.style.top = (it.baseTop - rand(4, 20)) + "px";
      stage.appendChild(s);
      (function (s) { setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1000); })(s);
    }
  }

  function playSound(a) { if (AUDIO) try { AUDIO.playAnimal(a.sound || "generic"); } catch (e) {} }
  function playReject() { if (AUDIO) try { AUDIO.playAnimal("click"); } catch (e) {} }

  function rejectWrongLetter(a) {
    letterCard.classList.remove("nope"); void letterCard.offsetWidth; letterCard.classList.add("nope");
    showBubble("🚫 " + a.name + " starts with " + firstLetterOf(a) + " — say a " + currentLetter +
               " animal! (or “exit all”)", true);
    playReject();
  }

  // -------------------------------------------------------------------
  //  Command interpretation
  // -------------------------------------------------------------------
  function isExitAll(text) {
    return /\b(exit|clear|remove|send|out|bye)\b/.test(text) && /\b(all|everyone|everybody|every animal|everything)\b/.test(text)
        || has(text, "clear all") || has(text, "empty forest") || has(text, "empty the forest")
        || has(text, "empty zoo") || has(text, "clear forest") || has(text, "clear the forest")
        || has(text, "bye bye everyone");
  }
  function isReduce(text) {
    return (/\b(reduce|fewer|less|trim|thin|shrink|halve|half)\b/.test(text) &&
            /\b(zoo|size|animal|animals|crowd|forest)\b/.test(text))
        || has(text, "reduce zoo") || has(text, "reduce size") || has(text, "too many")
        || has(text, "too many animals") || has(text, "less animals") || has(text, "fewer animals");
  }
  function findCount(text) {
    // scan tokens for the first recognised number word or digit
    var toks = text.trim().split(" ");
    for (var i = 0; i < toks.length; i++) {
      if (Object.prototype.hasOwnProperty.call(NUMBERS, toks[i])) return NUMBERS[toks[i]];
    }
    return 1;
  }
  function findAnimal(text) {
    for (var i = 0; i < aliasIndex.length; i++) {
      var p = aliasIndex[i].phrase;
      if (!p) continue;
      // match the phrase, allowing an optional plural "s" (lion / lions)
      if (has(text, p) || has(text, p + "s")) return aliasIndex[i].animal;
    }
    return null;
  }

  function interpret(transcript) {
    var text = " " + norm(transcript) + " ";

    // special ungated commands first
    if (isReduce(text)) { reduceZoo(); return true; }
    if (isExitAll(text)) { exitAll(); return true; }

    var found = findAnimal(text);
    if (!found) return false;

    var wantsExit = EXIT_WORDS.some(function (w) { return has(text, w); });
    var wantsEnter = ENTER_WORDS.some(function (w) { return has(text, w); });
    var count = findCount(text);

    // the child may only call the animal that matches the shown letter
    if (firstLetterOf(found) !== currentLetter) { rejectWrongLetter(found); return true; }

    if (wantsExit && !wantsEnter) exitByKey(found, count);
    else enterN(found, count);
    return true;
  }

  // -------------------------------------------------------------------
  //  Heard bubble
  // -------------------------------------------------------------------
  var bubbleTimer;
  function showBubble(text, isErr) {
    heardBubble.hidden = false;
    heardBubble.textContent = text;
    heardBubble.classList.toggle("err", !!isErr);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { heardBubble.hidden = true; }, 2800);
  }

  // -------------------------------------------------------------------
  //  Speech recognition
  // -------------------------------------------------------------------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, listening = false, wantListening = false;

  function buildRecognizer() {
    if (!SR) return null;
    var r = new SR();
    r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
    r.lang = langSelect.value || "en-IN";
    r.onstart = function () { listening = true; setMicUI(true); };
    r.onerror = function (e) {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantListening = false; setMicUI(false);
        showBubble("Microphone blocked — tap animals below instead 👇", true);
      }
    };
    r.onend = function () {
      listening = false; setMicUI(false);
      if (wantListening) { try { r.start(); } catch (e) {} }
    };
    r.onresult = function (ev) {
      var handled = false, lastText = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var res = ev.results[i];
        for (var j = 0; j < res.length; j++) {
          var t = res[j].transcript;
          if (j === 0) lastText = t;
          if (res.isFinal || res[0].confidence === undefined) {
            if (interpret(t)) { handled = true; lastText = t; break; }
          }
        }
        if (handled) break;
      }
      if (lastText) showBubble("👂 " + lastText.trim());
    };
    return r;
  }

  function startListening() {
    ensureAudio();
    if (!SR) { showBubble("Voice not supported here — tap animals below 👇", true); return; }
    wantListening = true;
    if (!recog) recog = buildRecognizer();
    recog.lang = langSelect.value || "en-IN";
    try { recog.start(); } catch (e) {}
  }
  function stopListening() {
    wantListening = false;
    if (recog) { try { recog.stop(); } catch (e) {} }
    setMicUI(false);
  }
  function setMicUI(on) {
    micBtn.setAttribute("aria-pressed", on ? "true" : "false");
    micLabel.textContent = on ? "Listening…" : "Tap to talk";
  }

  // -------------------------------------------------------------------
  //  Audio unlock (needs a user gesture)
  // -------------------------------------------------------------------
  function ensureAudio() {
    if (audioReady || !AUDIO) return;
    audioReady = true;
    try { AUDIO.unlock(); } catch (e) {}
  }

  // -------------------------------------------------------------------
  //  Controls
  // -------------------------------------------------------------------
  micBtn.addEventListener("click", function () { if (wantListening) stopListening(); else startListening(); });
  musicBtn.addEventListener("click", function () {
    ensureAudio(); if (!AUDIO) return;
    if (AUDIO.isMusicOn()) { AUDIO.stopMusic(); musicBtn.setAttribute("aria-pressed", "false"); musicBtn.textContent = "🎵 Music"; }
    else { AUDIO.startMusic(); musicBtn.setAttribute("aria-pressed", "true"); musicBtn.textContent = "🔊 Music on"; }
  });
  newLetterBtn.addEventListener("click", function () { ensureAudio(); randomLetter(); });
  clearBtn.addEventListener("click", function () { ensureAudio(); exitAll(); });
  if (reduceBtn) reduceBtn.addEventListener("click", function () { ensureAudio(); reduceZoo(); });
  langSelect.addEventListener("change", function () {
    if (recog) { recog.lang = langSelect.value; if (wantListening) { try { recog.stop(); } catch (e) {} } }
    var isTe = langSelect.value === "te-IN";
    showBubble(isTe ? "తెలుగులో మాట్లాడండి — “పులి రా”" : "Say an animal — “Tiger come!”");
  });
  helpBtn.addEventListener("click", function () { helpOverlay.hidden = false; });
  helpClose.addEventListener("click", function () { helpOverlay.hidden = true; });
  helpStart.addEventListener("click", function () {
    helpOverlay.hidden = true; ensureAudio(); startListening();
    if (AUDIO && !AUDIO.isMusicOn()) { AUDIO.startMusic(); musicBtn.setAttribute("aria-pressed", "true"); musicBtn.textContent = "🔊 Music on"; }
  });
  window.addEventListener("resize", function () { plantTrees(); measureStage(); });

  // -------------------------------------------------------------------
  //  Boot
  // -------------------------------------------------------------------
  function boot() {
    if (!ANIMALS.length && window.ANIMALS && window.ANIMALS.length) ANIMALS = window.ANIMALS;
    if (!ANIMALS.length) {
      showBubble("Loading animals…", true);
      return setTimeout(function () { ANIMALS = window.ANIMALS || []; if (ANIMALS.length) { buildAliasIndex(); plantTrees(); measureStage(); randomLetter(); } }, 300);
    }
    buildAliasIndex();
    plantTrees();
    measureStage();
    randomLetter();
    if (!SR) micLabel.textContent = "No mic — tap below";
    helpOverlay.hidden = false;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
