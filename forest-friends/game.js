/* ===================================================================
   Forest Friends — game core
   Ties together: the animal dataset (animals.js -> window.ANIMALS),
   the synthesized sound engine (audio.js -> window.GameAudio), the
   Web Speech API for voice commands, and the forest scene / letter
   index rendering.
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
  var langSelect   = document.getElementById("langSelect");
  var helpBtn      = document.getElementById("helpBtn");
  var helpOverlay  = document.getElementById("helpOverlay");
  var helpClose    = document.getElementById("helpClose");
  var helpStart    = document.getElementById("helpStart");

  // ---- state -------------------------------------------------------
  var currentLetter = "A";
  var onStage = {};            // key -> DOM element for animals currently in the forest
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  var audioReady = false;

  // command vocabulary ------------------------------------------------
  var ENTER_WORDS = ["enter","come","comes","coming","raa","ra","randi","vachu","vachchu","vachi",
                     "appear","in","here","arrive","hello","hi","play"];
  var EXIT_WORDS  = ["exit","go","goes","going","out","leave","leaves","bye","goodbye",
                     "po","pommu","pomma","velli","vellu","vellipo","away"];

  // -------------------------------------------------------------------
  //  Build a fast lookup: spoken word/phrase -> animal
  // -------------------------------------------------------------------
  var aliasIndex = [];   // [{ phrase, animal }] sorted longest-first
  (function buildAliasIndex() {
    ANIMALS.forEach(function (a) {
      var phrases = [a.name, a.key, a.teluguRoman].concat(a.aliases || []);
      if (a.telugu) phrases.push(a.telugu);
      phrases.forEach(function (p) {
        if (!p) return;
        aliasIndex.push({ phrase: norm(p), animal: a });
      });
    });
    // longest phrases first so "polar bear" beats "bear"
    aliasIndex.sort(function (x, y) { return y.phrase.length - x.phrase.length; });
  })();

  function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9ఀ-౿\s]/g, " ")
            .replace(/\s+/g, " ").trim();
  }

  // -------------------------------------------------------------------
  //  Scene setup
  // -------------------------------------------------------------------
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
  function lettersWithAnimals() {
    return LETTERS.filter(function (L) { return animalsForLetter(L).length > 0; });
  }

  function animalsForLetter(L) {
    if (typeof window.animalsByLetter === "function") return window.animalsByLetter(L);
    return ANIMALS.filter(function (a) {
      var c = a.name.replace(/[^a-z]/i, "").charAt(0).toUpperCase();
      return c === L;
    });
  }

  function setLetter(L) {
    currentLetter = L;
    letterGlyph.textContent = L;
    indexLetter.textContent = L;
    letterCard.classList.remove("bump"); void letterCard.offsetWidth;
    letterCard.classList.add("bump");
    renderIndex(L);
  }

  function randomLetter() {
    var pool = lettersWithAnimals();
    var next;
    do { next = pool[Math.floor(Math.random() * pool.length)]; }
    while (pool.length > 1 && next === currentLetter);
    setLetter(next);
  }

  function renderIndex(L) {
    var list = animalsForLetter(L);
    indexRow.innerHTML = "";
    if (list[0]) { indexExample.textContent = list[0].name; }
    if (list[1] || list[0]) { indexExample2.textContent = (list[1] || list[0]).name; }
    list.forEach(function (a) {
      var chip = document.createElement("button");
      chip.className = "chip" + (onStage[a.key] ? " active" : "");
      chip.dataset.key = a.key;
      chip.innerHTML =
        '<span class="chip-emoji">' + a.emoji + '</span>' +
        '<span class="chip-name">' + a.name + '</span>' +
        '<span class="chip-tel">' + (a.teluguRoman || "") + '</span>';
      chip.addEventListener("click", function () {
        ensureAudio();
        if (onStage[a.key]) exitAnimal(a); else enterAnimal(a, true);
      });
      indexRow.appendChild(chip);
    });
  }

  function refreshChipStates() {
    Array.prototype.forEach.call(indexRow.children, function (chip) {
      chip.classList.toggle("active", !!onStage[chip.dataset.key]);
    });
  }

  // -------------------------------------------------------------------
  //  Animals enter / exit
  // -------------------------------------------------------------------
  function enterAnimal(a, fromChip) {
    if (onStage[a.key]) { hop(onStage[a.key]); playSound(a); return; }

    var el = document.createElement("div");
    var fromLeft = Math.random() < 0.5;
    el.className = "animal " + (fromLeft ? "from-left" : "from-right");
    el.textContent = a.emoji;
    el.title = a.name;

    var label = document.createElement("span");
    label.className = "a-name";
    label.textContent = a.name + (a.teluguRoman ? " · " + a.teluguRoman : "");
    el.appendChild(label);

    // spread animals across the ground so they don't fully overlap
    var slots = Object.keys(onStage).length;
    var left = 10 + ((slots * 17) % 70);
    el.style.left = left + "vw";
    el.style.zIndex = 5 + slots;

    el.addEventListener("click", function () { ensureAudio(); exitAnimal(a); });

    stage.appendChild(el);
    onStage[a.key] = el;

    el.addEventListener("animationend", function onEnd() {
      el.removeEventListener("animationend", onEnd);
      el.classList.remove("from-left", "from-right");
      el.classList.add("settled");
    });

    playSound(a);
    refreshChipStates();

    // celebrate if this animal matches the prompt letter
    if (firstLetterOf(a) === currentLetter) {
      celebrate(el);
      setTimeout(randomLetter, 1400);
    }
    return el;
  }

  function exitAnimal(a) {
    var el = onStage[a.key];
    if (!el) return;
    delete onStage[a.key];
    el.classList.remove("settled");
    el.classList.add(Math.random() < 0.5 ? "leaving-left" : "leaving-right");
    el.addEventListener("animationend", function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    refreshChipStates();
  }

  function clearStage() {
    Object.keys(onStage).forEach(function (k) {
      var a = ANIMALS.filter(function (x) { return x.key === k; })[0];
      if (a) exitAnimal(a);
    });
  }

  function hop(el) {
    el.classList.remove("settled"); void el.offsetWidth; el.classList.add("settled");
  }

  function firstLetterOf(a) {
    return a.name.replace(/[^a-z]/i, "").charAt(0).toUpperCase();
  }

  function celebrate(el) {
    var marks = ["⭐","🎉","✨","🌟"];
    for (var i = 0; i < 5; i++) {
      (function (i) {
        var s = document.createElement("span");
        s.className = "sparkle";
        s.textContent = marks[i % marks.length];
        s.style.left = (parseFloat(el.style.left) + (Math.random() * 12 - 6)) + "vw";
        s.style.bottom = (18 + Math.random() * 14) + "vh";
        stage.appendChild(s);
        setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1000);
      })(i);
    }
  }

  function playSound(a) {
    if (!AUDIO) return;
    try { AUDIO.playAnimal(a.sound || "generic"); } catch (e) {}
  }

  // -------------------------------------------------------------------
  //  Command interpretation
  // -------------------------------------------------------------------
  function interpret(transcript) {
    var text = " " + norm(transcript) + " ";

    // find the animal whose alias phrase appears in the transcript (longest wins)
    var found = null;
    for (var i = 0; i < aliasIndex.length; i++) {
      var p = aliasIndex[i].phrase;
      if (!p) continue;
      if (text.indexOf(" " + p + " ") !== -1) { found = aliasIndex[i].animal; break; }
    }
    if (!found) return false;

    var wantsExit = EXIT_WORDS.some(function (w) { return text.indexOf(" " + w + " ") !== -1; });
    var wantsEnter = ENTER_WORDS.some(function (w) { return text.indexOf(" " + w + " ") !== -1; });

    // default action: if only an animal name was said, bring it in
    if (wantsExit && !wantsEnter) exitAnimal(found);
    else enterAnimal(found);
    return true;
  }

  // -------------------------------------------------------------------
  //  Heard bubble helper
  // -------------------------------------------------------------------
  var bubbleTimer;
  function showBubble(text, isErr) {
    heardBubble.hidden = false;
    heardBubble.textContent = text;
    heardBubble.classList.toggle("err", !!isErr);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { heardBubble.hidden = true; }, 2600);
  }

  // -------------------------------------------------------------------
  //  Speech recognition
  // -------------------------------------------------------------------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, listening = false, wantListening = false;

  function buildRecognizer() {
    if (!SR) return null;
    var r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
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
      // Chrome stops periodically; restart if the child still wants to talk
      if (wantListening) { try { r.start(); } catch (e) {} }
    };
    r.onresult = function (ev) {
      var handled = false, lastText = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var res = ev.results[i];
        // try every alternative for a match, prefer final results
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
    if (!SR) {
      showBubble("Voice not supported here — tap animals below 👇", true);
      return;
    }
    wantListening = true;
    if (!recog) recog = buildRecognizer();
    recog.lang = langSelect.value || "en-IN";
    try { recog.start(); } catch (e) { /* already started */ }
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
  //  Wire up controls
  // -------------------------------------------------------------------
  micBtn.addEventListener("click", function () {
    if (wantListening) stopListening(); else startListening();
  });

  musicBtn.addEventListener("click", function () {
    ensureAudio();
    if (!AUDIO) return;
    if (AUDIO.isMusicOn()) { AUDIO.stopMusic(); musicBtn.setAttribute("aria-pressed", "false"); musicBtn.textContent = "🎵 Music"; }
    else { AUDIO.startMusic(); musicBtn.setAttribute("aria-pressed", "true"); musicBtn.textContent = "🔊 Music on"; }
  });

  newLetterBtn.addEventListener("click", function () { ensureAudio(); randomLetter(); });
  clearBtn.addEventListener("click", function () { ensureAudio(); clearStage(); });

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

  window.addEventListener("resize", plantTrees);

  // -------------------------------------------------------------------
  //  Boot
  // -------------------------------------------------------------------
  function boot() {
    if (!ANIMALS.length) {
      showBubble("Loading animals…", true);
      return setTimeout(function () { ANIMALS = window.ANIMALS || []; if (ANIMALS.length) { rebuild(); } }, 300);
    }
    plantTrees();
    randomLetter();
    if (!SR) micLabel.textContent = "No mic — tap below";
    helpOverlay.hidden = false; // greet with instructions
  }

  function rebuild() {
    // in case ANIMALS loaded late
    aliasIndex.length = 0;
    ANIMALS.forEach(function (a) {
      var phrases = [a.name, a.key, a.teluguRoman].concat(a.aliases || []);
      if (a.telugu) phrases.push(a.telugu);
      phrases.forEach(function (p) { if (p) aliasIndex.push({ phrase: norm(p), animal: a }); });
    });
    aliasIndex.sort(function (x, y) { return y.phrase.length - x.phrase.length; });
    plantTrees(); randomLetter();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
