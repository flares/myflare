/* render.js — canvas renderer: camera, wind, foliage, atmosphere.
 *
 * Performance notes, because this has to survive a lakh of taps:
 *
 *  - Branches are batched into ~14 Path2D buckets by quantised line width, so
 *    the whole skeleton costs ~14 stroke() calls instead of four thousand.
 *  - Foliage is drawn from pre-rendered sprites (leaf clusters baked once per
 *    theme) with plain drawImage — no per-frame gradients, no per-frame paths.
 *  - Past ~900 leaves the canopy switches from individual leaves to cluster
 *    sprites. That is also roughly when the camera has pulled back far enough
 *    that you could not tell them apart anyway.
 *  - Twigs are drawn back-to-front in a fixed, precomputed z order, so the
 *    canopy gets real depth without sorting anything per frame.
 */
var Render = (function () {
  'use strict';

  var LEAF_WORLD = 15;          /* leaf length in world units */
  var INDIVIDUAL_MAX = 1200;    /* leaves drawn one by one below this count */
  var MAX_SCALE = 2.8;
  var OVERFLOW = 1.45;          /* how far the canopy may bleed past the sides */
  var SPROUT_MS = 700;
  var SPARK_MS = 1000;
  var RIPPLE_MS = 850;
  var TINTS = 6;
  var VARIANTS = 3;

  var canvas, ctx;
  var W = 0, H = 0, dpr = 1;
  var running = false;
  var lastFrame = 0;
  var frameEMA = 16;
  var lowPower = false;

  var state = null;             /* latest Tree.update() result */
  var count = 0;

  var cam = { s: 1, x: 0, y: 0, ready: false };

  var sprouts = new Map();      /* twig*128+slot -> t0 */
  var sparks = [];
  var ripples = [];
  var motes = [];

  var NBUCK = 14;               /* quantised stroke widths for thin twigs */
  var barkPaths = new Array(NBUCK);
  var bucketW = new Float32Array(NBUCK);

  var theme = null;
  var leafSprites = [];         /* [tint] */
  var clusterSprites = [];      /* [tint][variant] */
  var freshLeaf = null;
  var glowSprite = null;

  /* --- palettes ---------------------------------------------------------- */

  var PALETTES = {
    light: {
      bark: '#5b4331',
      barkHi: '#856549',
      leaf: ['#27512e', '#2f6535', '#38783f', '#438c4a', '#4fa156', '#5eb565'],
      fresh: '#93d46a',
      glow: 'rgba(255, 252, 226, 0.55)',
      mote: 'rgba(255, 255, 240, 0.75)',
      ripple: 'rgba(60, 110, 75, 0.30)',
      additive: false
    },
    dark: {
      bark: '#2b201a',
      barkHi: '#54402e',
      leaf: ['#0f3320', '#15422a', '#1b5434', '#22683f', '#2b7e4d', '#37975d'],
      fresh: '#8fe6ac',
      glow: 'rgba(130, 225, 175, 0.24)',
      mote: 'rgba(180, 240, 205, 0.55)',
      ripple: 'rgba(150, 235, 190, 0.30)',
      additive: true
    }
  };

  /* --- colour helpers ---------------------------------------------------- */

  function rgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function shade(hex, amt) {
    var c = rgb(hex);
    var t = amt < 0 ? 0 : 255;
    var p = Math.abs(amt);
    return 'rgb(' + Math.round(c[0] + (t - c[0]) * p) + ',' +
                    Math.round(c[1] + (t - c[1]) * p) + ',' +
                    Math.round(c[2] + (t - c[2]) * p) + ')';
  }

  function scratch(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* --- sprites ----------------------------------------------------------- */

  /* A leaf pointing up, stem base at (S/2, S*0.94). */
  function makeLeaf(color, size) {
    var S = size || 72;
    var c = scratch(S, S);
    var g = c.getContext('2d');

    var baseY = S * 0.94, tipY = S * 0.06, midX = S * 0.5;

    var grad = g.createLinearGradient(midX, baseY, midX, tipY);
    grad.addColorStop(0, shade(color, -0.30));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, shade(color, 0.30));

    g.beginPath();
    g.moveTo(midX, baseY);
    g.bezierCurveTo(S * 0.02, S * 0.72, S * 0.14, S * 0.20, midX, tipY);
    g.bezierCurveTo(S * 0.86, S * 0.20, S * 0.98, S * 0.72, midX, baseY);
    g.closePath();
    g.fillStyle = grad;
    g.fill();

    /* midrib + a sliver of specular, which is most of the "3D" read */
    g.strokeStyle = shade(color, -0.42);
    g.globalAlpha = 0.55;
    g.lineWidth = Math.max(1, S * 0.018);
    g.beginPath();
    g.moveTo(midX, baseY * 0.99);
    g.quadraticCurveTo(midX + S * 0.02, S * 0.5, midX, tipY + S * 0.04);
    g.stroke();

    g.globalAlpha = 0.30;
    g.strokeStyle = shade(color, 0.62);
    g.lineWidth = Math.max(1, S * 0.03);
    g.beginPath();
    g.moveTo(S * 0.30, S * 0.66);
    g.quadraticCurveTo(S * 0.30, S * 0.34, midX - S * 0.04, S * 0.18);
    g.stroke();
    g.globalAlpha = 1;

    return c;
  }

  /* A rosette of small leaves, baked once and blitted per twig. */
  function makeCluster(tintIdx, variant, pal) {
    var S = 128;
    var c = scratch(S, S);
    var g = c.getContext('2d');
    var cx = S / 2, cy = S / 2;

    /* soft mass underneath, so dense canopy does not look like loose confetti */
    var grad = g.createRadialGradient(cx - S * 0.10, cy - S * 0.12, S * 0.03, cx, cy, S * 0.40);
    grad.addColorStop(0, shade(pal.leaf[Math.min(TINTS - 1, tintIdx + 1)], 0.10));
    grad.addColorStop(0.55, pal.leaf[tintIdx]);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.8;
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, S * 0.40, 0, 6.2832);
    g.fill();
    g.globalAlpha = 1;

    var seed = (tintIdx * 31 + variant * 7 + 3) >>> 0;
    var n = 17;
    for (var i = 0; i < n; i++) {
      /* Golden-angle placement — a uniform i/n ring bakes a visible starburst
       * into every clump, and 2048 identical starbursts read as wallpaper. */
      var t = i * 2.39996 + variant * 1.7;
      var j = ((seed + i * 2654435761) >>> 8) / 16777216;
      var rad = S * 0.17 * Math.sqrt((i + 0.6) / n);
      var lx = cx + Math.cos(t) * rad;
      var ly = cy + Math.sin(t) * rad;
      var size = S * (0.24 + j * 0.11);
      var tint = leafSprites[Math.max(0, Math.min(TINTS - 1, tintIdx + (j > 0.62 ? 1 : j < 0.22 ? -1 : 0)))];

      g.save();
      g.translate(lx, ly);
      g.rotate(t + Math.PI / 2 + (j - 0.5) * 0.8);
      g.globalAlpha = 0.92;
      g.drawImage(tint, -size / 2, -size * 0.88, size, size);
      g.restore();
    }
    g.globalAlpha = 1;
    return c;
  }

  function makeGlow(color) {
    var S = 128;
    var c = scratch(S, S);
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.18)'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return c;
  }

  function buildSprites() {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = PALETTES[dark ? 'dark' : 'light'];

    leafSprites = [];
    for (var i = 0; i < TINTS; i++) leafSprites.push(makeLeaf(theme.leaf[i]));
    freshLeaf = makeLeaf(theme.fresh);

    clusterSprites = [];
    for (i = 0; i < TINTS; i++) {
      var row = [];
      for (var v = 0; v < VARIANTS; v++) row.push(makeCluster(i, v, theme));
      clusterSprites.push(row);
    }

    glowSprite = makeGlow(theme.glow);
  }

  /* --- setup ------------------------------------------------------------- */

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam.ready = false;          /* re-fit rather than drift into place */
    seedMotes();
  }

  function seedMotes() {
    var target = lowPower ? 0 : 26;
    motes.length = 0;
    for (var i = 0; i < target; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.8 + Math.random() * 2.0,
        sp: 0.10 + Math.random() * 0.30,
        ph: Math.random() * 6.2832,
        a: 0.25 + Math.random() * 0.5
      });
    }
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var i = 0; i < NBUCK; i++) bucketW[i] = Math.pow(2, (i - 6) / 2);

    buildSprites();
    resize();

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onTheme = function () { buildSprites(); };
      if (mq.addEventListener) mq.addEventListener('change', onTheme);
      else if (mq.addListener) mq.addListener(onTheme);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !running) start();
    });
  }

  /* --- growth events ----------------------------------------------------- */

  function setCount(n, animate) {
    count = n;
    state = Tree.update(n);

    if (animate && state.newest) {
      var key = state.newest.twig * 128 + Math.min(127, state.newest.slot);
      sprouts.set(key, performance.now());
      if (sprouts.size > 48) {
        var oldest = sprouts.keys().next().value;
        sprouts.delete(oldest);
      }
      /* A single new leaf is invisible once the canopy is dense, so every
       * sprout also throws a brief glow at the twig it landed on. */
      sparks.push({ node: state.newest.node, t0: performance.now() });
      if (sparks.length > 36) sparks.shift();
    }
  }

  function ripple(x, y) {
    ripples.push({ x: x, y: y, t0: performance.now() });
    if (ripples.length > 14) ripples.shift();
  }

  /* --- camera ------------------------------------------------------------ */

  function updateCamera(dt) {
    var bb = state.bbox;
    var padX = W * 0.07 + 10;
    var padTop = H * 0.035 + 10;
    var padBottom = H * 0.035 + 34;

    var bw = Math.max(1, bb.maxX - bb.minX);
    var bh = Math.max(1, -bb.minY);

    /* A phone viewport is far taller than a tree is; fitting the width exactly
     * would leave the top two-thirds of the screen empty. Letting the canopy
     * run off the sides is what makes it read as a full-page tree. */
    var target = Math.min((W - padX * 2) / bw * OVERFLOW, (H - padTop - padBottom) / bh);
    target = Math.min(target, MAX_SCALE);

    var cx = (bb.minX + bb.maxX) / 2;
    var tx = W / 2 - cx * target;
    var ty = H - padBottom;

    if (!cam.ready) {
      cam.s = target; cam.x = tx; cam.y = ty; cam.ready = true;
      return;
    }
    /* frame-rate independent ease, so zoom-out feels the same on any device */
    var k = 1 - Math.pow(0.94, dt / 16.667);
    cam.s += (target - cam.s) * k;
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  /* --- branches ---------------------------------------------------------- */

  /* Branches are drawn two ways, and the split matters a lot for performance.
   *
   * Thick limbs get a tapered quad each: constant-width strokes made every
   * limb look telescoped, because each segment stepped down abruptly from the
   * last. Ending a segment at exactly the width its continuation begins with
   * makes the taper read as one continuous limb. These are filled one at a
   * time — batching four thousand quads into a single Path2D asks the
   * rasteriser to solve winding across the whole canvas and costs ~100ms.
   *
   * Thin twigs get plain strokes batched into quantised width buckets, so the
   * remaining few thousand segments cost a handful of stroke() calls. Below a
   * few pixels there is no visible step to fix anyway.
   */
  var TAPER_MIN = 5;            /* px width above which a segment is tapered */
  var TAPER_CAP = 600;          /* max tapered segments per frame */
  var taper = new Float32Array(TAPER_CAP * 7);
  var taperN = 0;

  function bucketFor(w) {
    var i = Math.round(Math.log(w) / Math.LN2 * 2) + 6;
    return i < 0 ? 0 : i >= NBUCK ? NBUCK - 1 : i;
  }

  function addSeg(paths, bi, x1, y1, x2, y2) {
    var p = paths[bi];
    if (!p) { p = paths[bi] = new Path2D(); }
    p.moveTo(x1, y1);
    p.lineTo(x2, y2);
  }

  function quad(x1, y1, x2, y2, w0, w1, a, off) {
    var nx = -Math.sin(a), ny = Math.cos(a);
    var h0 = w0 * 0.5, h1 = w1 * 0.5;
    var ox = nx * off, oy = ny * off;

    /* Run the quad a little past its endpoint so it overlaps whatever grows
     * out of it and the joint has no notch. (A disc at the joint would be the
     * obvious fix, but a circle in the same subpath winds opposite to the
     * quad for half the branch angles, and nonzero fill then punches a hole
     * clean through the fork.) */
    var ex = Math.cos(a) * h1 * 0.9, ey = Math.sin(a) * h1 * 0.9;
    var tx = x2 + ex + ox, ty = y2 + ey + oy;

    ctx.beginPath();
    ctx.moveTo(x1 + nx * h0 + ox, y1 + ny * h0 + oy);
    ctx.lineTo(tx + nx * h1, ty + ny * h1);
    ctx.lineTo(tx - nx * h1, ty - ny * h1);
    ctx.lineTo(x1 - nx * h0 + ox, y1 - ny * h0 + oy);
    ctx.closePath();
    ctx.fill();
  }

  function flushTapers(color, alpha, scale, off) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < taperN; i++) {
      var o = i * 7;
      var w0 = taper[o + 4], w1 = taper[o + 5];
      quad(taper[o], taper[o + 1], taper[o + 2], taper[o + 3],
           w0 * scale, w1 * scale, taper[o + 6], off * w0);
    }
    ctx.globalAlpha = 1;
  }

  function strokeBuckets(paths, color, alpha) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < NBUCK; i++) {
      var p = paths[i];
      if (!p) continue;
      ctx.lineWidth = bucketW[i];
      ctx.stroke(p);
      paths[i] = null;
    }
    ctx.globalAlpha = 1;
  }

  function drawBranch(node, x, y, ang, target, tw, gust, rootW) {
    if (node.lc === 0) return;          /* branch has not grown leaves yet */

    var R = node.reach * cam.s + 30;
    if (x + R < 0 || x - R > W || y + R < 0 || y - R > H) return;

    var sway = (gust + 0.55 * Math.sin(tw + node.phase)) * node.flex;
    var a = ang + node.rel + sway;
    var len = node.len * cam.s;
    var x2 = x + Math.cos(a) * len;
    var y2 = y + Math.sin(a) * len;

    var tip = node.depth >= target || !node.children;
    var w0 = node.wf * rootW * cam.s;
    var w1 = w0 * (tip ? 0.42 : 0.76);
    if (w0 < 0.8) w0 = 0.8;
    if (w1 < 0.6) w1 = 0.6;

    if (w0 >= TAPER_MIN && taperN < TAPER_CAP) {
      var o = taperN * 7;
      taper[o] = x; taper[o + 1] = y; taper[o + 2] = x2; taper[o + 3] = y2;
      taper[o + 4] = w0; taper[o + 5] = w1; taper[o + 6] = a;
      taperN++;
    } else {
      addSeg(barkPaths, bucketFor((w0 + w1) * 0.5), x, y, x2, y2);
    }

    if (tip) {
      node.px = x; node.py = y;
      node.sx = x2; node.sy = y2; node.sa = a;
      node.vis = true;
      return;
    }

    drawBranch(node.children[0], x2, y2, a, target, tw, gust, rootW);
    drawBranch(node.children[1], x2, y2, a, target, tw, gust, rootW);
  }

  /* --- foliage ----------------------------------------------------------- */

  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    var u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }

  function drawFoliage(now) {
    var twigs = state.twigs;
    var per = state.per;
    var zOrder = state.zOrder;
    var n = twigs.length;
    var individual = count <= INDIVIDUAL_MAX && !lowPower;

    /* Light falls from above, so shade the canopy by height as well as by
     * front-to-back position. This is what stops a dense canopy reading as a
     * flat green cut-out. */
    var topY = cam.y + state.bbox.minY * cam.s;
    var span = Math.max(1, cam.y - topY);

    /* Foliage scales with the twig it sits on, so the canopy always follows
     * the branch structure instead of ballooning into a hedge. */
    var density = 0.78 + 0.72 * Math.min(1, Math.log(1 + count / n) / 3.93);

    /* A saturated canopy is ~5x overdrawn, and the back of it is not visible
     * anyway. Thin out the rear layers to a budget and widen what is left —
     * this is pure fill-rate saving, and it is what keeps a lakh of leaves
     * cheap on a phone. */
    var budget = lowPower ? 700 : 1100;
    var drop = n - budget;
    var backZone = drop > 0 ? Math.min(n, drop * 2) : 0;

    for (var k = 0; k < n; k++) {
      if (k < backZone && (k & 1)) continue;
      var t = twigs[zOrder[k]];
      if (!t.vis) continue;
      var c = per[t.twig];
      if (c <= 0) continue;

      var vert = 1 - (t.sy - topY) / span;          /* 1 at the crown, 0 at the base */
      if (vert < 0) vert = 0; else if (vert > 1) vert = 1;
      var ti = ((vert * 0.58 + t.z * 0.42) * (TINTS - 1) + 0.5) | 0;
      if (ti < 0) ti = 0; else if (ti > TINTS - 1) ti = TINTS - 1;

      if (individual) {
        for (var s = 0; s < c; s++) {
          var n1 = Tree.slotNoise(t.seed, s, 1);
          var n2 = Tree.slotNoise(t.seed, s, 2);
          var n3 = Tree.slotNoise(t.seed, s, 3);
          var size = LEAF_WORLD * (0.74 + n2 * 0.52) * cam.s;

          /* Spread along the twig, fan out sideways, and let a few sit past
           * the tip — leaves pinned to the twig axis stack into a corn cob. */
          var f = 0.02 + 1.06 * ((s + 0.5) / c);
          var lx = t.px + (t.sx - t.px) * f;
          var ly = t.py + (t.sy - t.py) * f;
          var jit = (n3 - 0.5) * size * 0.7;
          lx += -Math.sin(t.sa) * jit;
          ly += Math.cos(t.sa) * jit;

          var side = (s & 1) ? 1 : -1;
          var la = t.sa + side * (0.5 + n1 * 1.0);

          var sprite = leafSprites[ti];
          var pop = 1;
          var t0 = sprouts.get(t.twig * 128 + Math.min(127, s));
          if (t0 !== undefined) {
            var age = (now - t0) / SPROUT_MS;
            if (age >= 1) {
              sprouts.delete(t.twig * 128 + Math.min(127, s));
            } else {
              pop = easeOutBack(age < 0 ? 0 : age);
              if (age < 0.55) sprite = freshLeaf;
            }
          }
          if (size * pop < 0.6) continue;

          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(la + Math.PI / 2);
          var sz = size * pop;
          ctx.drawImage(sprite, -sz / 2, -sz * 0.9, sz, sz);
          ctx.restore();
        }
      } else {
        var r = t.len * (0.62 + t.z * 0.52) * density;
        if (k < backZone) r *= 1.2;        /* cover for the thinned-out neighbours */
        if (r < 7) r = 7; else if (r > 90) r = 90;
        r *= cam.s;
        if (r < 1.2) continue;
        ctx.drawImage(clusterSprites[ti][t.variant], t.sx - r, t.sy - r, r * 2, r * 2);
      }
    }
  }

  /* --- atmosphere -------------------------------------------------------- */

  function drawBaseGlow() {
    var r = Math.max(W, H) * 0.55;
    ctx.globalAlpha = 0.75;
    ctx.drawImage(glowSprite, cam.x + W * 0 - r, cam.y - r * 0.85, r * 2, r * 1.4);
    ctx.globalAlpha = 1;
  }

  function drawMotes(now, gust) {
    if (!motes.length) return;
    ctx.fillStyle = theme.mote;
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.x += (gust * 9 + 0.25) * m.sp;
      m.y -= m.sp * 0.32;
      m.y += Math.sin(now * 0.0006 + m.ph) * 0.16;
      if (m.x > W + 8) m.x = -8;
      if (m.x < -8) m.x = W + 8;
      if (m.y < -8) m.y = H + 8;
      ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(now * 0.0011 + m.ph));
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSparks(now) {
    if (!sparks.length) return;
    if (theme.additive) ctx.globalCompositeOperation = 'lighter';
    for (var i = sparks.length - 1; i >= 0; i--) {
      var sp = sparks[i];
      /* A tap dispatched mid-frame can carry a wall-clock stamp later than
       * this frame's rAF timestamp, so ages can start out negative. */
      var age = (now - sp.t0) / SPARK_MS;
      if (age >= 1) { sparks.splice(i, 1); continue; }
      if (age < 0) age = 0;
      if (!sp.node.vis) continue;
      var e = 1 - Math.pow(1 - age, 2);
      var r = (14 + 52 * e) * Math.min(1.6, Math.max(0.5, cam.s));
      ctx.globalAlpha = (1 - age) * (1 - age) * (theme.additive ? 0.55 : 0.40);
      ctx.drawImage(glowSprite, sp.node.sx - r, sp.node.sy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRipples(now) {
    if (!ripples.length) return;
    ctx.strokeStyle = theme.ripple;
    for (var i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      var age = (now - rp.t0) / RIPPLE_MS;
      if (age >= 1) { ripples.splice(i, 1); continue; }
      if (age < 0) age = 0;
      var e = 1 - Math.pow(1 - age, 3);
      ctx.globalAlpha = (1 - age) * 0.7;
      ctx.lineWidth = 2.2 * (1 - age) + 0.4;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 8 + 62 * e, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* --- frame ------------------------------------------------------------- */

  function frame(now) {
    if (!running) return;
    if (document.visibilityState === 'hidden') { running = false; return; }

    var dt = lastFrame ? Math.min(64, now - lastFrame) : 16.7;
    lastFrame = now;
    frameEMA += (dt - frameEMA) * 0.05;

    /* Hysteresis, so a single slow moment does not permanently downgrade the
     * scene and a recovered device gets its motes back. */
    if (!lowPower && frameEMA > 32 && count > INDIVIDUAL_MAX) {
      lowPower = true;
      seedMotes();
    } else if (lowPower && frameEMA < 19) {
      lowPower = false;
      seedMotes();
    }

    updateCamera(dt);

    ctx.clearRect(0, 0, W, H);

    /* wind: three lazy sines, so it never audibly repeats */
    var tw = now * 0.0011;
    var gust = 0.62 * Math.sin(now * 0.00041) +
               0.31 * Math.sin(now * 0.00097 + 1.3) +
               0.16 * Math.sin(now * 0.00233 + 2.6);

    drawBaseGlow();

    var twigs = state.twigs;
    for (var i = 0; i < twigs.length; i++) twigs[i].vis = false;

    taperN = 0;
    drawBranch(Tree.root, cam.x, cam.y, 0, state.depth, tw, gust, state.rootWidth);

    strokeBuckets(barkPaths, theme.bark, 1);
    flushTapers(theme.bark, 1, 1, 0);
    flushTapers(theme.barkHi, 0.5, 0.34, -0.21);

    drawFoliage(now);
    drawSparks(now);
    drawMotes(now, gust);
    drawRipples(now);

    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastFrame = 0;
    requestAnimationFrame(frame);
  }

  return {
    init: init,
    start: start,
    setCount: setCount,
    ripple: ripple
  };
})();
