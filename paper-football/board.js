/* Paper Football — SVG pitch, goals, lattice, ball flight, trail, highlights.
 * Exposes window.PFBoard. Must not reference anything from game.js.
 * PFBoard owns all SVG inside #pitch; it knows no rules, tracks no turns,
 * detects no wins — it only draws what it is told.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';

  // Internal geometry unit (not CSS px — the SVG viewBox scales to fit
  // whatever box CSS gives it via preserveAspectRatio="xMidYMid meet").
  var CELL = 60;
  var GOAL_DEPTH = 70;   // room the goal net protrudes beyond the goal line
  var GOAL_MARGIN = 34;  // extra breathing room beyond the goal for badges/nets
  var PAD_Y = 34;        // top/bottom padding beyond the outer node rows

  var REDUCED_MOTION = false;
  try {
    REDUCED_MOTION = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* ignore */ }

  // ---- module state -------------------------------------------------
  var svg = null;
  var cols = 0, rows = 0;
  var colors = {};
  var deadSet = null;
  var ballNode = null;

  var layerGrass, layerMarkings, layerLattice, layerGoals,
      layerDead, layerTrail, layerFx, layerHighlight, layerBall;

  var ballOuter, ballSpin, ballScale, shadowEl;
  var ballTapHandler = null;
  var netLeft, netRight, flashLeft, flashRight;

  // ---- small helpers --------------------------------------------------

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    return node;
  }

  function clearNode(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function nx(col) { return col * CELL; }
  function ny(row) { return row * CELL; }

  function pitchW() { return (cols - 1) * CELL; }
  function pitchH() { return (rows - 1) * CELL; }

  function goalRow() { return Math.floor(rows / 2); }

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      var val = cs.getPropertyValue(name);
      return val && val.trim() ? val.trim() : fallback;
    }
    colors.p1 = v('--p1', '#2a6ff0');
    colors.p2 = v('--p2', '#e0393e');
    colors.grass = v('--grass', '#3f9a4e');
    colors.grassStripe = v('--grass-stripe', '#378a45');
    colors.markings = v('--markings', 'rgba(255,255,255,.55)');
    colors.grid = v('--grid', 'rgba(255,255,255,.18)');
  }

  function playerColor(player) {
    return player === 2 ? colors.p2 : colors.p1;
  }

  // Cubic-bezier easing evaluator (Newton-Raphson), so the flight arc and
  // the trail dash-offset can be driven from the same eased progress value
  // inside one requestAnimationFrame loop.
  function makeBezier(x1, y1, x2, y2) {
    function a(a1, a2) { return 1.0 - 3.0 * a2 + 3.0 * a1; }
    function b(a1, a2) { return 3.0 * a2 - 6.0 * a1; }
    function c(a1) { return 3.0 * a1; }

    function calcBezier(t, a1, a2) {
      return ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
    }
    function calcSlope(t, a1, a2) {
      return 3.0 * a(a1, a2) * t * t + 2.0 * b(a1, a2) * t + c(a1);
    }

    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var slope = calcSlope(t, x1, x2);
        if (Math.abs(slope) < 1e-6) break;
        var xEst = calcBezier(t, x1, x2) - x;
        t -= xEst / slope;
      }
      return calcBezier(t, y1, y2);
    };
  }

  var FLIGHT_EASE = makeBezier(0.22, 0.61, 0.36, 1);

  // ---- build: pitch / markings / lattice / goals -----------------------

  function buildDefs() {
    var defs = svgEl('defs', {});

    // Ball radial gradient (light from top-left).
    var grad = svgEl('radialGradient', {
      id: 'pf-ball-grad', cx: '35%', cy: '30%', r: '75%'
    });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#ffffff' }));
    grad.appendChild(svgEl('stop', { offset: '65%', 'stop-color': '#f2f2f0' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#c9c9c6' }));
    defs.appendChild(grad);

    // Ball drop-shadow.
    var shadowGrad = svgEl('radialGradient', { id: 'pf-shadow-grad', cx: '50%', cy: '50%', r: '50%' });
    shadowGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'rgba(0,0,0,.42)' }));
    shadowGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'rgba(0,0,0,0)' }));
    defs.appendChild(shadowGrad);

    // Net cross-hatch pattern.
    var pat = svgEl('pattern', {
      id: 'pf-net-pattern', width: 9, height: 9,
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    });
    pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 9, stroke: 'rgba(255,255,255,.25)', 'stroke-width': 1 }));
    pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 9, y2: 0, stroke: 'rgba(255,255,255,.25)', 'stroke-width': 1 }));
    defs.appendChild(pat);

    return defs;
  }

  function buildGrass() {
    var g = svgEl('g', { 'class': 'pf-grass' });
    var w = pitchW(), h = pitchH();

    g.appendChild(svgEl('rect', {
      x: 0, y: 0, width: w, height: h, fill: colors.grass
    }));

    var stripeW = w / cols;
    for (var i = 0; i < cols; i++) {
      if (i % 2 === 0) continue;
      g.appendChild(svgEl('rect', {
        x: i * stripeW, y: 0, width: stripeW, height: h,
        fill: colors.grassStripe
      }));
    }
    return g;
  }

  function markingLine(x1, y1, x2, y2) {
    return svgEl('line', {
      x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: colors.markings, 'stroke-width': 2, 'stroke-linecap': 'round'
    });
  }

  function buildMarkings() {
    var g = svgEl('g', {
      'class': 'pf-markings', fill: 'none', stroke: colors.markings, 'stroke-width': 2
    });
    var w = pitchW(), h = pitchH();

    // Outer boundary.
    g.appendChild(svgEl('rect', { x: 0, y: 0, width: w, height: h, rx: 2 }));

    // Halfway line.
    g.appendChild(markingLine(w / 2, 0, w / 2, h));

    // Centre circle + spot.
    var cr = Math.min(CELL * 1.6, h * 0.32);
    g.appendChild(svgEl('circle', { cx: w / 2, cy: h / 2, r: cr }));
    g.appendChild(svgEl('circle', {
      cx: w / 2, cy: h / 2, r: 3, fill: colors.markings, stroke: 'none'
    }));

    // Penalty + 6-yard boxes, each end.
    var boxH = Math.min(h * 0.62, h - CELL * 0.6);
    var boxDepth = Math.min(CELL * 2.3, w * 0.22);
    var smallH = Math.min(h * 0.34, boxH * 0.55);
    var smallDepth = Math.min(CELL * 1.05, boxDepth * 0.5);

    [0, w].forEach(function (edgeX) {
      var dir = edgeX === 0 ? 1 : -1;
      g.appendChild(svgEl('rect', {
        x: edgeX === 0 ? 0 : w - boxDepth,
        y: (h - boxH) / 2, width: boxDepth, height: boxH
      }));
      g.appendChild(svgEl('rect', {
        x: edgeX === 0 ? 0 : w - smallDepth,
        y: (h - smallH) / 2, width: smallDepth, height: smallH
      }));
      // Penalty arc (a small hint of the D, clipped to look like an arc).
      var arcCx = edgeX === 0 ? boxDepth : w - boxDepth;
      var path = svgEl('path', {
        d: describeArc(arcCx, h / 2, cr * 0.72,
          dir === 1 ? -55 : 235, dir === 1 ? 55 : 125)
      });
      g.appendChild(path);
    });

    // Corner arcs.
    var cornerR = Math.min(CELL * 0.32, 18);
    // Each quarter-arc must sweep *into* the pitch from its corner.
    [[0, 0, 90, 180], [w, 0, 180, 270], [0, h, 0, 90], [w, h, 270, 360]].forEach(function (c) {
      g.appendChild(svgEl('path', { d: describeArc(c[0], c[1], cornerR, c[2], c[3]) }));
    });

    return g;
  }

  function describeArc(cx, cy, r, startDeg, endDeg) {
    function pt(deg) {
      var rad = (deg - 90) * Math.PI / 180;
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    }
    var p1 = pt(startDeg), p2 = pt(endDeg);
    var largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
    return 'M ' + p1[0] + ' ' + p1[1] + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + p2[0] + ' ' + p2[1];
  }

  function buildLattice() {
    var g = svgEl('g', { 'class': 'pf-lattice' });
    var w = pitchW(), h = pitchH();

    var lines = svgEl('g', { stroke: colors.grid, 'stroke-width': 1 });
    for (var r = 0; r < rows; r++) {
      lines.appendChild(svgEl('line', { x1: 0, y1: ny(r), x2: w, y2: ny(r) }));
    }
    for (var c = 0; c < cols; c++) {
      lines.appendChild(svgEl('line', { x1: nx(c), y1: 0, x2: nx(c), y2: h }));
    }
    g.appendChild(lines);

    var dots = svgEl('g', { fill: 'rgba(255,255,255,.3)' });
    for (var rr = 0; rr < rows; rr++) {
      for (var cc = 0; cc < cols; cc++) {
        dots.appendChild(svgEl('circle', { cx: nx(cc), cy: ny(rr), r: 2 }));
      }
    }
    g.appendChild(dots);

    return g;
  }

  function buildGoal(side) {
    // side: 'left' | 'right'
    var isLeft = side === 'left';
    var gr = goalRow();
    var topY = ny(gr - 1);
    var botY = ny(gr + 1);
    var lineX = isLeft ? 0 : pitchW();
    var backX = isLeft ? -GOAL_DEPTH * 0.78 : pitchW() + GOAL_DEPTH * 0.78;
    var recede = CELL * 0.16;

    var g = svgEl('g', { 'class': 'pf-goal pf-goal--' + side });

    // Net (cross-hatch pattern) as a receding quadrilateral.
    var netPath = svgEl('path', {
      d: [
        'M', lineX, topY,
        'L', backX, topY + recede,
        'L', backX, botY - recede,
        'L', lineX, botY,
        'Z'
      ].join(' '),
      fill: 'url(#pf-net-pattern)',
      stroke: 'none',
      'class': 'pf-net'
    });
    g.appendChild(netPath);

    // Flash overlay for goal celebration.
    var flash = svgEl('path', {
      d: netPath.getAttribute('d'),
      fill: playerColor(isLeft ? 2 : 1),
      opacity: 0,
      'class': 'pf-goal-flash'
    });
    g.appendChild(flash);

    // Frame: near post line, crossbar (top), base (bottom), back edge.
    var frame = svgEl('g', {
      fill: 'none', stroke: '#ffffff', 'stroke-width': 3.4,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    frame.appendChild(svgEl('line', { x1: lineX, y1: topY, x2: lineX, y2: botY }));
    frame.appendChild(svgEl('line', { x1: lineX, y1: topY, x2: backX, y2: topY + recede }));
    frame.appendChild(svgEl('line', { x1: lineX, y1: botY, x2: backX, y2: botY - recede }));
    frame.appendChild(svgEl('line', { x1: backX, y1: topY + recede, x2: backX, y2: botY - recede }));
    g.appendChild(frame);

    // Keeper badge.
    var badgeColor = playerColor(isLeft ? 1 : 2);
    var badgeCx = lineX, badgeCy = ny(gr);
    var badgeR = Math.min(CELL * 0.34, 22);
    var badge = svgEl('g', { 'class': 'pf-keeper' });
    var badgeShadow = svgEl('circle', {
      cx: badgeCx, cy: badgeCy + 2, r: badgeR, fill: 'rgba(0,0,0,.32)'
    });
    var badgeCircle = svgEl('circle', {
      cx: badgeCx, cy: badgeCy, r: badgeR, fill: badgeColor,
      stroke: '#ffffff', 'stroke-width': 1.5
    });
    var badgeText = svgEl('text', {
      x: badgeCx, y: badgeCy, 'text-anchor': 'middle',
      'dominant-baseline': 'central', fill: '#ffffff',
      'font-size': badgeR * 1.15, 'font-weight': 800,
      'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif'
    });
    badgeText.textContent = isLeft ? 'M' : 'S';
    badge.appendChild(badgeShadow);
    badge.appendChild(badgeCircle);
    badge.appendChild(badgeText);
    g.appendChild(badge);

    if (isLeft) { netLeft = netPath; flashLeft = flash; }
    else { netRight = netPath; flashRight = flash; }

    return g;
  }

  function buildBall() {
    var g = svgEl('g', { 'class': 'pf-ball-layer' });

    shadowEl = svgEl('ellipse', {
      cx: 0, cy: 0, rx: CELL * 0.3, ry: CELL * 0.14,
      fill: 'url(#pf-shadow-grad)', 'class': 'pf-ball-shadow'
    });
    g.appendChild(shadowEl);

    ballOuter = svgEl('g', { 'class': 'pf-ball-outer' });
    ballSpin = svgEl('g', { 'class': 'pf-ball-spin' });
    ballScale = svgEl('g', { 'class': 'pf-ball-scale' });

    var r = CELL * 0.27;
    var ballBody = svgEl('g', { 'class': 'pf-ball' });
    ballBody.appendChild(svgEl('circle', {
      cx: 0, cy: 0, r: r, fill: 'url(#pf-ball-grad)',
      stroke: 'rgba(0,0,0,.35)', 'stroke-width': 0.75
    }));
    // Centre pentagon.
    ballBody.appendChild(svgEl('path', {
      d: pentagonPath(0, 0, r * 0.34), fill: '#161616'
    }));
    // Five surrounding seam hints.
    for (var i = 0; i < 5; i++) {
      var ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      var sx = Math.cos(ang) * r * 0.62;
      var sy = Math.sin(ang) * r * 0.62;
      ballBody.appendChild(svgEl('path', {
        d: pentagonPath(sx, sy, r * 0.19),
        fill: '#161616', opacity: 0.85,
        transform: 'rotate(' + (ang * 180 / Math.PI + 90) + ' ' + sx + ' ' + sy + ')'
      }));
      ballBody.appendChild(svgEl('line', {
        x1: 0, y1: 0, x2: sx, y2: sy,
        stroke: 'rgba(20,20,20,.55)', 'stroke-width': 0.6
      }));
    }

    ballScale.appendChild(ballBody);
    ballSpin.appendChild(ballScale);
    ballOuter.appendChild(ballSpin);

    // Generous invisible tap target riding along with the ball, outside the
    // spin/scale groups so it never rotates or squashes.
    var ballHit = svgEl('circle', {
      cx: 0, cy: 0, r: Math.max(CELL * 0.42, 26),
      fill: 'rgba(0,0,0,0)', 'class': 'pf-ball-hit'
    });
    ballHit.style.cursor = 'pointer';
    ballHit.style.pointerEvents = 'auto';
    ballHit.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      if (ballTapHandler) ballTapHandler();
    });
    ballOuter.appendChild(ballHit);

    g.appendChild(ballOuter);

    return g;
  }

  function pentagonPath(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 5; i++) {
      var ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    return 'M ' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' L ') + ' Z';
  }

  function setBallTransform(x, y, rot, sx, sy) {
    ballOuter.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    ballSpin.setAttribute('transform', 'rotate(' + rot + ')');
    ballScale.setAttribute('transform', 'scale(' + sx + ',' + sy + ')');
  }

  function setShadow(cx, cy, scale, opacity) {
    shadowEl.setAttribute('cx', cx);
    shadowEl.setAttribute('cy', cy);
    shadowEl.setAttribute('rx', CELL * 0.3 * scale);
    shadowEl.setAttribute('ry', CELL * 0.14 * scale);
    shadowEl.setAttribute('opacity', opacity);
  }

  // ---- public: init / place --------------------------------------------

  function build() {
    clearNode(svg);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    var w = pitchW();
    var h = pitchH();
    var minX = -(GOAL_DEPTH + GOAL_MARGIN);
    var minY = -PAD_Y;
    var vbW = w + 2 * (GOAL_DEPTH + GOAL_MARGIN);
    var vbH = h + 2 * PAD_Y;
    svg.setAttribute('viewBox', minX + ' ' + minY + ' ' + vbW + ' ' + vbH);

    svg.appendChild(buildDefs());

    layerGrass = buildGrass();
    svg.appendChild(layerGrass);

    layerMarkings = buildMarkings();
    svg.appendChild(layerMarkings);

    layerLattice = buildLattice();
    svg.appendChild(layerLattice);

    layerGoals = svgEl('g', { 'class': 'pf-goals' });
    layerGoals.appendChild(buildGoal('left'));
    layerGoals.appendChild(buildGoal('right'));
    svg.appendChild(layerGoals);

    layerDead = svgEl('g', { 'class': 'pf-dead' });
    svg.appendChild(layerDead);

    layerTrail = svgEl('g', {
      'class': 'pf-trail', fill: 'none',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    svg.appendChild(layerTrail);

    layerFx = svgEl('g', { 'class': 'pf-fx' });
    svg.appendChild(layerFx);

    layerHighlight = svgEl('g', { 'class': 'pf-highlight' });
    svg.appendChild(layerHighlight);

    layerBall = buildBall();
    svg.appendChild(layerBall);
  }

  function init(svgEl_, c, r) {
    svg = svgEl_;
    cols = c;
    rows = r;
    deadSet = {};
    ballNode = null;
    readColors();
    build();
  }

  function place(node) {
    ballNode = { col: node.col, row: node.row };
    var x = nx(node.col), y = ny(node.row);
    setBallTransform(x, y, 0, 1, 1);
    setShadow(x, y, 1, 0.55);
  }

  // ---- dead nodes / trail -----------------------------------------------

  function addDeadNode(node) {
    var key = node.col + ',' + node.row;
    if (deadSet[key]) return;
    deadSet[key] = true;
    var g = svgEl('g', { 'class': 'pf-dead-dot' });
    g.appendChild(svgEl('circle', {
      cx: nx(node.col), cy: ny(node.row), r: 6.5, fill: 'rgba(0,0,0,.38)'
    }));
    g.appendChild(svgEl('circle', {
      cx: nx(node.col), cy: ny(node.row), r: 6.5, fill: 'none',
      stroke: 'rgba(255,255,255,.8)', 'stroke-width': 1
    }));
    layerDead.appendChild(g);
  }

  function makeTrailPair(fromPt, toPt, color) {
    var d = 'M ' + fromPt[0] + ' ' + fromPt[1] + ' L ' + toPt[0] + ' ' + toPt[1];
    var outline = svgEl('path', {
      d: d, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 6.5
    });
    var line = svgEl('path', {
      d: d, stroke: color, 'stroke-width': 3, opacity: 0.85
    });
    layerTrail.appendChild(outline);
    layerTrail.appendChild(line);
    var len = line.getTotalLength();
    [outline, line].forEach(function (p) {
      p.setAttribute('stroke-dasharray', String(len));
      p.setAttribute('stroke-dashoffset', String(len));
    });
    return { outline: outline, line: line, len: len };
  }

  function setTrailProgress(pair, e) {
    var off = pair.len * (1 - e);
    pair.outline.setAttribute('stroke-dashoffset', String(off));
    pair.line.setAttribute('stroke-dashoffset', String(off));
  }

  // ---- move animation ------------------------------------------------

  function move(from, to, player) {
    return new Promise(function (resolve) {
      var color = playerColor(player);
      addDeadNode(from);

      var fromX = nx(from.col), fromY = ny(from.row);
      var toX = nx(to.col), toY = ny(to.row);
      var dist = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row)) || 1;

      var pair = makeTrailPair([fromX, fromY], [toX, toY], color);

      if (REDUCED_MOTION) {
        setTrailProgress(pair, 1);
        ballNode = { col: to.col, row: to.row };
        setBallTransform(toX, toY, 0, 1, 1);
        setShadow(toX, toY, 1, 0.55);
        spawnRingPulse(toX, toY, color, true);
        requestAnimationFrame(function () { requestAnimationFrame(resolve); });
        return;
      }

      var duration = 180 + 45 * dist;
      var dir = (to.col - from.col) >= 0 ? 1 : -1;
      // The arc peaks over the midpoint of the segment. Clamp the lift to the
      // headroom actually available above it, so a skim along the top row
      // stays inside the viewBox instead of clipping through the top edge.
      var headroom = (fromY + toY) / 2 - (-PAD_Y) - CELL * 0.27 - 4;
      var liftMax = Math.max(0, Math.min(0.35 * CELL * dist, headroom));
      var start = null;

      function frame(now) {
        if (start === null) start = now;
        var rt = Math.min(1, (now - start) / duration);
        var e = FLIGHT_EASE(rt);

        var groundX = fromX + (toX - fromX) * e;
        var groundY = fromY + (toY - fromY) * e;
        var arc = Math.sin(Math.PI * rt);
        var liftedY = groundY - liftMax * arc;
        var rot = 360 * dist * e * dir;

        setBallTransform(groundX, liftedY, rot, 1, 1);

        var shadowScale = Math.max(0.32, 1 - 0.62 * arc);
        var shadowOpacity = Math.max(0.14, 0.55 * (1 - 0.75 * arc));
        setShadow(groundX, groundY, shadowScale, shadowOpacity);

        setTrailProgress(pair, e);

        if (rt < 1) {
          requestAnimationFrame(frame);
        } else {
          landingSquash(toX, toY, rot, color);
        }
      }
      requestAnimationFrame(frame);

      function landingSquash(x, y, rot, color) {
        var squashDur = 90;
        var s = null;
        function sframe(now) {
          if (s === null) s = now;
          var rt = Math.min(1, (now - s) / squashDur);
          var sx = 1.18 + (1 - 1.18) * rt;
          var sy = 0.86 + (1 - 0.86) * rt;
          setBallTransform(x, y, rot, sx, sy);
          if (rt < 1) {
            requestAnimationFrame(sframe);
          } else {
            setBallTransform(x, y, rot, 1, 1);
            setShadow(x, y, 1, 0.55);
            spawnRingPulse(x, y, color, false);
            ballNode = { col: to.col, row: to.row };
            resolve();
          }
        }
        requestAnimationFrame(sframe);
      }
    });
  }

  function spawnRingPulse(x, y, color, instant) {
    var ring = svgEl('circle', {
      cx: x, cy: y, r: CELL * 0.24, fill: 'none',
      stroke: color, 'stroke-width': 3,
      'class': instant ? 'pf-land-ring pf-land-ring--instant' : 'pf-land-ring'
    });
    layerFx.appendChild(ring);
    var life = instant ? 1 : 520;
    setTimeout(function () {
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }, life + 40);
  }

  // ---- highlight -------------------------------------------------------

  function highlight(nodes, player, onPick) {
    clearHighlight();
    var color = playerColor(player);
    // Half a cell: the largest radius that stays tangent (never overlapping)
    // for the closest simultaneously-highlighted pair a single card can
    // produce (adjacent destinations 1 cell apart, e.g. Sprint's [1,0]/[2,0]).
    var hitR = CELL * 0.5;
    var ringR = Math.min(CELL * 0.24, 16);

    nodes.forEach(function (n) {
      var cx = nx(n.col), cy = ny(n.row);

      var disc = svgEl('circle', {
        cx: cx, cy: cy, r: ringR, fill: color, opacity: 0.24,
        'class': 'pf-highlight-disc'
      });
      var ring = svgEl('circle', {
        cx: cx, cy: cy, r: ringR, fill: 'none', stroke: color,
        'stroke-width': 2.5, 'class': 'pf-highlight-ring'
      });
      var hit = svgEl('circle', {
        cx: cx, cy: cy, r: hitR, fill: 'rgba(0,0,0,0)',
        'class': 'pf-hit'
      });
      hit.style.cursor = 'pointer';
      hit.style.pointerEvents = 'auto';

      (function (node) {
        hit.addEventListener('pointerdown', function (ev) {
          ev.stopPropagation();
          clearHighlight();
          onPick({ col: node.col, row: node.row });
        });
      })(n);

      layerHighlight.appendChild(disc);
      layerHighlight.appendChild(ring);
      layerHighlight.appendChild(hit);
    });
  }

  function clearHighlight() {
    if (layerHighlight) clearNode(layerHighlight);
  }

  // ---- goal celebration --------------------------------------------------

  function goalCelebrate(side) {
    var net = side === 'left' ? netLeft : netRight;
    var flash = side === 'left' ? flashLeft : flashRight;
    if (!net || !flash) return;

    [net, flash].forEach(function (el) {
      el.classList.remove('pf-celebrate');
      // Force reflow so re-triggering the animation on rapid consecutive
      // calls restarts it instead of being a no-op.
      void el.getBoundingClientRect();
      el.classList.add('pf-celebrate');
    });

    var dur = REDUCED_MOTION ? 60 : 620;
    setTimeout(function () {
      net.classList.remove('pf-celebrate');
      flash.classList.remove('pf-celebrate');
    }, dur);
  }

  // README §1.3 step 2 — tapping the ball itself reverts to the full union of
  // destinations. The ball is inside PFBoard's SVG, so the tap target lives
  // here and game.js just registers an intent handler.
  function onBallTap(handler) {
    ballTapHandler = typeof handler === 'function' ? handler : null;
  }

  window.PFBoard = {
    init: init,
    place: place,
    move: move,
    highlight: highlight,
    clearHighlight: clearHighlight,
    goalCelebrate: goalCelebrate,
    onBallTap: onBallTap
  };
})();
