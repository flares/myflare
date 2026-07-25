(function () {
  'use strict';

  // ---- config ----
  var START_DATE = '2026-07-17'; // YYYY-MM-DD, local
  var DAYS = 24;                 // span shown on the calendar
  var GOAL = 41;                 // total parayanas to complete
  var STORAGE_KEY = 'parayana.counts.v1';
  var LONG_PRESS_MS = 550;

  var WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  var MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parseKey(key) {
    var parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function toKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  function formatShort(date) {
    return MONTH_LABELS[date.getMonth()] + ' ' + date.getDate();
  }

  var startDate = parseKey(START_DATE);
  var endDate = addDays(startDate, DAYS - 1);
  var dateKeys = [];
  for (var i = 0; i < DAYS; i++) dateKeys.push(toKey(addDays(startDate, i)));
  var todayKey = toKey(new Date());

  // ---- storage ----
  function loadCounts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  function saveCounts(counts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  }
  var counts = loadCounts();

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ---- DOM refs ----
  var calendarEl = document.getElementById('calendar');
  var weekdaysEl = document.getElementById('weekdays');
  var rangeEl = document.getElementById('range');
  var totalCountEl = document.getElementById('totalCount');
  var totalLabelEl = document.getElementById('totalLabel');
  var progressFillEl = document.getElementById('progressFill');
  var totalbarEl = document.getElementById('totalbar');

  WEEKDAY_LABELS.forEach(function (label) {
    var span = document.createElement('span');
    span.textContent = label;
    weekdaysEl.appendChild(span);
  });

  rangeEl.textContent = formatShort(startDate) + ' – ' + formatShort(endDate) + ', ' + endDate.getFullYear();

  var cellEls = {}; // dateKey -> { el, dcount }

  // Calendar DOM is built exactly once. Taps/long-presses only ever mutate
  // the one cell involved (see updateCell) — the grid is never torn down
  // and rebuilt mid-interaction, so the element under a finger never gets
  // swapped out from under an in-progress touch.
  function buildCalendar() {
    calendarEl.innerHTML = '';
    cellEls = {};
    var leading = startDate.getDay();
    var totalCells = leading + DAYS;
    var trailing = (7 - (totalCells % 7)) % 7;

    for (var i = 0; i < leading; i++) {
      calendarEl.appendChild(makeEmptyCell());
    }
    dateKeys.forEach(function (key) {
      calendarEl.appendChild(makeDayCell(key));
    });
    for (var j = 0; j < trailing; j++) {
      calendarEl.appendChild(makeEmptyCell());
    }
  }

  function makeEmptyCell() {
    var el = document.createElement('div');
    el.className = 'day empty';
    return el;
  }

  function makeDayCell(key) {
    var date = parseKey(key);

    var el = document.createElement('div');
    el.className = 'day';
    el.dataset.date = key;
    if (key === todayKey) el.classList.add('today');

    var dnum = document.createElement('div');
    dnum.className = 'dnum';
    dnum.textContent = date.getDate();
    el.appendChild(dnum);

    var dcount = document.createElement('div');
    dcount.className = 'dcount';
    el.appendChild(dcount);

    cellEls[key] = { el: el, dcount: dcount };
    updateCell(key);
    attachPressHandlers(el, key);
    return el;
  }

  function updateCell(key) {
    var ref = cellEls[key];
    if (!ref) return;
    var count = counts[key] || 0;
    ref.el.classList.remove('lvl-1', 'lvl-2', 'lvl-3', 'lvl-4', 'lvl-5');
    if (count > 0) ref.el.classList.add('lvl-' + Math.min(count, 5));
    ref.dcount.textContent = count > 0 ? count : ' ';
  }

  function updateTotal() {
    var total = 0;
    Object.keys(counts).forEach(function (k) { total += counts[k] || 0; });

    totalCountEl.textContent = total;
    var pct = Math.min(100, (total / GOAL) * 100);
    progressFillEl.style.width = pct + '%';

    if (total >= GOAL) {
      totalLabelEl.textContent = '🎉 goal complete';
      totalbarEl.classList.add('complete');
    } else {
      totalLabelEl.textContent = 'parayanas so far';
      totalbarEl.classList.remove('complete');
    }
  }

  function commit(key) {
    saveCounts(counts);
    updateCell(key);
    updateTotal();
  }

  // ---- interactions: tap = +1, long-press = reset to 0 ----
  function attachPressHandlers(el, key) {
    var timer = null;
    var longPressed = false;

    function cancelTimer() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    el.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      longPressed = false;
      timer = setTimeout(function () {
        longPressed = true;
        counts[key] = 0;
        vibrate([30, 40, 30]);
        commit(key);
      }, LONG_PRESS_MS);
    });

    el.addEventListener('pointerup', function () {
      cancelTimer();
      if (!longPressed) {
        counts[key] = (counts[key] || 0) + 1;
        vibrate(15);
        commit(key);
      }
      longPressed = false;
    });

    el.addEventListener('pointercancel', function () {
      cancelTimer();
      longPressed = false;
    });
    el.addEventListener('pointerleave', function () {
      cancelTimer();
      longPressed = false;
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  buildCalendar();
  updateTotal();
})();
