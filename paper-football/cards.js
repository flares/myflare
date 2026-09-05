/* Paper Football — movement card deck + card renderer.
 * Exposes window.PF_DECK and window.PFCards.
 * Must not reference anything from game.js or board.js.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // README §2.3 — the 12-card deck. Offsets are [dx,dy] from Player 1's
  // perspective. Order matches the spec table exactly.
  var PF_DECK = [
    { id: 'sprint', name: 'Sprint', offsets: [[1, 0], [2, 0], [3, 0]] },
    { id: 'winger', name: 'Winger', offsets: [[1, 0], [2, -2], [2, 2]] },
    { id: 'lob', name: 'Lob', offsets: [[-1, 0], [2, -1], [2, 1]] },
    { id: 'sidestep', name: 'Sidestep', offsets: [[1, -1], [1, 1], [0, -2], [0, 2]] },
    { id: 'backheel', name: 'Backheel', offsets: [[1, 0], [-2, 0], [-1, -1], [-1, 1]] },
    { id: 'volley', name: 'Volley', offsets: [[3, 0], [0, -3], [0, 3]] },
    { id: 'dribble', name: 'Dribble', offsets: [[1, -1], [1, 0], [1, 1], [0, -1], [0, 1]] },
    { id: 'cross', name: 'Cross', offsets: [[2, 0], [1, -3], [1, 3]] },
    { id: 'curl', name: 'Curl', offsets: [[0, -1], [0, 1], [3, -1], [3, 1]] },
    { id: 'bicycle', name: 'Bicycle', offsets: [[2, -2], [2, 2], [-2, -2], [-2, 2]] },
    { id: 'through-ball', name: 'Through Ball', offsets: [[-1, 0], [2, 0], [3, -2], [3, 2]] },
    { id: 'pivot', name: 'Pivot', offsets: [[-1, -1], [-1, 1], [1, -2], [1, 2]] }
  ];

  function drawSix() {
    var pool = PF_DECK.slice();
    // Fisher-Yates shuffle, take the first 6.
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, 6);
  }

  function offsets(card, player) {
    return card.offsets.map(function (o) {
      return player === 2 ? [-o[0], o[1]] : [o[0], o[1]];
    });
  }

  function make(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        node.setAttribute(k, attrs[k]);
      }
    }
    return node;
  }

  // 7x7 mini-grid, cell = 10 units, viewBox 0 0 70 70.
  var CELL = 10;
  var GRID = 7;

  function cellCenter(gx, gy) {
    return [gx * CELL + CELL / 2, gy * CELL + CELL / 2];
  }

  function buildGrid(card, player) {
    var svg = make('svg', {
      'class': 'pf-card-grid',
      viewBox: '0 0 ' + (GRID * CELL) + ' ' + (GRID * CELL)
    });

    var offs = offsets(card, player);
    var key = {};
    offs.forEach(function (o) {
      key[o[0] + ',' + o[1]] = true;
    });

    for (var gy = 0; gy < GRID; gy++) {
      for (var gx = 0; gx < GRID; gx++) {
        var dx = gx - 3;
        var dy = gy - 3;
        var c = cellCenter(gx, gy);
        var cx = c[0], cy = c[1];

        if (dx === 0 && dy === 0) {
          // Centre cell — the ball.
          var ballGroup = make('g', { 'class': 'pf-mark-ball' });
          ballGroup.appendChild(make('circle', {
            cx: cx, cy: cy, r: CELL * 0.36, 'class': 'pf-ball-body'
          }));
          ballGroup.appendChild(make('circle', {
            cx: cx, cy: cy, r: CELL * 0.14, 'class': 'pf-ball-core'
          }));
          svg.appendChild(ballGroup);
        } else if (key[dx + ',' + dy]) {
          svg.appendChild(make('rect', {
            x: cx - CELL * 0.3, y: cy - CELL * 0.3,
            width: CELL * 0.6, height: CELL * 0.6,
            rx: CELL * 0.16,
            'class': 'pf-mark'
          }));
        } else {
          svg.appendChild(make('rect', {
            x: gx * CELL + 1, y: gy * CELL + 1,
            width: CELL - 2, height: CELL - 2,
            rx: 1.4,
            'class': 'pf-cell-empty'
          }));
        }
      }
    }

    return svg;
  }

  function el(card, opts) {
    opts = opts || {};
    var player = opts.player === 2 ? 2 : 1;
    var size = opts.size === 'sm' ? 'sm' : 'lg';

    var wrap = document.createElement('div');
    wrap.className = 'pf-card pf-card--' + size + ' p' + player;
    wrap.setAttribute('data-card-id', card.id);

    wrap.appendChild(buildGrid(card, player));

    var nameEl = document.createElement('div');
    nameEl.className = 'pf-card-name';
    nameEl.textContent = card.name;
    wrap.appendChild(nameEl);

    return wrap;
  }

  window.PF_DECK = PF_DECK;
  window.PFCards = {
    drawSix: drawSix,
    offsets: offsets,
    el: el
  };
})();
