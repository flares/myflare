/*
 * Forest Friends — authentic animal voices
 * Sounds come from research-grade iNaturalist observations. Each clip is tied
 * to an identified taxon and carries its recordist attribution and licence.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var API = "https://api.inaturalist.org/v1/observations";
  var cache = {};
  var inflight = {};
  var activeAudio = null;
  var TAXON_QUERY = {
    ant: "Formicidae", bee: "Anthophila", chicken: "Gallus gallus domesticus",
    cow: "Bos taurus", dog: "Canis lupus familiaris", donkey: "Equus africanus asinus",
    duck: "Anatidae", eagle: "Accipitridae", flamingo: "Phoenicopteridae",
    frog: "Anura", goose: "Anserinae", hen: "Gallus gallus domesticus",
    lion: "Panthera leo", monkey: "Simiiformes", mouse: "Mus musculus",
    nightingale: "Luscinia megarhynchos", owl: "Strigiformes", parrot: "Psittaciformes",
    pig: "Sus scrofa domesticus", quail: "Coturnix", rabbit: "Oryctolagus cuniculus",
    rooster: "Gallus gallus domesticus", sheep: "Ovis aries", snake: "Serpentes",
    squirrel: "Sciuridae", swan: "Cygnus", tiger: "Panthera tigris",
    viper: "Viperidae", vulture: "Cathartidae", whale: "Cetacea", wolf: "Canis lupus"
  };

  function resolve(a) {
    if (!a || !a.key) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(cache, a.key)) return Promise.resolve(cache[a.key]);
    if (inflight[a.key]) return inflight[a.key];
    var params = new URLSearchParams({
      taxon_name: TAXON_QUERY[a.key] || a.name,
      sounds: "true", quality_grade: "research", captive: "false",
      order: "desc", order_by: "created_at", per_page: "20"
    });
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 5000);
    var p = fetch(API + "?" + params.toString(), {
      referrerPolicy: "no-referrer", signal: ctrl ? ctrl.signal : undefined
    }).then(function (response) {
      if (timer) clearTimeout(timer);
      return response.ok ? response.json() : null;
    }).then(function (data) {
      var candidates = [];
      (data && data.results || []).forEach(function (observation) {
        (observation.sounds || []).forEach(function (sound) {
          if (!sound.file_url || sound.hidden) return;
          candidates.push({
            url: sound.file_url,
            attribution: sound.attribution || "iNaturalist contributor",
            license: sound.license_code || observation.license_code || "see source",
            page: "https://www.inaturalist.org/observations/" + observation.id,
            taxon: observation.taxon && (observation.taxon.preferred_common_name || observation.taxon.name) || a.name
          });
        });
      });
      cache[a.key] = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
      delete inflight[a.key];
      return cache[a.key];
    }).catch(function () {
      if (timer) clearTimeout(timer);
      cache[a.key] = null;
      delete inflight[a.key];
      return null;
    });
    inflight[a.key] = p;
    return p;
  }

  function playRecording(recording) {
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) {}
    }
    var audio = new Audio(recording.url);
    activeAudio = audio;
    audio.preload = "auto";
    audio.volume = 0.82;
    audio.addEventListener("ended", function () { if (activeAudio === audio) activeAudio = null; }, { once: true });
    var result = audio.play();
    if (result && result.catch) return result.then(function () { return true; }).catch(function () { return false; });
    return Promise.resolve(true);
  }

  window.RealSounds = {
    play: function (animal) {
      return resolve(animal).then(function (recording) {
        return recording ? playRecording(recording) : false;
      }).catch(function () { return false; });
    },
    prefetch: function (animal) {
      if (animal && animal.key && navigator.onLine !== false) resolve(animal);
    },
    credit: function (animal) { return animal && cache[animal.key] || null; },
    stop: function () {
      if (!activeAudio) return;
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) {}
      activeAudio = null;
    },
    _cache: cache
  };
})();
