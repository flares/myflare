/* tree.js — the procedural tree.
 *
 * The single design constraint here is scale: this thing has to still be a
 * tree, and still hold 60fps, at a lakh of leaves. So nothing is stored per
 * leaf. The entire structure is a *pure function of the leaf count*:
 *
 *   count -> depth -> a binary skeleton -> N twigs -> leaves spread over twigs
 *
 * Depth only ever grows, and every node's shape is derived from a seed hashed
 * down from its parent, so growing a new level extends the existing tree
 * instead of reshuffling it — the trunk you saw at ten leaves is the same
 * trunk at a hundred thousand.
 *
 * Past MAX_DEPTH the skeleton stops branching and the twigs just carry denser
 * foliage, which is what a real canopy does anyway. That keeps the node count
 * bounded (4095 nodes) no matter how many times you tap.
 */
var Tree = (function () {
  'use strict';

  var MIN_DEPTH = 1;
  var MAX_DEPTH = 11;          /* 2^11 = 2048 twigs */
  var BASE_PER_TWIG = 8;       /* leaves a twig holds before the tree branches again */

  var ROOT_LEN = 100;
  var ROOT_SEED = 0x5eed17;

  var LEAF_MARGIN = 26;        /* world units of foliage overhang, for the bounding box */

  /* --- deterministic noise ---------------------------------------------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mix(a, b) {
    var h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h ^ b, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function unit(seed) { return (seed >>> 8) / 16777216; }

  /* --- nodes ------------------------------------------------------------- */

  function makeNode(seed, depth, len, wf, rel) {
    return {
      seed: seed,
      depth: depth,
      len: len,
      wf: wf,             /* width as a fraction of the trunk's width */
      rel: rel,           /* angle relative to the parent's angle */
      children: null,
      isTwig: false,
      reach: 0,           /* world distance from this node to its furthest tip */
      flex: 0,            /* how much wind bends this node */
      phase: unit(mix(seed, 77)) * 6.2832,
      twig: -1,           /* index into twigs[], twigs only */
      z: 0,               /* stable canopy depth in [0,1], twigs only */
      variant: 0,
      lc: 0,              /* leaves carried by this subtree right now */

      /* per-frame scratch, filled by the renderer */
      px: 0, py: 0, sx: 0, sy: 0, sa: 0, vis: false
    };
  }

  var root = makeNode(ROOT_SEED, 0, ROOT_LEN, 1, -Math.PI / 2);

  /* Extend the skeleton down to `target`. Children are memoised, so this only
   * ever does work for levels that did not exist yet. */
  function grow(node, target) {
    if (node.depth >= target) { node.isTwig = true; return; }
    node.isTwig = false;

    if (!node.children) {
      var r = mulberry32(node.seed);
      var side = r() < 0.5 ? 1 : -1;

      /* A dominant continuation plus a lateral shoot — sympodial branching,
       * which reads far more like a real tree than a symmetric fork. */
      var contLen = node.len * (0.80 + r() * 0.09);
      var contRel = side * (0.04 + r() * 0.15);
      var sideLen = node.len * (0.57 + r() * 0.17);
      var sideRel = -side * (0.38 + r() * 0.38);

      node.children = [
        makeNode(mix(node.seed, 1), node.depth + 1, contLen, node.wf * 0.76, contRel),
        makeNode(mix(node.seed, 2), node.depth + 1, sideLen, node.wf * 0.62, sideRel)
      ];
    }

    grow(node.children[0], target);
    grow(node.children[1], target);
  }

  /* --- placement --------------------------------------------------------- */

  var cache = {
    depth: -1,
    twigs: [],
    order: null,     /* twig indices in the order leaves fill them */
    zOrder: null,    /* twig indices back-to-front, for the canopy pass */
    per: null,       /* leaves currently on each twig */
    bbox: null
  };

  function place(node, x, y, parentAngle, target, out) {
    var a = parentAngle + node.rel;
    var x2 = x + Math.cos(a) * node.len;
    var y2 = y + Math.sin(a) * node.len;

    node.wx = x2; node.wy = y2; node.wa = a;
    node.flex = 0.009 + 0.125 * Math.pow(node.depth / target, 1.7);

    if (node.depth >= target) {
      node.twig = out.twigs.length;
      node.z = unit(mix(node.seed, 991));
      node.variant = mix(node.seed, 55) % 3;
      node.reach = LEAF_MARGIN;
      out.twigs.push(node);
      return;
    }

    place(node.children[0], x2, y2, a, target, out);
    place(node.children[1], x2, y2, a, target, out);
    node.reach = node.len + Math.max(node.children[0].reach, node.children[1].reach);
  }

  function rebuild(depth) {
    grow(root, depth);

    var out = { twigs: [] };
    place(root, 0, 0, 0, depth, out);

    var n = out.twigs.length;

    /* Leaves fill twigs in a scattered—but fixed—order, so the canopy fills
     * out evenly rather than sweeping left to right. */
    var order = new Int32Array(n);
    for (var i = 0; i < n; i++) order[i] = i;
    var keys = new Float64Array(n);
    for (i = 0; i < n; i++) keys[i] = unit(mix(out.twigs[i].seed, 313));
    var orderArr = Array.prototype.slice.call(order);
    orderArr.sort(function (a, b) { return keys[a] - keys[b]; });
    order = Int32Array.from(orderArr);

    /* Back-to-front canopy order gives the foliage real depth for free. */
    var zArr = Array.prototype.slice.call(order);
    for (i = 0; i < n; i++) zArr[i] = i;
    zArr.sort(function (a, b) { return out.twigs[a].z - out.twigs[b].z; });

    cache = {
      depth: depth,
      twigs: out.twigs,
      order: order,
      zOrder: Int32Array.from(zArr),
      per: new Int32Array(n),
      /* A trunk that stays 10 units wide looks like a stick holding up a
       * hedge once the canopy is a lakh of leaves; thicken it with depth so
       * the proportions hold at every size. */
      rootWidth: 5.5 + depth * 2.6,
      bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    };
  }

  /* Leaves only sit on the outer twigs, so a branch carrying none has not
   * grown yet. Walking the live subtree each update (4095 nodes at the very
   * most) gives the early plant a real seedling silhouette, and gives the
   * camera a bounding box of what is actually on screen. */
  function computeLive(node, target, per, bb) {
    var lc;
    if (node.depth >= target || !node.children) {
      lc = per[node.twig] || 0;
    } else {
      lc = computeLive(node.children[0], target, per, bb) +
           computeLive(node.children[1], target, per, bb);
    }
    node.lc = lc;

    if (lc > 0) {
      var m = node.depth >= target ? LEAF_MARGIN : 0;
      if (node.wx - m < bb.minX) bb.minX = node.wx - m;
      if (node.wx + m > bb.maxX) bb.maxX = node.wx + m;
      if (node.wy - m < bb.minY) bb.minY = node.wy - m;
    }
    return lc;
  }

  function depthFor(count) {
    var d = MIN_DEPTH;
    while (d < MAX_DEPTH && (1 << d) * BASE_PER_TWIG < count) d++;
    return d;
  }

  /* Spread `count` leaves over the twigs and report where the newest one
   * landed, so the renderer can pop it open. */
  function update(count) {
    count = Math.max(0, count | 0);

    var depth = depthFor(count);
    var grew = depth !== cache.depth;
    if (grew) rebuild(depth);

    var twigs = cache.twigs;
    var order = cache.order;
    var per = cache.per;
    var n = twigs.length;

    var base = Math.floor(count / n);
    var rem = count - base * n;

    for (var i = 0; i < n; i++) {
      per[order[i]] = base + (i < rem ? 1 : 0);
    }

    var bb = cache.bbox;
    bb.minX = 0; bb.maxX = 0; bb.minY = 0; bb.maxY = 0;
    computeLive(root, depth, per, bb);

    if (count === 0) {
      /* Nothing planted yet: show the bare stem so there is something to tap. */
      var node = root, guard = 0;
      while (node && guard++ < MAX_DEPTH + 2) {
        node.lc = 1;
        if (node.wx < bb.minX) bb.minX = node.wx;
        if (node.wx > bb.maxX) bb.maxX = node.wx;
        if (node.wy < bb.minY) bb.minY = node.wy;
        node = node.children ? node.children[0] : null;
      }
    }

    var newest = null;
    if (count > 0) {
      var fillIdx = rem === 0 ? n - 1 : rem - 1;
      var twigIdx = order[fillIdx];
      newest = { twig: twigIdx, slot: per[twigIdx] - 1, node: twigs[twigIdx] };
    }

    return {
      depth: depth,
      grew: grew,
      twigs: twigs,
      zOrder: cache.zOrder,
      per: per,
      bbox: bb,
      rootWidth: cache.rootWidth,
      newest: newest
    };
  }

  /* Deterministic jitter for a leaf slot, so leaves sit at stable angles. */
  function slotNoise(seed, slot, salt) {
    return unit(mix(mix(seed, slot + 1), salt));
  }

  return {
    root: root,
    update: update,
    slotNoise: slotNoise,
    MIN_DEPTH: MIN_DEPTH,
    MAX_DEPTH: MAX_DEPTH,
    BASE_PER_TWIG: BASE_PER_TWIG
  };
})();
