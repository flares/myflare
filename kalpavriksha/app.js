/* app.js — wiring: tap -> leaf -> sound -> tally, plus the details sheet. */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var detailsBtn = document.getElementById('detailsBtn');
  var dlg = document.getElementById('detailsDlg');
  var closeBtn = document.getElementById('closeBtn');
  var copyBtn = document.getElementById('copyBtn');
  var dayList = document.getElementById('dayList');
  var totalNum = document.getElementById('totalNum');

  var nf = new Intl.NumberFormat('en-IN');
  var count = Store.load();

  Render.init(stage);
  Render.setCount(count, false);
  Render.start();

  /* --- growing ----------------------------------------------------------- */

  function grow(x, y) {
    count = Store.add(1);
    Render.setCount(count, true);
    Render.ripple(x, y);
    Chant.play();
  }

  function isChrome(node) {
    while (node && node !== document.body) {
      if (node === detailsBtn || node === dlg) return true;
      node = node.parentNode;
    }
    return false;
  }

  stage.addEventListener('pointerdown', function (e) {
    if (dlg.open || isChrome(e.target)) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    grow(e.clientX, e.clientY);
  });

  /* Keyboard route, so the tree is reachable without a pointer. */
  stage.setAttribute('tabindex', '0');
  stage.addEventListener('keydown', function (e) {
    if (dlg.open) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      grow(window.innerWidth / 2, window.innerHeight * 0.55);
    }
  });

  /* iOS only unlocks audio inside a gesture handler. */
  window.addEventListener('pointerdown', function unlockOnce() {
    Chant.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
  }, { once: true });

  window.addEventListener('contextmenu', function (e) {
    if (!isChrome(e.target)) e.preventDefault();
  });

  /* --- details sheet ------------------------------------------------------ */

  function labelFor(key) {
    var parts = key.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(d.getTime())) return key;
    if (key === Store.dayKey()) return 'Today';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderDetails() {
    totalNum.textContent = nf.format(Store.total());

    var days = Store.byDay();
    dayList.textContent = '';

    if (!days.length) {
      var empty = document.createElement('p');
      empty.className = 'day-empty';
      empty.textContent = 'Nothing yet.';
      dayList.appendChild(empty);
      return;
    }

    var today = Store.dayKey();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < days.length; i++) {
      var row = document.createElement('div');
      row.className = 'day-row' + (days[i].date === today ? ' is-today' : '');

      var d = document.createElement('span');
      d.className = 'day-date';
      d.textContent = labelFor(days[i].date);

      var c = document.createElement('span');
      c.className = 'day-count';
      c.textContent = nf.format(days[i].count);

      row.appendChild(d);
      row.appendChild(c);
      frag.appendChild(row);
    }
    dayList.appendChild(frag);
  }

  function plainText() {
    var days = Store.byDay();
    var lines = ['Kalpavriksha — ' + nf.format(Store.total()) + ' leaves', ''];
    for (var i = 0; i < days.length; i++) {
      lines.push(days[i].date + '\t' + days[i].count);
    }
    return lines.join('\n');
  }

  detailsBtn.addEventListener('click', function () {
    Store.flush();
    renderDetails();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  });

  closeBtn.addEventListener('click', function () {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  });

  /* Click on the backdrop closes it. */
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) dlg.close();
  });

  copyBtn.addEventListener('click', function () {
    var text = plainText();
    var done = function () {
      copyBtn.textContent = 'Copied';
      copyBtn.classList.add('done');
      setTimeout(function () {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('done');
      }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  });

  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* nothing else to try */ }
    document.body.removeChild(ta);
  }

  /* --- PWA ---------------------------------------------------------------- */

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline is a bonus, not a requirement */ });
    });
  }
})();
