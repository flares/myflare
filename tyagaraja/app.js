/* Kṛti Kōśam — study app over the versioned Tyāgarāja dataset in ./data.
   Plain ES2020, no build step. Personal state lives in localStorage, keyed by
   kriti slug (never by catalog id — ids get reassigned when records are added). */

(() => {
  'use strict';

  const STUDY_KEY = 'tyagaraja.study.v1';
  const PREFS_KEY = 'tyagaraja.prefs.v1';

  const STATUSES = [
    { key: 'todo', label: 'To learn' },
    { key: 'learning', label: 'Learning' },
    { key: 'learnt', label: 'Learnt' },
  ];

  /* ------------------------------------------------------------------ state */

  const D = { kritis: [], ragas: [], talas: [], groups: [], manifest: null };
  const byRaga = new Map();
  const byTala = new Map();
  const byGroup = new Map();
  const byKriti = new Map();

  let study = {};
  // Telugu-first by default: for the reader this is built for, the lipi is the
  // primary text and the transliteration is the fallback. `scripts()` drops
  // back to transliteration automatically for records with no Telugu yet.
  let prefs = { script: 'telugu', compact: false, sort: 'catalog', view: 'catalog', showEmptyRagas: false };
  const filters = {
    q: '',
    status: new Set(),
    marks: new Set(),
    groups: new Set(),
    ragas: new Set(),
    talas: new Set(),
    langs: new Set(),
    deities: new Set(),
    maxDifficulty: 5,
    minPopularity: 1,
  };
  let visible = [];
  let selected = null;
  let pendingRagaFocus = null;

  // Browser history: a view switch (tab click, or a "jump" like clicking a
  // raga link) pushes an entry so the back button retraces app navigation
  // instead of leaving the page. Plain list browsing (selecting a kriti,
  // j/k stepping) only replaces the current entry, as before — otherwise
  // scanning ten kritis would take ten presses of back to undo.
  let suppressHistory = false;
  // We restore scroll ourselves from history state — the list is re-rendered on
  // every navigation, so the browser's own guess is made against a stale height.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const appState = () => ({ view: prefs.view, slug: selected, scrollY: window.scrollY });
  const urlForState = (state) => (state.slug && byKriti.has(state.slug) ? `#${state.slug}` : location.pathname + location.search);

  /** Snapshot where the user currently is (including scroll) into the entry
   *  they are leaving, then push the new one. Without the snapshot, going back
   *  would restore the view but dump them at the top of a 141-row list. */
  function pushNav() {
    if (suppressHistory) return;
    history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, '', location.href);
    const next = appState();
    next.scrollY = 0;
    history.pushState(next, '', urlForState(next));
  }

  function replaceNav() {
    if (suppressHistory) return;
    history.replaceState(appState(), '', urlForState(appState()));
  }

  /* ----------------------------------------------------------------- helpers */

  const $ = (sel) => document.querySelector(sel);
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const record = (slug) => {
    if (!study[slug]) study[slug] = { status: 'todo', fav: false, bm: false, practice: 0, last: null, note: '' };
    return study[slug];
  };
  const peek = (slug) => study[slug] ?? { status: 'todo', fav: false, bm: false, practice: 0, last: null, note: '' };

  const saveStudy = debounce(() => {
    try {
      localStorage.setItem(STUDY_KEY, JSON.stringify(study));
    } catch (e) {
      console.warn('could not persist study data', e);
    }
  }, 250);

  const savePrefs = debounce(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) { /* private mode — preferences just won't stick */ }
  }, 250);

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STUDY_KEY);
      if (raw) study = JSON.parse(raw) || {};
    } catch (e) { study = {}; }
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) prefs = { ...prefs, ...(JSON.parse(raw) || {}) };
    } catch (e) { /* defaults */ }
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function relativeDay(iso) {
    if (!iso) return 'never';
    const days = Math.round((Date.parse(today()) - Date.parse(iso)) / 86400000);
    if (Number.isNaN(days)) return iso;
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.round(days / 7)} weeks ago`;
    return `${Math.round(days / 30)} months ago`;
  }

  /* -------------------------------------------------------------- rendering bits */

  const diffBars = (n) => `<span class="diff" title="Difficulty ${n} of 5" aria-label="Difficulty ${n} of 5">${
    [1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')
  }</span>`;

  // Telugu swara notation: the sthāna number rides as a subscript, the way it
  // is printed in Telugu notation books (S R2 G3 → స రి₂ గ₃).
  const SWARA_TELUGU = { S: 'స', R: 'రి', G: 'గ', M: 'మ', P: 'ప', D: 'ద', N: 'ని' };
  const SUBSCRIPT = ['', '₁', '₂', '₃'];

  function swaraLabel(sw) {
    if (prefs.script === 'latin') return sw;
    const base = SWARA_TELUGU[sw[0]];
    if (!base) return sw;
    const n = Number(sw[1]);
    return n ? base + SUBSCRIPT[n] : base;
  }

  const swaraChips = (line) => (line || '')
    .split(' ')
    .map((sw) => `<span class="sw${sw === 'S' ? ' s' : ''}${
      prefs.script === 'latin' ? '' : ' te'
    }" title="${esc(sw)}">${esc(swaraLabel(sw))}</span>`)
    .join('');

  const statusBadge = (st) => (st === 'todo' ? '' : `<span class="badge st-${st}">${st}</span>`);

  /** The kriti's display title under the current script setting, for the
   *  cross-view link lists in the Rāgas, Groups and Progress views. */
  function linkTitle(k) {
    return prefs.script === 'telugu' && k.title_telugu
      ? `<span class="te">${esc(k.title_telugu)}</span>`
      : esc(k.title);
  }

  /** The composition's verified sections, in order, Telugu script. */
  function renderSahityam(k, sc) {
    return k.sahityam.map((sec) => `
      <div class="sec">
        <div class="sec-label">${esc(sec.label_telugu)}${
          sec.verified ? '' : '<span class="unverified" title="From the compiler\'s knowledge, not corroborated against a published lyric source">unverified</span>'
        }</div>
        <div class="sahitya te">${esc(sec.telugu)}</div>
        ${sec.kind === 'pallavi' && sc.latin ? `<div class="sahitya lat">${esc(k.pallavi)}</div>` : ''}
      </div>`).join('');
  }

  /** Which scripts to show, honouring the toggle and falling back when Telugu is absent. */
  function scripts(k) {
    const hasTe = Boolean(k.title_telugu || k.pallavi_telugu);
    if (prefs.script === 'telugu' && hasTe) return { latin: false, telugu: true };
    if (prefs.script === 'latin') return { latin: true, telugu: false };
    if (prefs.script === 'telugu') return { latin: true, telugu: false };
    return { latin: true, telugu: hasTe };
  }

  /* ------------------------------------------------------------------- load */

  async function boot() {
    loadLocal();
    document.body.classList.toggle('compact', prefs.compact);

    try {
      const manifest = await fetchJson('data/dataset.json');
      D.manifest = manifest;
      const [kritis, ragas, talas, groups] = await Promise.all([
        fetchJson(`data/${manifest.files.kritis.path}`),
        fetchJson(`data/${manifest.files.ragas.path}`),
        fetchJson(`data/${manifest.files.talas.path}`),
        fetchJson(`data/${manifest.files.groups.path}`),
      ]);
      D.kritis = kritis.records;
      D.ragas = ragas.records;
      D.talas = talas.records;
      D.groups = groups.records;
    } catch (e) {
      $('#count').textContent = 'dataset unavailable';
      $('#list').innerHTML = `<li class="empty"><strong>Could not load the dataset</strong>
        ${esc(e.message)}<br><br>Opened straight off the filesystem? Browsers block
        <code>fetch</code> on <code>file://</code>. Serve the folder instead —
        <code>python3 -m http.server</code> — or use the GitHub Pages copy.</li>`;
      return;
    }

    D.ragas.forEach((r) => byRaga.set(r.slug, r));
    D.talas.forEach((t) => byTala.set(t.label, t));
    D.groups.forEach((g) => byGroup.set(g.slug, g));
    D.kritis.forEach((k) => {
      byKriti.set(k.slug, k);
      const raga = byRaga.get(k.raga_slug);
      k._sortTitle = fold(k.title).replace(/[^a-z0-9 ]/g, '');
      k._hay = `${fold([
        k.title, k.pallavi, k.meaning, k.raga, k.tala, k.language, k.deity,
        k.kshetra, k.notes, (k.tags || []).join(' '), (k.groups || []).join(' '),
        raga ? `${raga.name} ${(raga.aka || []).join(' ')} mela ${raga.mela} ${raga.parent}` : '',
      ].join(' '))} ${k.title_telugu || ''} ${k.pallavi_telugu || ''} #${k.id}`;
    });

    $('#version').textContent = `dataset v${D.manifest.version} · schema v${D.manifest.schema_version} · ${D.kritis.length} kṛtis`;
    buildFilterControls();
    wireEvents();
    setView(prefs.view, true);
    $('#sort').value = prefs.sort;
    refresh();

    const fromHash = location.hash.replace(/^#/, '');
    if (fromHash && byKriti.has(fromHash)) select(fromHash, false);
    // Establish a baseline history entry carrying {view, slug} so the first
    // popstate (however the user got here) has real state to restore, not null.
    if (!history.state) history.replaceState(appState(), '', urlForState(appState()));
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  }

  /* --------------------------------------------------------- filter controls */

  function tally(fn) {
    const counts = new Map();
    for (const k of D.kritis) {
      for (const v of [].concat(fn(k))) {
        if (v === null || v === undefined || v === '') continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    return counts;
  }

  function chipRow(host, entries, set, keyName) {
    host.innerHTML = entries.map(([value, label, count]) => `
      <button class="chip" data-filter="${keyName}" data-value="${esc(value)}"
              aria-pressed="${set.has(value)}">${esc(label)}${
                count === undefined ? '' : `<span class="n">${count}</span>`
              }</button>`).join('');
  }

  function buildFilterControls() {
    chipRow($('#f-status'), STATUSES.map((s) => [s.key, s.label, undefined]), filters.status, 'status');
    chipRow($('#f-marks'), [
      ['fav', '★ Favourites'],
      ['bm', '⚑ Bookmarked'],
      ['noted', '✎ With notes'],
      ['high', '✓ Cross-checked'],
    ], filters.marks, 'marks');

    const groupCounts = tally((k) => k.groups);
    chipRow(
      $('#f-groups'),
      D.groups
        .filter((g) => groupCounts.get(g.slug))
        .map((g) => [g.slug, g.name, groupCounts.get(g.slug)]),
      filters.groups,
      'groups',
    );

    const talaCounts = tally((k) => k.tala);
    chipRow(
      $('#f-talas'),
      D.talas.filter((t) => talaCounts.get(t.label)).map((t) => [t.label, t.name, talaCounts.get(t.label)]),
      filters.talas,
      'talas',
    );

    const langCounts = tally((k) => k.language);
    chipRow($('#f-langs'), [...langCounts].sort((a, b) => b[1] - a[1]).map(([l, n]) => [l, l, n]), filters.langs, 'langs');

    const deityCounts = tally((k) => k.deity);
    chipRow($('#f-deities'), [...deityCounts].sort((a, b) => b[1] - a[1]).map(([d, n]) => [d, d, n]), filters.deities, 'deities');

    renderRagaFilter('');
    $('#f-difficulty').value = filters.maxDifficulty;
    $('#f-popularity').value = filters.minPopularity;
  }

  function renderRagaFilter(query) {
    const counts = tally((k) => k.raga_slug);
    const q = fold(query);
    const rows = D.ragas
      .filter((r) => counts.get(r.slug))
      .filter((r) => !q || fold(r.name).includes(q) || r.slug.includes(q))
      .sort((a, b) => (counts.get(b.slug) - counts.get(a.slug)) || a.name.localeCompare(b.name));
    $('#ragaCount').textContent = `${counts.size} with kṛtis`;
    $('#f-ragas').innerHTML = rows.map((r) => `
      <button data-filter="ragas" data-value="${esc(r.slug)}" aria-pressed="${filters.ragas.has(r.slug)}">
        <span>${esc(r.name)}</span><span class="n">${counts.get(r.slug)}</span>
      </button>`).join('') || '<button disabled><span>no match</span></button>';
  }

  /* ------------------------------------------------------------- filtering */

  function passes(k) {
    const s = peek(k.slug);
    if (filters.status.size && !filters.status.has(s.status)) return false;
    if (filters.marks.has('fav') && !s.fav) return false;
    if (filters.marks.has('bm') && !s.bm) return false;
    if (filters.marks.has('noted') && !(s.note || '').trim()) return false;
    if (filters.marks.has('high') && k.confidence !== 'high') return false;
    if (filters.groups.size && !(k.groups || []).some((g) => filters.groups.has(g))) return false;
    if (filters.ragas.size && !filters.ragas.has(k.raga_slug)) return false;
    if (filters.talas.size && !filters.talas.has(k.tala)) return false;
    if (filters.langs.size && !filters.langs.has(k.language)) return false;
    if (filters.deities.size && !filters.deities.has(k.deity)) return false;
    if (k.difficulty > filters.maxDifficulty) return false;
    if (k.popularity < filters.minPopularity) return false;
    if (filters.q) {
      const terms = fold(filters.q).split(/\s+/).filter(Boolean);
      const hay = k._hay;
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  }

  const statusRank = { learning: 0, todo: 1, learnt: 2 };

  function sortVisible(list) {
    const sorters = {
      catalog: (a, b) => a.id - b.id,
      title: (a, b) => a._sortTitle.localeCompare(b._sortTitle),
      raga: (a, b) => fold(a.raga).localeCompare(fold(b.raga)) || a.id - b.id,
      tala: (a, b) => a.tala.localeCompare(b.tala) || a.id - b.id,
      difficulty: (a, b) => a.difficulty - b.difficulty || b.popularity - a.popularity,
      'difficulty-desc': (a, b) => b.difficulty - a.difficulty || b.popularity - a.popularity,
      popularity: (a, b) => b.popularity - a.popularity || a.difficulty - b.difficulty,
      status: (a, b) => statusRank[peek(a.slug).status] - statusRank[peek(b.slug).status] || a.id - b.id,
      practised: (a, b) => String(peek(b.slug).last ?? '').localeCompare(String(peek(a.slug).last ?? '')) || a.id - b.id,
    };
    return list.sort(sorters[prefs.sort] ?? sorters.catalog);
  }

  function refresh() {
    visible = sortVisible(D.kritis.filter(passes));
    renderCount();
    renderActiveFilters();
    if (prefs.view === 'catalog') renderList();
    if (prefs.view === 'ragas') renderRagasView();
    if (prefs.view === 'lyrics') renderLyricsView();
    if (prefs.view === 'groups') renderGroupsView();
    if (prefs.view === 'progress') renderProgressView();
    renderTabCounts();
    syncChips();
  }

  function renderCount() {
    const total = D.kritis.length;
    const learnt = visible.filter((k) => peek(k.slug).status === 'learnt').length;
    const learning = visible.filter((k) => peek(k.slug).status === 'learning').length;
    $('#count').innerHTML = visible.length === total
      ? `<b>${total}</b> kṛtis · ${learnt} learnt · ${learning} learning`
      : `<b>${visible.length}</b> of ${total} · ${learnt} learnt · ${learning} learning`;
  }

  function renderTabCounts() {
    $('#n-catalog').textContent = visible.length;
    $('#n-ragas').textContent = new Set(visible.map((k) => k.raga_slug)).size;
    $('#n-lyrics').textContent = visible.filter((k) => k.sahityam?.length).length;
    $('#n-groups').textContent = D.groups.length;
    const learnt = D.kritis.filter((k) => peek(k.slug).status === 'learnt').length;
    $('#n-progress').textContent = learnt;
  }

  function renderActiveFilters() {
    const chips = [];
    const push = (key, value, label) => chips.push(
      `<button class="chip" data-clear="${key}" data-value="${esc(value)}">${esc(label)} ✕</button>`,
    );
    filters.status.forEach((v) => push('status', v, STATUSES.find((s) => s.key === v)?.label ?? v));
    filters.marks.forEach((v) => push('marks', v, {
      fav: '★ favourites', bm: '⚑ bookmarked', noted: '✎ noted', high: '✓ cross-checked',
    }[v]));
    filters.groups.forEach((v) => push('groups', v, byGroup.get(v)?.name ?? v));
    filters.ragas.forEach((v) => push('ragas', v, byRaga.get(v)?.name ?? v));
    filters.talas.forEach((v) => push('talas', v, v));
    filters.langs.forEach((v) => push('langs', v, v));
    filters.deities.forEach((v) => push('deities', v, v));
    if (filters.maxDifficulty < 5) push('maxDifficulty', '5', `difficulty ≤ ${filters.maxDifficulty}`);
    if (filters.minPopularity > 1) push('minPopularity', '1', `popularity ≥ ${filters.minPopularity}`);
    $('#activeFilters').innerHTML = chips.join('');
  }

  function syncChips() {
    document.querySelectorAll('[data-filter]').forEach((el) => {
      const set = filters[el.dataset.filter];
      if (set instanceof Set) el.setAttribute('aria-pressed', String(set.has(el.dataset.value)));
    });
    $('#difficultyLabel').textContent = `up to ${filters.maxDifficulty}`;
    $('#popularityLabel').textContent = `${filters.minPopularity} and up`;
    $('#scriptBtn').textContent = { both: 'అ A', latin: 'A', telugu: 'అ' }[prefs.script];
    $('#scriptBtn').title = `Script: ${{ both: 'both', latin: 'transliteration', telugu: 'Telugu' }[prefs.script]}`;
  }

  function syncSettings() {
    document.querySelectorAll('[data-script]').forEach((el) => {
      el.setAttribute('aria-pressed', String(el.dataset.script === prefs.script));
    });
    document.querySelectorAll('[data-density]').forEach((el) => {
      el.setAttribute('aria-pressed', String((el.dataset.density === 'compact') === prefs.compact));
    });
  }

  /* ------------------------------------------------------------- catalog list */

  function rowHtml(k) {
    const s = peek(k.slug);
    const sc = scripts(k);
    const raga = byRaga.get(k.raga_slug);
    const titleTe = sc.telugu && k.title_telugu ? `<span class="te">${esc(k.title_telugu)}</span>` : '';
    const titleLat = sc.latin ? esc(k.title) : '';
    const pallavi = sc.telugu && !sc.latin && k.pallavi_telugu ? k.pallavi_telugu : k.pallavi;
    const groupBadge = (k.groups || [])
      .map((g) => `<span class="badge grp">${esc((byGroup.get(g)?.name ?? g).replace(/\s*Kṛtis?$/i, '').replace(/\s*Kīrtanas?$/i, ''))}</span>`)
      .join('');
    return `<li><div class="row st-${s.status}${selected === k.slug ? ' sel' : ''}"
        role="button" tabindex="0" data-slug="${esc(k.slug)}" aria-label="${esc(k.title)}, raga ${esc(k.raga)}">
      <span class="num">${k.id}</span>
      <span class="main">
        <span class="title">${titleLat}${titleTe}</span>
        <span class="sub ${sc.telugu && !sc.latin ? 'te' : ''}">${esc(pallavi.split('\n')[0])}</span>
        <span class="meta">
          <button type="button" class="raga${sc.telugu && !sc.latin && raga?.name_telugu ? ' te' : ''}"
                  data-raga-link="${esc(k.raga_slug)}"
                  title="Open ${esc(k.raga)} in the Rāgas view">${
                    sc.telugu && !sc.latin && raga?.name_telugu ? esc(raga.name_telugu) : esc(k.raga)
                  }</button><span class="dot">·</span>
          <span>${esc(k.tala)}</span><span class="dot">·</span>
          <span>${esc(k.language)}</span>
          ${raga && raga.mela ? `<span class="dot">·</span><span>mela ${raga.mela}</span>` : ''}
          ${diffBars(k.difficulty)}
          ${groupBadge}${statusBadge(s.status)}
          ${s.practice ? `<span class="dot">·</span><span>${plural(s.practice, 'session', 'sessions')}</span>` : ''}
        </span>
      </span>
      <span class="marks">
        <button class="mark fav" data-act="fav" data-slug="${esc(k.slug)}" aria-pressed="${s.fav}"
                title="Favourite" aria-label="Favourite ${esc(k.title)}">${s.fav ? '★' : '☆'}</button>
        <button class="mark bm" data-act="bm" data-slug="${esc(k.slug)}" aria-pressed="${s.bm}"
                title="Bookmark" aria-label="Bookmark ${esc(k.title)}">⚑</button>
      </span>
    </div></li>`;
  }

  function renderList() {
    const list = $('#list');
    if (!visible.length) {
      list.innerHTML = `<li class="empty"><strong>Nothing matches</strong>
        Loosen a filter, or press <kbd>x</kbd> to clear them all.</li>`;
      return;
    }
    list.innerHTML = visible.map(rowHtml).join('');
  }

  /* -------------------------------------------------------------- detail panel */

  function select(slug, scroll = true) {
    // Opening the detail is a navigation step, so back closes it and returns
    // to the list where it was. Stepping between kritis with j/k while it is
    // already open only replaces — otherwise scanning ten kritis would cost
    // ten presses of back to undo.
    const wasOpen = selected !== null;
    selected = slug;
    if (wasOpen) replaceNav();
    else pushNav();
    renderDetail();
    document.querySelectorAll('.row').forEach((el) => el.classList.toggle('sel', el.dataset.slug === slug));
    if (scroll) {
      const el = document.querySelector(`.row[data-slug="${CSS.escape(slug)}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
    if (window.matchMedia('(max-width: 61.99rem)').matches) $('#detail').classList.add('open');
  }

  function renderDetail() {
    const k = byKriti.get(selected);
    const holder = $('#detailContent');
    if (!k) {
      holder.classList.add('hidden');
      $('#detailPlaceholder').classList.remove('hidden');
      return;
    }
    $('#detailPlaceholder').classList.add('hidden');
    holder.classList.remove('hidden');

    const s = peek(k.slug);
    const sc = scripts(k);
    const raga = byRaga.get(k.raga_slug);
    const tala = byTala.get(k.tala);
    const parent = raga && raga.parent !== raga.slug ? byRaga.get(raga.parent) : null;
    const pos = visible.findIndex((x) => x.slug === k.slug);

    const structure = [
      'Pallavi',
      k.structure.anupallavi ? 'Anupallavi' : null,
      k.structure.charanams ? `${plural(k.structure.charanams, 'charanam', 'charanams')}` : null,
    ].filter(Boolean).join(' · ');

    holder.innerHTML = `
      <div class="detail-bar">
        <button class="iconbtn" id="detailClose" aria-label="Close">✕</button>
        <span class="cat">#${k.id}</span>
        <span class="spacer"></span>
        <button class="iconbtn mark fav" data-act="fav" data-slug="${esc(k.slug)}" aria-pressed="${s.fav}"
                title="Favourite (f)">${s.fav ? '★' : '☆'} </button>
        <button class="iconbtn mark bm" data-act="bm" data-slug="${esc(k.slug)}" aria-pressed="${s.bm}"
                title="Bookmark (b)">⚑</button>
      </div>

      <div class="detail-body">
        <div class="dtitle">
          ${sc.telugu && !sc.latin && k.title_telugu
            ? `<h2 class="te">${esc(k.title_telugu)}</h2>`
            : `<h2>${esc(k.title)}</h2>${
                sc.telugu && k.title_telugu ? `<div class="te">${esc(k.title_telugu)}</div>` : ''
              }`}
          <div class="line">
            <button type="button" class="raga" data-raga-link="${esc(k.raga_slug)}"
                    title="Open ${esc(k.raga)} in the Rāgas view">${
                      sc.telugu && !sc.latin && raga?.name_telugu ? esc(raga.name_telugu) : esc(k.raga)
                    }</button><span class="dot">·</span>
            <span>${esc(k.tala)}</span><span class="dot">·</span>
            <span>${esc(k.language)}</span><span class="dot">·</span>
            <span>${esc(k.deity)}</span>
            ${k.kshetra ? `<span class="dot">·</span><span>${esc(k.kshetra)}</span>` : ''}
            ${diffBars(k.difficulty)}
            ${k.confidence === 'high'
              ? '<span class="badge" style="border-color:var(--learnt);color:var(--learnt)" title="Raga and tala attribution is stable across the editions consulted">✓ cross-checked</span>'
              : '<span class="badge" style="border-color:var(--learning);color:var(--learning)" title="Attribution follows commonly cited listings but paṭhāntarams differ — check against your teacher\'s version">check attribution</span>'}
          </div>
          ${raga && (raga.aka || []).length
            ? `<div class="melaline" style="font-size:.75rem;color:var(--muted);margin-top:.25rem">also called ${
                raga.aka.map((a) => esc(a)).join(', ')}</div>`
            : ''}
        </div>

        <div class="statusrow">
          ${STATUSES.map((st) => `<button class="statusbtn s-${st.key}" data-status="${st.key}"
              aria-pressed="${s.status === st.key}">${st.label}</button>`).join('')}
        </div>

        <div class="card">
          <h3>${k.sahityam?.length ? 'సాహిత్యం · Sāhityam' : 'Pallavi'} <span class="side">${esc(structure)}</span></h3>
          ${k.sahityam?.length ? renderSahityam(k, sc) : `
            <div class="sahitya">${esc(k.pallavi)}</div>
            ${sc.telugu && k.pallavi_telugu ? `<div class="sahitya te">${esc(k.pallavi_telugu)}</div>` : ''}`}
          <div class="meaning" style="margin-top:.6rem">${esc(k.meaning)}</div>
          ${k.sahityam?.length && k.sahityam.length <= 2 && k.structure.charanams > 0 ? `
            <div class="notes" style="margin-top:.5rem;font-size:.76rem;color:var(--muted)">
              Only the sections above are verified — the remaining charaṇams are not in the
              dataset yet rather than being reconstructed from memory.
            </div>` : ''}
        </div>

        ${k.pratipadartham?.length ? `<div class="card">
          <h3>ప్రతిపదార్థం <span class="side">word by word, pallavi</span></h3>
          <dl class="ppa">${k.pratipadartham.map((w) => `
            <dt class="te">${esc(w.word)}</dt>
            <dd><span class="te">${esc(w.meaning_telugu)}</span>${
              w.meaning && sc.latin ? `<span class="en"> — ${esc(w.meaning)}</span>` : ''
            }</dd>`).join('')}</dl>
        </div>` : ''}

        ${k.notes ? `<div class="card"><h3>Study note</h3><div class="meaning">${esc(k.notes)}</div></div>` : ''}

        ${raga ? `<div class="card">
          <h3>Rāga <span class="side">${esc(raga.name)}${
            raga.name_telugu ? ` <span class="te">${esc(raga.name_telugu)}</span>` : ''
          }${raga.mela ? ` · mēḷa ${raga.mela}` : ''}</span></h3>
          <div class="melaline" style="font-size:.75rem;color:var(--muted)">
            ${esc(raga.type)}${parent ? ` of ${esc(parent.name)}` : ''}${raga.chakra ? ` · ${esc(raga.chakra)} chakra` : ''} · ${esc(raga.scale_type)}
          </div>
          <div class="swline"><span>ārō</span><span class="swaras">${swaraChips(raga.arohana)}</span></div>
          <div class="swline"><span>avarō</span><span class="swaras">${swaraChips(raga.avarohana)}</span></div>
          ${raga.mood ? `<div class="mood" style="margin-top:.5rem;font-size:.83rem;color:var(--ink-2)">${esc(raga.mood)}</div>` : ''}
          ${raga.notes ? `<div class="notes" style="margin-top:.35rem;font-size:.8rem;color:var(--muted)">${esc(raga.notes)}</div>` : ''}
        </div>` : ''}

        ${tala ? `<div class="card">
          <h3>Tāla <span class="side">${esc(tala.name)} · ${tala.aksharas} akṣaras</span></h3>
          <dl class="kv">
            <dt>Aṅgas</dt><dd>${esc(tala.angas)}</dd>
            ${tala.jati ? `<dt>Jāti</dt><dd>${esc(tala.jati)}</dd>` : ''}
            <dt>Counting</dt><dd>${esc(tala.counting)}</dd>
          </dl>
          ${tala.notes ? `<div class="notes" style="margin-top:.4rem;font-size:.8rem;color:var(--muted)">${esc(tala.notes)}</div>` : ''}
        </div>` : ''}

        ${(k.groups || []).length ? `<div class="card">
          <h3>Group</h3>
          ${k.groups.map((g) => {
            const grp = byGroup.get(g);
            if (!grp) return '';
            return `<div style="margin-bottom:.4rem">
              <button class="chip" data-filter="groups" data-value="${esc(g)}" aria-pressed="${filters.groups.has(g)}">${esc(grp.name)}</button>
              <div class="notes" style="margin-top:.3rem;font-size:.8rem;color:var(--muted)">${esc(grp.summary)}</div>
              ${grp.study_note ? `<div class="study">${esc(grp.study_note)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>` : ''}

        <div class="card">
          <h3>Practice log</h3>
          <div class="practice">
            <span class="tally">${s.practice}</span>
            <span class="when">sessions · last ${esc(relativeDay(s.last))}</span>
            <span class="spacer" style="flex:1"></span>
            <button class="iconbtn" id="practiceBtn">+ Log a session <kbd>p</kbd></button>
            ${s.practice ? '<button class="iconbtn" id="practiceUndo">−</button>' : ''}
          </div>
        </div>

        <div class="card">
          <h3>My notes <span class="side saved" id="noteSaved">saved</span></h3>
          <textarea class="notefield" id="noteField" placeholder="Sangatis to drill, where the eduppu falls, your guru's pāṭhāntaram, recordings to revisit…">${esc(s.note)}</textarea>
        </div>

        ${(k.tags || []).length ? `<div class="chips">${
          k.tags.map((t) => `<span class="chip" style="cursor:default">${esc(t.replace(/-/g, ' '))}</span>`).join('')
        }</div>` : ''}

        <div class="detail-nav">
          <button class="iconbtn" id="prevBtn" ${pos <= 0 ? 'disabled' : ''}>← ${
            pos > 0 ? esc(visible[pos - 1].title) : 'start'
          }</button>
          <button class="iconbtn" id="nextBtn" ${pos < 0 || pos >= visible.length - 1 ? 'disabled' : ''}>${
            pos >= 0 && pos < visible.length - 1 ? esc(visible[pos + 1].title) : 'end'
          } →</button>
        </div>
      </div>`;

    holder.querySelector('#detailClose').addEventListener('click', closeDetail);
    holder.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => setStatus(k.slug, btn.dataset.status));
    });
    holder.querySelector('#practiceBtn').addEventListener('click', () => logPractice(k.slug, 1));
    holder.querySelector('#practiceUndo')?.addEventListener('click', () => logPractice(k.slug, -1));
    holder.querySelector('#prevBtn').addEventListener('click', () => step(-1));
    holder.querySelector('#nextBtn').addEventListener('click', () => step(1));

    const field = holder.querySelector('#noteField');
    const flash = debounce(() => {
      const tag = holder.querySelector('#noteSaved');
      if (!tag) return;
      tag.classList.add('on');
      setTimeout(() => tag.classList.remove('on'), 1200);
    }, 300);
    field.addEventListener('input', () => {
      record(k.slug).note = field.value;
      saveStudy();
      flash();
    });
    field.addEventListener('blur', () => {
      renderCount();
      if (filters.marks.has('noted')) refresh();
    });
  }

  function closeDetail() {
    // Opening the detail pushed an entry, so closing it should pop that entry
    // rather than diverge from what the phone's back gesture does.
    if (history.state?.slug && selected) history.back();
    else {
      selected = null;
      $('#detail').classList.remove('open');
      renderDetail();
      replaceNav();
    }
  }

  function step(delta) {
    if (!visible.length) return;
    const pos = visible.findIndex((x) => x.slug === selected);
    const next = pos < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, pos + delta));
    select(visible[next].slug);
  }

  /* ------------------------------------------------------------ study actions */

  function setStatus(slug, status) {
    const r = record(slug);
    r.status = r.status === status && status !== 'todo' ? 'todo' : status;
    if (r.status === 'learnt' && !r.last) r.last = today();
    saveStudy();
    refresh();
    renderDetail();
  }

  function toggleMark(slug, which) {
    const r = record(slug);
    r[which] = !r[which];
    saveStudy();
    if (filters.marks.has(which)) refresh();
    else {
      updateRow(slug);
      if (selected === slug) renderDetail();
      renderCount();
    }
  }

  function logPractice(slug, delta) {
    const r = record(slug);
    r.practice = Math.max(0, (r.practice || 0) + delta);
    if (delta > 0) {
      r.last = today();
      if (r.status === 'todo') r.status = 'learning';
    }
    saveStudy();
    refresh();
    renderDetail();
  }

  function updateRow(slug) {
    const k = byKriti.get(slug);
    const el = document.querySelector(`.row[data-slug="${CSS.escape(slug)}"]`);
    if (!k || !el) return;
    const wrapper = document.createElement('tbody');
    wrapper.innerHTML = rowHtml(k);
    el.replaceWith(wrapper.querySelector('.row'));
  }

  /* ---------------------------------------------------------------- ragas view */

  /** A raga-wise, Telugu-first reading desk.  The catalog deliberately keeps
   * uncorroborated charanams out of its local data, so a song without a full
   * text gets a direct hand-off to the lyric repository instead of a made-up
   * completion. */
  // Exact title matches in Anupallavi's public, composer-tagged song index.
  // Do not manufacture a likely-looking URL for other records: a wrong source
  // is worse than no source when a student is learning text.
  const ANUPALLAVI_SLUGS = new Set([
    'anupama-gunambudhi', 'bhajana-seyave', 'bhuvini-dasudane', 'brova-bharama',
    'choodare-chelulara', 'dachukovalena', 'daya-seyavayya', 'dinamani-vamsa',
    'emi-jesitenemi', 'endaro-mahanubhavulu', 'endu-daginado', 'enta-muddo',
    'etula-brotuvo', 'gandhamu-puyyaruga', 'giripai-nelakonna', 'ee-vasudha-nivanti',
    'jagadanandakaraka', 'jnanamosaga-rada', 'koluvaiyunnade', 'mari-mari-ninne',
    'marugelara', 'naa-jivadhara', 'nagumomu-galavani', 'narada-muni-veduluna',
    'nee-naama-roopamulaku', 'ninne-bhajana', 'palukavademira', 'raju-vedale',
    'samaja-vara-gamana', 'sarasa-sama-dana', 'sitamma-mayamma',
    'sri-raghuvara-aprameya', 'sri-raghuvara-sugunalaya', 'sundari-nannindarilo',
    'sundari-nee-divya-roopamu', 'teliyaleru-rama', 'undedi-ramudokkadu',
    'vaddayundede', 'vandanamu-raghunandana', 'vaaridhi-neeku', 'vasudevayani',
    'vinave-o-manasa',
  ]);

  function lyricSource(k) {
    if (!ANUPALLAVI_SLUGS.has(k.slug)) return null;
    // The verified index uses these canonical URL slugs for the exact matches
    // above, including its established spelling variants.
    const path = {
      'choodare-chelulara': 'cudare-celulara', 'ee-vasudha-nivanti': 'i-vasudha-nivanti',
      'naa-jivadhara': 'na-jivadhara', 'narada-muni-veduluna': 'narada-muni-vedalina',
      'nee-naama-roopamulaku': 'ni-nama-rupamulaku', 'sundari-nee-divya-roopamu': 'sundari-ni-divya-rupamunu',
      'undedi-ramudokkadu': 'undedi-ramudokadu', 'vaaridhi-neeku': 'varidhi-niku',
    }[k.slug] || k.slug;
    return `https://www.anupallavi.com/song/${path}/`;
  }

  function renderLyricsView() {
    const byVisibleRaga = new Map();
    visible.forEach((k) => byVisibleRaga.set(k.raga_slug, [...(byVisibleRaga.get(k.raga_slug) ?? []), k]));
    const ragas = [...byVisibleRaga.keys()]
      .map((slug) => byRaga.get(slug))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const lyricCount = visible.filter((k) => k.sahityam?.length).length;

    const song = (k) => {
      const sections = k.sahityam || [{
        kind: 'pallavi', label_telugu: 'పల్లవి', telugu: k.pallavi_telugu || k.pallavi, verified: false,
      }];
      const sectionCount = k.sahityam?.length || 0;
      const expected = 1 + Number(k.structure.anupallavi) + k.structure.charanams;
      const complete = sectionCount >= expected;
      const source = lyricSource(k);
      return `<details class="lyric-song">
        <summary><span class="num">${k.id}</span><span class="te">${esc(k.title_telugu || k.title)}</span>
          <span class="side">${complete ? 'పూర్తి సాహిత్యం' : sectionCount ? `${sectionCount}/${expected} భాగాలు` : 'పల్లవి మాత్రమే'}</span></summary>
        <div class="lyric-body">
          ${sections.map((sec) => `<section class="lyric-section">
            <h4 class="te">${esc(sec.label_telugu)}</h4><p class="sahitya te">${esc(sec.telugu)}</p>
          </section>`).join('')}
          ${complete ? '' : `<p class="lyric-gap">ఈ కృతికి స్థానికంగా పూర్తి, ధృవీకరించిన సాహిత్యం ఇంకా లేదు.</p>`}
          <div class="lyric-actions">
            <button class="iconbtn" data-goto="${esc(k.slug)}">కృతి వివరాలు</button>
            ${source
              ? `<a class="iconbtn" href="${source}" target="_blank" rel="noopener noreferrer">Anupallavi మూలం ↗</a>`
              : '<span class="source-pending">మూలం: సేకరణలో ఉంది</span>'}
          </div>
        </div>
      </details>`;
    };

    $('#view-lyrics').innerHTML = `<div class="lyrics-head">
      <div><span class="count"><b>${ragas.length}</b> రాగాలు · <b>${visible.length}</b> కృతులు</span>
      <p>ప్రతి రాగాలోని కృతులను తెలుగులో చదవండి. స్థానిక పాఠ్యం పూర్తిగా ధృవీకరించబడిన చోట మాత్రమే చూపబడుతుంది; Anupallavi మూల లింకులు ఖచ్చితంగా సరిపోలిన కృతులకే చూపబడతాయి.</p></div>
    </div><div class="lyrics-ragas">${ragas.map((r) => {
      const songs = byVisibleRaga.get(r.slug).sort((a, b) => a.id - b.id);
      return `<article class="card lyric-raga" id="lyrics-${esc(r.slug)}">
        <h3><span>${esc(r.name)} ${r.name_telugu ? `<span class="te">${esc(r.name_telugu)}</span>` : ''}</span><span class="count">${songs.length}</span></h3>
        <div class="melaline">${esc(r.scale_type)}${r.mela ? ` · mēḷa ${r.mela}` : ''}</div>
        ${songs.map(song).join('')}
      </article>`;
    }).join('')}</div>`;
  }

  function renderRagasView() {
    const counts = new Map();
    visible.forEach((k) => counts.set(k.raga_slug, [...(counts.get(k.raga_slug) ?? []), k]));
    const withKritis = D.ragas
      .filter((r) => counts.has(r.slug))
      .sort((a, b) => counts.get(b.slug).length - counts.get(a.slug).length || a.name.localeCompare(b.name));
    const empty = D.ragas.filter((r) => !counts.has(r.slug));

    const card = (r) => {
      const mine = counts.get(r.slug) ?? [];
      const parent = r.parent !== r.slug ? byRaga.get(r.parent) : null;
      return `<article class="card ragacard" data-raga-card="${esc(r.slug)}">
        <h3><span>${
          prefs.script === 'telugu' && r.name_telugu
            ? `<span class="te">${esc(r.name_telugu)}</span>`
            : `${esc(r.name)}${
                prefs.script === 'both' && r.name_telugu
                  ? ` <span class="te" style="font-weight:500">${esc(r.name_telugu)}</span>` : ''
              }`
        }</span><span class="count">${mine.length || '—'}</span></h3>
        <div class="melaline">
          ${parent ? `janya of ${esc(parent.name)}` : 'melakarta'}${r.mela ? ` · mēḷa ${r.mela}` : ''}${
            r.chakra ? ` · ${esc(r.chakra)} chakra` : ''} · ${esc(r.scale_type)}${
            (r.aka || []).length ? ` · aka ${r.aka.map((a) => esc(a)).join(', ')}` : ''}
        </div>
        <div class="swline"><span>ārō</span><span class="swaras">${swaraChips(r.arohana)}</span></div>
        <div class="swline"><span>avarō</span><span class="swaras">${swaraChips(r.avarohana)}</span></div>
        ${r.mood ? `<div class="mood">${esc(r.mood)}</div>` : ''}
        ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}
        ${mine.length ? `<div class="kritilinks">${
          mine.sort((a, b) => a.id - b.id).map((k) => {
            const st = peek(k.slug).status;
            return `<button data-goto="${esc(k.slug)}"><span class="num">${k.id}</span><span>${linkTitle(k)}</span>${
              st === 'todo' ? '' : `<span class="st badge st-${st}">${st}</span>`}</button>`;
          }).join('')
        }</div>` : ''}
      </article>`;
    };

    $('#view-ragas').innerHTML = `
      <div class="listhead" style="position:static;border-top:0">
        <span class="count"><b>${withKritis.length}</b> rāgas in view · ${empty.length} more in the reference</span>
        <span class="spacer"></span>
        <button class="iconbtn" id="toggleEmptyRagas" aria-pressed="${prefs.showEmptyRagas}">
          ${prefs.showEmptyRagas ? 'Hide' : 'Show'} rāgas with no kṛti
        </button>
      </div>
      <div class="gridcards">${withKritis.map(card).join('')}${
        prefs.showEmptyRagas ? empty.map(card).join('') : ''
      }</div>`;
    $('#toggleEmptyRagas').addEventListener('click', () => {
      prefs.showEmptyRagas = !prefs.showEmptyRagas;
      savePrefs();
      renderRagasView();
    });

    if (pendingRagaFocus) {
      const target = pendingRagaFocus;
      pendingRagaFocus = null;
      const el = document.querySelector(`[data-raga-card="${CSS.escape(target)}"]`);
      if (!el && !prefs.showEmptyRagas && D.ragas.some((r) => r.slug === target)) {
        // Active filters hid every kṛti in this rāga, so its card was suppressed
        // — reveal it rather than land on what looks like a broken link.
        prefs.showEmptyRagas = true;
        savePrefs();
        pendingRagaFocus = target;
        renderRagasView();
      } else if (el) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ block: 'start', behavior: 'smooth' });
          el.classList.add('flash');
          setTimeout(() => el.classList.remove('flash'), 1400);
        });
      }
    }
  }

  /* --------------------------------------------------------------- groups view */

  function renderGroupsView() {
    const cards = D.groups.map((g) => {
      const mine = visible.filter((k) => (k.groups || []).includes(g.slug)).sort((a, b) => a.id - b.id);
      const all = D.kritis.filter((k) => (k.groups || []).includes(g.slug)).length;
      const learnt = mine.filter((k) => peek(k.slug).status === 'learnt').length;
      const gap = g.expected_count !== null && all < g.expected_count;
      return `<article class="card groupcard">
        <h3><span>${esc(g.name)}</span><span class="count">${all}${
          g.expected_count ? `/${g.expected_count}` : ''}</span></h3>
        <div class="melaline">${esc(g.kind)}${learnt ? ` · ${learnt} learnt` : ''}${
          gap ? ' · <span style="color:var(--learning)">catalog incomplete</span>' : ''}</div>
        <div class="notes">${esc(g.summary)}</div>
        ${g.study_note ? `<div class="study">${esc(g.study_note)}</div>` : ''}
        ${mine.length ? `<div class="kritilinks">${mine.map((k) => {
          const st = peek(k.slug).status;
          return `<button data-goto="${esc(k.slug)}"><span class="num">${k.id}</span><span>${linkTitle(k)} <span style="color:var(--accent)">${
            prefs.script === 'telugu' && byRaga.get(k.raga_slug)?.name_telugu
              ? `<span class="te">${esc(byRaga.get(k.raga_slug).name_telugu)}</span>` : esc(k.raga)
          }</span></span>${
            st === 'todo' ? '' : `<span class="st badge st-${st}">${st}</span>`}</button>`;
        }).join('')}</div>` : `<div class="notes" style="opacity:.7">${
          all === 0
            ? 'Not catalogued yet — this set is a documented gap, tracked by the dataset validator.'
            : 'No entries match the current filters.'
        }</div>`}
      </article>`;
    });
    $('#view-groups').innerHTML = `<div class="gridcards">${cards.join('')}</div>`;
  }

  /* ------------------------------------------------------------- progress view */

  function renderProgressView() {
    const all = D.kritis;
    const learnt = all.filter((k) => peek(k.slug).status === 'learnt');
    const learning = all.filter((k) => peek(k.slug).status === 'learning');
    const favs = all.filter((k) => peek(k.slug).fav);
    const bms = all.filter((k) => peek(k.slug).bm);
    const noted = all.filter((k) => (peek(k.slug).note || '').trim());
    const sessions = all.reduce((sum, k) => sum + (peek(k.slug).practice || 0), 0);
    const pct = (n) => `${((n / Math.max(1, all.length)) * 100).toFixed(1)}%`;

    const ragaRepertoire = new Map();
    for (const k of [...learnt, ...learning]) {
      const name = byRaga.get(k.raga_slug)?.name ?? k.raga;
      ragaRepertoire.set(name, (ragaRepertoire.get(name) ?? 0) + 1);
    }

    const byDifficulty = [1, 2, 3, 4, 5].map((d) => {
      const set = all.filter((k) => k.difficulty === d);
      return { d, total: set.length, learnt: set.filter((k) => peek(k.slug).status === 'learnt').length };
    });

    const recent = all
      .filter((k) => peek(k.slug).last)
      .sort((a, b) => String(peek(b.slug).last).localeCompare(String(peek(a.slug).last)))
      .slice(0, 8);

    const nextUp = all
      .filter((k) => {
        const s = peek(k.slug);
        return s.status !== 'learnt' && (s.bm || s.fav);
      })
      .sort((a, b) => a.difficulty - b.difficulty || b.popularity - a.popularity)
      .slice(0, 6);

    const linkList = (items, sub) => (items.length
      ? `<div class="kritilinks">${items.map((k) => `<button data-goto="${esc(k.slug)}">
          <span class="num">${k.id}</span><span>${linkTitle(k)}</span>
          <span class="st">${esc(sub(k))}</span></button>`).join('')}</div>`
      : '<div class="notes" style="opacity:.75">Nothing here yet.</div>');

    const barRows = (rows) => `<div class="barlist">${rows.map(([label, done, total]) => `
      <div class="barrow">
        <span class="lbl">${esc(label)}</span>
        <span class="bar"><i class="learnt" style="width:${(done / Math.max(1, total)) * 100}%"></i></span>
        <span class="n">${done}/${total}</span>
      </div>`).join('')}</div>`;

    $('#view-progress').innerHTML = `
      <div class="progress-wrap">
        <div class="tiles">
          <div class="tile"><div class="v">${all.length}</div><div class="k">in catalog</div></div>
          <div class="tile learnt"><div class="v">${learnt.length}</div><div class="k">learnt · ${pct(learnt.length)}</div></div>
          <div class="tile learning"><div class="v">${learning.length}</div><div class="k">learning</div></div>
          <div class="tile fav"><div class="v">${favs.length}</div><div class="k">favourites</div></div>
          <div class="tile"><div class="v">${bms.length}</div><div class="k">bookmarked</div></div>
          <div class="tile"><div class="v">${sessions}</div><div class="k">practice sessions</div></div>
          <div class="tile"><div class="v">${ragaRepertoire.size}</div><div class="k">rāgas touched</div></div>
          <div class="tile"><div class="v">${noted.length}</div><div class="k">with notes</div></div>
        </div>

        <div class="card">
          <h3>Overall <span class="side">${learnt.length} learnt · ${learning.length} in progress · ${
            all.length - learnt.length - learning.length} untouched</span></h3>
          <span class="bar">
            <i class="learnt" style="width:${(learnt.length / Math.max(1, all.length)) * 100}%"></i>
            <i class="learning" style="width:${(learning.length / Math.max(1, all.length)) * 100}%"></i>
          </span>
        </div>

        <div class="card">
          <h3>Next up <span class="side">favourited or bookmarked, easiest first</span></h3>
          ${linkList(nextUp, (k) => `diff ${k.difficulty} · ${byRaga.get(k.raga_slug)?.name ?? k.raga}`)}
        </div>

        <div class="card">
          <h3>By difficulty</h3>
          ${barRows(byDifficulty.map((r) => [`difficulty ${r.d}`, r.learnt, r.total]))}
        </div>

        <div class="card">
          <h3>Your rāga repertoire <span class="side">learnt or learning</span></h3>
          ${ragaRepertoire.size
            ? `<div class="chips">${[...ragaRepertoire]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([name, n]) => `<span class="chip" style="cursor:default">${esc(name)}<span class="n">${n}</span></span>`)
                .join('')}</div>`
            : '<div class="notes" style="opacity:.75">Mark a kṛti as learning and it shows up here.</div>'}
        </div>

        <div class="card">
          <h3>Group coverage</h3>
          ${barRows(D.groups.map((g) => {
            const set = D.kritis.filter((k) => (k.groups || []).includes(g.slug));
            return [g.name, set.filter((k) => peek(k.slug).status === 'learnt').length, set.length];
          }).filter(([, , total]) => total > 0))}
        </div>

        <div class="card">
          <h3>Recently practised</h3>
          ${linkList(recent, (k) => relativeDay(peek(k.slug).last))}
        </div>
      </div>`;
  }

  /* --------------------------------------------------------------------- views */

  function setView(view, initial = false) {
    const changed = prefs.view !== view;
    prefs.view = view;
    savePrefs();
    ['catalog', 'ragas', 'lyrics', 'groups', 'progress'].forEach((v) => {
      $(`#view-${v}`).classList.toggle('hidden', v !== view);
      $(`#tab-${v}`).setAttribute('aria-selected', String(v === view));
    });
    $('.listhead').classList.toggle('hidden', view !== 'catalog');
    if (!initial) refresh();
    // A real view switch is a "page" in this app — push so the back button
    // retraces it. Restoring from a popstate (suppressHistory) must not push
    // a second entry, and the very first render (initial) has nothing to push.
    if (!initial && changed) pushNav();
  }

  /** Jump to a rāga's card in the Rāgas view — used by the raga links in the
   *  catalog rows and the detail panel. */
  function goToRaga(slug) {
    if (!byRaga.has(slug)) return;
    pendingRagaFocus = slug;
    setView('ragas');
  }

  window.addEventListener('popstate', (e) => {
    const state = e.state || { view: 'catalog', slug: null, scrollY: 0 };
    suppressHistory = true;
    selected = state.slug && byKriti.has(state.slug) ? state.slug : null;
    if (prefs.view !== (state.view || 'catalog')) setView(state.view || 'catalog');
    else refresh();
    renderDetail();
    if (!selected) $('#detail').classList.remove('open');
    // Restore after layout has settled, or the browser clamps the scroll to
    // whatever height the list happened to have mid-render.
    requestAnimationFrame(() => window.scrollTo(0, state.scrollY || 0));
    suppressHistory = false;
  });

  /* --------------------------------------------------------------------- events */

  function toggleFilterValue(key, value) {
    const set = filters[key];
    if (!(set instanceof Set)) return;
    if (set.has(value)) set.delete(value);
    else set.add(value);
    refresh();
    renderRagaFilter($('#ragaSearch').value);
  }

  function wireEvents() {
    $('#q').addEventListener('input', debounce((e) => {
      filters.q = e.target.value.trim();
      refresh();
    }, 120));

    $('#sort').addEventListener('change', (e) => {
      prefs.sort = e.target.value;
      savePrefs();
      refresh();
    });

    document.querySelectorAll('.views button').forEach((btn) => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });

    $('#rail').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (btn && !btn.disabled) toggleFilterValue(btn.dataset.filter, btn.dataset.value);
    });

    $('#activeFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-clear]');
      if (!btn) return;
      const key = btn.dataset.clear;
      if (filters[key] instanceof Set) filters[key].delete(btn.dataset.value);
      else if (key === 'maxDifficulty') filters.maxDifficulty = 5;
      else if (key === 'minPopularity') filters.minPopularity = 1;
      refresh();
      renderRagaFilter($('#ragaSearch').value);
    });

    $('#ragaSearch').addEventListener('input', (e) => renderRagaFilter(e.target.value));

    $('#f-difficulty').addEventListener('input', (e) => {
      filters.maxDifficulty = Number(e.target.value);
      refresh();
    });
    $('#f-popularity').addEventListener('input', (e) => {
      filters.minPopularity = Number(e.target.value);
      refresh();
    });

    $('#resetBtn').addEventListener('click', clearFilters);

    // Row clicks, mark toggles and the cross-view "go to kriti" links.
    document.addEventListener('click', (e) => {
      const mark = e.target.closest('.mark[data-act]');
      if (mark) {
        e.stopPropagation();
        toggleMark(mark.dataset.slug, mark.dataset.act);
        return;
      }
      const ragaLink = e.target.closest('[data-raga-link]');
      if (ragaLink) {
        e.stopPropagation();
        goToRaga(ragaLink.dataset.ragaLink);
        return;
      }
      const goto = e.target.closest('[data-goto]');
      if (goto) {
        setView('catalog');
        select(goto.dataset.goto);
        return;
      }
      const detailChip = e.target.closest('.detail [data-filter]');
      if (detailChip) {
        toggleFilterValue(detailChip.dataset.filter, detailChip.dataset.value);
        return;
      }
      const row = e.target.closest('.row');
      if (row) select(row.dataset.slug, false);
    });

    $('#list').addEventListener('keydown', (e) => {
      const row = e.target.closest('.row');
      if (row && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        select(row.dataset.slug, false);
      }
    });

    $('#railBtn').addEventListener('click', () => {
      const open = $('#rail').classList.toggle('open');
      $('#scrim').classList.toggle('on', open);
      $('#railBtn').setAttribute('aria-expanded', String(open));
    });
    const closeRail = () => {
      $('#rail').classList.remove('open');
      $('#scrim').classList.remove('on');
      $('#railBtn').setAttribute('aria-expanded', 'false');
    };
    $('#scrim').addEventListener('click', closeRail);
    $('#railClose').addEventListener('click', closeRail);
    const openRail = () => {
      $('#rail').classList.add('open');
      $('#scrim').classList.add('on');
      $('#railBtn').setAttribute('aria-expanded', 'true');
    };
    wireEdgeSwipe(openRail, closeRail);

    $('#scriptBtn').addEventListener('click', () => {
      const order = ['both', 'latin', 'telugu'];
      prefs.script = order[(order.indexOf(prefs.script) + 1) % order.length];
      savePrefs();
      refresh();
      renderDetail();
    });

    $('#settingsBtn').addEventListener('click', () => {
      syncSettings();
      $('#settingsDlg').showModal();
    });

    $('#setScript').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-script]');
      if (!btn) return;
      prefs.script = btn.dataset.script;
      savePrefs();
      syncSettings();
      syncChips();
      refresh();
      renderDetail();
    });

    $('#setDensity').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-density]');
      if (!btn) return;
      prefs.compact = btn.dataset.density === 'compact';
      document.body.classList.toggle('compact', prefs.compact);
      savePrefs();
      syncSettings();
    });

    $('#helpBtn').addEventListener('click', () => $('#helpDlg').showModal());
    $('#dataBtn').addEventListener('click', () => {
      renderDataSummary();
      $('#dataDlg').showModal();
    });
    document.querySelectorAll('dialog [data-close]').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('dialog').close());
    });

    $('#exportBtn').addEventListener('click', exportStudy);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', importStudy);
    $('#wipeBtn').addEventListener('click', wipeStudy);

    document.addEventListener('keydown', onKey);
  }

  /** Edge swipe: drag in from the left screen edge to pull the filter rail
   *  out, swipe left on the open rail to put it away. Only below the desktop
   *  breakpoint, where the rail is a slide-over rather than a fixed column. */
  function wireEdgeSwipe(open, close) {
    const EDGE = 28;      // px from the left edge that counts as a starting grab
    const DISTANCE = 55;  // px of horizontal travel before it counts
    const SLOP = 45;      // px of vertical drift allowed before it reads as a scroll
    let x0 = 0;
    let y0 = 0;
    let tracking = null;

    const mobile = () => window.matchMedia('(max-width: 61.99rem)').matches;

    document.addEventListener('touchstart', (e) => {
      if (!mobile() || e.touches.length !== 1) { tracking = null; return; }
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      const isOpen = $('#rail').classList.contains('open');
      if (!isOpen && x0 <= EDGE) tracking = 'open';
      else if (isOpen) tracking = 'close';
      else tracking = null;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - x0;
      const dy = Math.abs(t.clientY - y0);
      if (dy > SLOP) { tracking = null; return; } // it's a scroll, leave it alone
      if (tracking === 'open' && dx > DISTANCE) { open(); tracking = null; }
      if (tracking === 'close' && dx < -DISTANCE) { close(); tracking = null; }
    }, { passive: true });

    document.addEventListener('touchend', () => { tracking = null; }, { passive: true });
  }

  function clearFilters() {
    filters.q = '';
    $('#q').value = '';
    ['status', 'marks', 'groups', 'ragas', 'talas', 'langs', 'deities'].forEach((k) => filters[k].clear());
    filters.maxDifficulty = 5;
    filters.minPopularity = 1;
    $('#f-difficulty').value = 5;
    $('#f-popularity').value = 1;
    refresh();
    renderRagaFilter($('#ragaSearch').value);
  }

  function onKey(e) {
    const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape') {
      if (document.querySelector('dialog[open]')) return; // native dialog handles it
      if ($('#rail').classList.contains('open')) {
        $('#rail').classList.remove('open');
        $('#scrim').classList.remove('on');
        return;
      }
      if ($('#detail').classList.contains('open')) closeDetail();
      if (typing) e.target.blur();
      return;
    }
    if (e.key === '/' && !typing) {
      e.preventDefault();
      $('#q').focus();
      $('#q').select();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'j': e.preventDefault(); step(1); break;
      case 'k': e.preventDefault(); step(-1); break;
      case 'f': if (selected) toggleMark(selected, 'fav'); break;
      case 'b': if (selected) toggleMark(selected, 'bm'); break;
      case '1': if (selected) setStatus(selected, 'todo'); break;
      case '2': if (selected) setStatus(selected, 'learning'); break;
      case '3': if (selected) setStatus(selected, 'learnt'); break;
      case 'p': if (selected) logPractice(selected, 1); break;
      case 'x': clearFilters(); break;
      case '?': $('#helpDlg').showModal(); break;
      default: break;
    }
  }

  /* ------------------------------------------------------------- data portability */

  function renderDataSummary() {
    const entries = Object.entries(study);
    const touched = entries.filter(([, v]) => v.status !== 'todo' || v.fav || v.bm || v.practice || (v.note || '').trim());
    $('#dataSummary').innerHTML = touched.length
      ? `You have marks on <b>${touched.length}</b> kṛtis — ${
          touched.filter(([, v]) => v.status === 'learnt').length} learnt, ${
          touched.filter(([, v]) => v.fav).length} favourited, ${
          touched.filter(([, v]) => (v.note || '').trim()).length} with notes.`
      : 'Nothing marked yet.';
    $('#dataMsg').textContent = '';
  }

  function exportStudy() {
    const payload = {
      app: 'tyagaraja-kriti-kosam',
      exported: new Date().toISOString(),
      dataset_version: D.manifest?.version ?? null,
      study,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kriti-kosam-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    $('#dataMsg').textContent = 'Exported.';
  }

  async function importStudy(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const incoming = payload.study ?? payload;
      if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('unexpected shape');
      let merged = 0;
      let unknown = 0;
      for (const [slug, value] of Object.entries(incoming)) {
        if (!byKriti.has(slug)) { unknown += 1; continue; }
        const r = record(slug);
        r.status = ['todo', 'learning', 'learnt'].includes(value.status) ? value.status : r.status;
        r.fav = Boolean(value.fav) || r.fav;
        r.bm = Boolean(value.bm) || r.bm;
        r.practice = Math.max(r.practice || 0, Number(value.practice) || 0);
        if (value.last && String(value.last) > String(r.last ?? '')) r.last = String(value.last);
        if ((value.note || '').trim() && !(r.note || '').trim()) r.note = String(value.note);
        merged += 1;
      }
      saveStudy();
      refresh();
      renderDetail();
      renderDataSummary();
      $('#dataMsg').textContent = `Merged ${plural(merged, 'kṛti', 'kṛtis')}${
        unknown ? `, skipped ${unknown} unknown slug${unknown === 1 ? '' : 's'}` : ''}.`;
    } catch (err) {
      $('#dataMsg').textContent = `Could not read that file — ${err.message}`;
    } finally {
      e.target.value = '';
    }
  }

  function wipeStudy() {
    if (!confirm('Erase every mark, note and practice tally in this browser? This cannot be undone.')) return;
    study = {};
    try { localStorage.removeItem(STUDY_KEY); } catch (err) { /* nothing to remove */ }
    refresh();
    renderDetail();
    renderDataSummary();
    $('#dataMsg').textContent = 'Cleared.';
  }

  /* ------------------------------------------------------------------- PWA */

  function wirePwa() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => {
          console.warn('service worker registration failed', e);
        });
      });
    }

    // Chromium fires this instead of showing its own install affordance; stash
    // it so the Settings dialog can offer a real button. Other browsers (iOS)
    // never fire it, which is why the dialog also spells out the manual route.
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      $('#installBtn').classList.remove('hidden');
    });
    $('#installBtn').addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      $('#installBtn').classList.add('hidden');
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      $('#installBtn').classList.add('hidden');
      $('#installLine').textContent = 'Installed — this app now runs from your home screen and works offline.';
    });
  }

  wirePwa();
  boot();
})();
