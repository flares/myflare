/*
 * Forest Friends — authentic animal voices
 * Sounds come from research-grade iNaturalist observations. Recordings made in
 * India are preferred; the same taxon globally is the fallback.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var API = "https://api.inaturalist.org/v1/observations";
  var cache = {};
  var inflight = {};
  var activeAudio = null;
  var playToken = 0;
  var INDIA_PLACE_ID = "6681";
  // Manually reviewed metadata for domestic species whose global result pool
  // includes unrelated ambient observations.
  var PREFERRED_OBSERVATION = { cow: 325582133, goat: 254599864 };
  var activeEnd = null;

  function collect(data, animal, fromIndia) {
    var candidates = [];
    (data && data.results || []).forEach(function (observation) {
      (observation.sounds || []).forEach(function (sound) {
        if (!sound.file_url || sound.hidden) return;
        candidates.push({
          url: sound.file_url,
          attribution: sound.attribution || "iNaturalist contributor",
          license: sound.license_code || observation.license_code || "see source",
          page: "https://www.inaturalist.org/observations/" + observation.id,
          observationId: observation.id,
          taxon: observation.taxon && (observation.taxon.preferred_common_name || observation.taxon.name) || animal.name,
          fromIndia: fromIndia
        });
      });
    });
    return candidates;
  }

  function request(animal, fromIndia) {
    var params = new URLSearchParams({
      taxon_name: animal.taxon || animal.name,
      sounds: "true", quality_grade: "research", captive: "false",
      order: "desc", order_by: "created_at", per_page: "20"
    });
    if (fromIndia) params.set("place_id", INDIA_PLACE_ID);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 5000);
    return fetch(API + "?" + params.toString(), {
      referrerPolicy: "no-referrer", signal: ctrl ? ctrl.signal : undefined
    }).then(function (response) {
      if (timer) clearTimeout(timer);
      return response.ok ? response.json() : null;
    }).then(function (data) { return collect(data, animal, fromIndia); })
      .catch(function () { if (timer) clearTimeout(timer); return []; });
  }

  function resolve(a) {
    if (!a || !a.key) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(cache, a.key)) return Promise.resolve(cache[a.key]);
    if (inflight[a.key]) return inflight[a.key];
    var p = request(a, true).then(function (candidates) {
      return candidates.length ? candidates : request(a, false);
    }).then(function (candidates) {
      var preferred = PREFERRED_OBSERVATION[a.key];
      cache[a.key] = candidates.find(function (item) { return item.observationId === preferred; }) ||
        (candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null);
      delete inflight[a.key];
      return cache[a.key];
    }).catch(function () {
      cache[a.key] = null;
      delete inflight[a.key];
      return null;
    });
    inflight[a.key] = p;
    return p;
  }

  function finishActive() {
    var callback = activeEnd;
    activeEnd = null;
    activeAudio = null;
    if (callback) callback();
  }

  function playRecording(recording, onEnded) {
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) {}
      finishActive();
    }
    var audio = new Audio(recording.url);
    activeAudio = audio;
    activeEnd = typeof onEnded === "function" ? onEnded : null;
    audio.preload = "auto";
    audio.volume = 0.82;
    audio.addEventListener("ended", function () { if (activeAudio === audio) finishActive(); }, { once: true });
    audio.addEventListener("error", function () { if (activeAudio === audio) finishActive(); }, { once: true });
    var result = audio.play();
    if (result && result.catch) return result.then(function () { return true; }).catch(function () { finishActive(); return false; });
    return Promise.resolve(true);
  }

  window.RealSounds = {
    play: function (animal, onEnded) {
      var token = ++playToken;
      return resolve(animal).then(function (recording) {
        if (token !== playToken) return false;
        return recording ? playRecording(recording, onEnded) : false;
      }).catch(function () { return false; });
    },
    prefetch: function (animal) {
      if (animal && animal.key && navigator.onLine !== false) resolve(animal);
    },
    credit: function (animal) { return animal && cache[animal.key] || null; },
    stop: function () {
      playToken++;
      if (!activeAudio) return;
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) {}
      finishActive();
    },
    _cache: cache
  };
})();
