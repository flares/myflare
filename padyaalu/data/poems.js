/* Padyaalu — seed corpus of Telugu satakam padyaalu.
 * Each record: { id, satakam, number, meter, lines[], pratipadartham[], tatparyam, chandassu }
 * chandassu is null until the gana-breakdown (phase 2) is added.
 * Kept as a plain global so index.html works straight from the file system (no fetch/CORS).
 */

const SATAKAMS = {
  vemana:    { name: "వేమన శతకం",   short: "Vemana",    poet: "వేమన",                     meter: "ఆటవెలది",   makutam: "విశ్వదాభిరామ వినుర వేమ" },
  sumati:    { name: "సుమతీ శతకం",  short: "Sumati",    poet: "బద్దెన",                    meter: "కంద పద్యం", makutam: "… సుమతీ" },
  dasarathi: { name: "దాశరథీ శతకం", short: "Dasarathi", poet: "కంచెర్ల గోపన్న (రామదాసు)", meter: "ఉత్పలమాల / చంపకమాల", makutam: "దాశరథీ కరుణాపయోనిధీ" },
};

const POEMS = [
  {
    id: "vemana-001",
    satakam: "vemana",
    number: 1,
    meter: "ఆటవెలది",
    lines: [
      "ఉప్పు కప్పురంబు నొక్క పోలికనుండు",
      "చూడ చూడ రుచుల జాడ వేరు",
      "పురుషులందు పుణ్య పురుషులు వేరయా",
      "విశ్వదాభిరామ వినుర వేమ",
    ],
    pratipadartham: [
      { word: "ఉప్పు", meaning: "salt" },
      { word: "కప్పురంబు", meaning: "camphor" },
      { word: "ఒక్క పోలికన్ ఉండు", meaning: "look alike / appear the same" },
      { word: "చూడ చూడ", meaning: "on closer observation" },
      { word: "రుచుల జాడ వేరు", meaning: "their taste (true nature) is different" },
      { word: "పురుషులందు", meaning: "among people" },
      { word: "పుణ్య పురుషులు", meaning: "virtuous / noble people" },
      { word: "వేరయా", meaning: "are distinct, set apart" },
      { word: "విశ్వదాభిరామ వినుర వేమ", meaning: "O Vema, delight of the world, listen (makutam)" },
    ],
    tatparyam:
      "Salt and camphor look alike, yet a taste reveals them to be wholly different. " +
      "In the same way, though all people may appear the same outwardly, the virtuous " +
      "stand apart from the rest. It is character, not appearance, that marks the noble.",
    chandassu: null,
  },
  {
    id: "vemana-002",
    satakam: "vemana",
    number: 2,
    meter: "ఆటవెలది",
    lines: [
      "అనగననగ రాగ మతిశయిల్లుచునుండు",
      "తినగ తినగ వేము తియ్యనుండు",
      "సాధనమున పనులు సమకూరు ధరలోన",
      "విశ్వదాభిరామ వినుర వేమ",
    ],
    pratipadartham: [
      { word: "అనగ అనగ", meaning: "by singing (it) again and again" },
      { word: "రాగము", meaning: "the melody / raaga" },
      { word: "అతిశయిల్లుచునుండు", meaning: "grows richer, more beautiful" },
      { word: "తినగ తినగ", meaning: "by eating (it) again and again" },
      { word: "వేము", meaning: "neem — the bitter one" },
      { word: "తియ్యనుండు", meaning: "becomes palatable / sweet" },
      { word: "సాధనమున", meaning: "through practice, perseverance" },
      { word: "పనులు సమకూరు", meaning: "tasks get accomplished" },
      { word: "ధరలోన", meaning: "in this world" },
    ],
    tatparyam:
      "A raaga deepens the more it is sung; even bitter neem grows tolerable with " +
      "repeated eating. Just so, with steady practice any task in this world can be " +
      "achieved. Perseverance is the key to mastery.",
    chandassu: null,
  },
  {
    id: "vemana-003",
    satakam: "vemana",
    number: 3,
    meter: "ఆటవెలది",
    lines: [
      "తప్పులెన్నువారు తండోపతండంబు",
      "లుర్వి జనులకెల్ల నుండు దప్పు",
      "తప్పులెన్నువారు తమ తప్పులెరుగరు",
      "విశ్వదాభిరామ వినుర వేమ",
    ],
    pratipadartham: [
      { word: "తప్పులు ఎన్నువారు", meaning: "those who count / point out (others') faults" },
      { word: "తండోపతండంబులు", meaning: "are in great numbers, crowds upon crowds" },
      { word: "ఉర్వి జనులకెల్ల", meaning: "to all people on earth" },
      { word: "ఉండు తప్పు", meaning: "faults are there (everyone has them)" },
      { word: "తప్పులు ఎన్నువారు", meaning: "the fault-finders" },
      { word: "తమ తప్పులు ఎరుగరు", meaning: "do not see their own faults" },
    ],
    tatparyam:
      "People eager to point out others' faults are countless, and every person on " +
      "earth has faults of their own. Yet those quickest to judge others are blindest " +
      "to their own shortcomings.",
    chandassu: null,
  },
  {
    id: "vemana-004",
    satakam: "vemana",
    number: 4,
    meter: "ఆటవెలది",
    lines: [
      "చెప్పులోని రాయి చెవిలోని జోరీగ",
      "కంటిలోని నలుసు కాలిముల్లు",
      "ఇంటిలోని పోరు నింతింత గాదయా",
      "విశ్వదాభిరామ వినుర వేమ",
    ],
    pratipadartham: [
      { word: "చెప్పులోని రాయి", meaning: "a pebble inside one's sandal" },
      { word: "చెవిలోని జోరీగ", meaning: "a buzzing fly in the ear" },
      { word: "కంటిలోని నలుసు", meaning: "a speck in the eye" },
      { word: "కాలిముల్లు", meaning: "a thorn in the foot" },
      { word: "ఇంటిలోని పోరు", meaning: "quarreling within the home" },
      { word: "ఇంతింత గాదయా", meaning: "is no small torment — it is beyond measure" },
    ],
    tatparyam:
      "A stone in the sandal, a fly in the ear, a mote in the eye, a thorn in the " +
      "foot — and strife at home: each is a small thing that brings ceaseless, " +
      "outsized misery. Discord within the household, like these, is a torment " +
      "beyond measure.",
    chandassu: null,
  },
  {
    id: "sumati-001",
    satakam: "sumati",
    number: 1,
    meter: "కంద పద్యం",
    lines: [
      "అప్పిచ్చువాడు వైద్యుడు",
      "నెప్పుడు నెడతెగక బారు నేరును ద్విజుడున్",
      "జొప్పడిన యూరనుండుము",
      "చొప్పడకున్నట్టి యూరు జొరకుము సుమతీ",
    ],
    pratipadartham: [
      { word: "అప్పిచ్చువాడు", meaning: "one who lends money in times of need" },
      { word: "వైద్యుడు", meaning: "a physician" },
      { word: "ఎప్పుడున్ ఎడతెగక పారు నేరు", meaning: "a river that flows without ever drying up" },
      { word: "ద్విజుడున్", meaning: "a learned scholar (brahmin)" },
      { word: "జొప్పడిన ఊరన్ ఉండుము", meaning: "live in a town where these are present" },
      { word: "చొప్పడకున్నట్టి ఊరు", meaning: "a town that lacks them" },
      { word: "జొరకుము", meaning: "do not enter" },
      { word: "సుమతీ", meaning: "O wise one (makutam)" },
    ],
    tatparyam:
      "A town worth living in has four things: a moneylender for hard times, a " +
      "physician, a perennial river, and a learned scholar. Settle where these exist; " +
      "do not so much as enter a place that lacks them.",
    chandassu: null,
  },
  {
    id: "sumati-002",
    satakam: "sumati",
    number: 2,
    meter: "కంద పద్యం",
    lines: [
      "కనకపు సింహాసనమున",
      "శునకము గూర్చుండబెట్టి శుభలగ్నమునన్",
      "దొనరగ బట్టము గట్టిన",
      "వెనుకటి గుణమేల మాను వినురా సుమతీ",
    ],
    pratipadartham: [
      { word: "కనకపు సింహాసనమున", meaning: "on a throne of gold" },
      { word: "శునకము", meaning: "a dog" },
      { word: "గూర్చుండబెట్టి", meaning: "having seated (it)" },
      { word: "శుభలగ్నమునన్", meaning: "at an auspicious moment" },
      { word: "దొనరగ", meaning: "fittingly, with due ceremony" },
      { word: "పట్టము గట్టిన", meaning: "even if crowned / anointed" },
      { word: "వెనుకటి గుణము", meaning: "its former (inborn) nature" },
      { word: "ఏల మాను", meaning: "why would it give up — it will not" },
      { word: "వినురా సుమతీ", meaning: "listen, O wise one (makutam)" },
    ],
    tatparyam:
      "Seat a dog upon a golden throne and crown it with full ceremony at an " +
      "auspicious hour — it will still not shed its inborn nature. One's essential " +
      "character is not changed by rank or position.",
    chandassu: null,
  },
];
