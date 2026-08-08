(function () {
  'use strict';

  var REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildField(cols, rows, rand) {
    var field = new Float32Array(cols * rows);
    for (var i = 0; i < field.length; i++) field[i] = rand();
    return field;
  }

  function sampleField(field, cols, rows, u, v) {
    var x = u * (cols - 1), y = v * (rows - 1);
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var x1 = Math.min(x0 + 1, cols - 1), y1 = Math.min(y0 + 1, rows - 1);
    var sx = x - x0, sy = y - y0;
    var v00 = field[y0 * cols + x0], v10 = field[y0 * cols + x1];
    var v01 = field[y1 * cols + x0], v11 = field[y1 * cols + x1];
    var a = v00 + (v10 - v00) * sx;
    var b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function pickCellSize(baseCell, w, h, maxCells) {
    var cell = baseCell;
    while ((w / cell) * (h / cell) > maxCells) cell *= 1.15;
    return cell;
  }

  // ---------- Snow effect: the surface cracks into drifting snowflakes, revealing the page beneath ----------
  function makeSnowEffect(canvas, origin) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var rand = mulberry32(20260805);
    var noiseCols = 22, noiseRows = 13;
    var noiseField = buildField(noiseCols, noiseRows, rand);
    var noiseCols2 = 52, noiseRows2 = 30;
    var noiseField2 = buildField(noiseCols2, noiseRows2, mulberry32(773311));
    var w, h, cell, cols, rows, cellVals, cellTex;
    var flakes = [];

    function layout() {
      w = window.innerWidth; h = window.innerHeight;
      cell = pickCellSize(15, w, h, 8500);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
      var maxDist = Math.hypot(Math.max(origin.u, 1 - origin.u), Math.max(origin.v, 1 - origin.v)) || 1;
      cellVals = new Float32Array(cols * rows);
      cellTex = new Float32Array(cols * rows);
      var maxV = 0;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var u = (x + 0.5) / cols, v = (y + 0.5) / rows;
          var d = Math.hypot(u - origin.u, v - origin.v) / maxDist;
          var n1 = sampleField(noiseField, noiseCols, noiseRows, u, v);
          var n2 = sampleField(noiseField2, noiseCols2, noiseRows2, u, v);
          var n = n1 * 0.6 + n2 * 0.4;
          var val = d * 0.3 + n * 0.85;
          cellVals[y * cols + x] = val;
          cellTex[y * cols + x] = n2;
          if (val > maxV) maxV = val;
        }
      }
      for (var i = 0; i < cellVals.length; i++) cellVals[i] /= maxV || 1;
      // Remap to percentile rank so coverage grows ~linearly with progress instead of
      // clumping around the noise field's natural (non-uniform) middle values.
      var order = new Array(cellVals.length);
      for (var oi = 0; oi < order.length; oi++) order[oi] = oi;
      order.sort(function (a, b) { return cellVals[a] - cellVals[b]; });
      var ranked = new Float32Array(cellVals.length);
      var denom = Math.max(1, order.length - 1);
      for (var ri = 0; ri < order.length; ri++) ranked[order[ri]] = ri / denom;
      cellVals = ranked;
    }
    layout();
    var onResize = function () { layout(); };
    window.addEventListener('resize', onResize);

    function maybeFlake(progress) {
      if (flakes.length > 70 || Math.random() > 0.62) return;
      for (var tries = 0; tries < 6; tries++) {
        var x = (Math.random() * cols) | 0, y = (Math.random() * rows) | 0;
        var val = cellVals[y * cols + x];
        if (Math.abs(val - progress) < 0.045) {
          flakes.push({
            x: (x + 0.5) * cell, y: (y + 0.5) * cell,
            vx: (Math.random() - 0.5) * 32, vy: 28 + Math.random() * 46,
            rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 2.4,
            size: 2.4 + Math.random() * 3.4,
            life: 0, maxLife: 650 + Math.random() * 520
          });
          break;
        }
      }
    }

    function draw(progress, dt) {
      ctx.clearRect(0, 0, w, h);
      var edge = 0.1;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var idx = y * cols + x;
          var val = cellVals[idx];
          if (val > progress) continue;
          var px = x * cell, py = y * cell;
          var age = progress - val;
          var op = 0.86 + cellTex[idx] * 0.12;
          if (age < edge) op *= age / edge;
          ctx.fillStyle = 'rgba(255,255,255,' + op + ')';
          ctx.fillRect(px, py, cell + 1, cell + 1);
        }
      }
      for (var i = flakes.length - 1; i >= 0; i--) {
        var s = flakes[i];
        s.life += dt;
        if (s.life > s.maxLife) { flakes.splice(i, 1); continue; }
        s.x += s.vx * dt / 1000; s.y += s.vy * dt / 1000; s.rot += s.vr * dt / 1000;
        var a = 1 - s.life / s.maxLife;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.strokeStyle = 'rgba(255,255,255,' + a + ')';
        ctx.lineWidth = 1.2;
        for (var arm = 0; arm < 3; arm++) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(-s.size, 0);
          ctx.lineTo(s.size, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
      maybeFlake(progress);
    }

    return { draw: draw, destroy: function () { window.removeEventListener('resize', onResize); } };
  }

  // ---------- Fade effect: a quick, clean radial wipe ----------
  function makeFadeEffect(canvas, origin) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w, h, maxR;

    function layout() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var dx = Math.max(origin.u * w, w - origin.u * w);
      var dy = Math.max(origin.v * h, h - origin.v * h);
      maxR = Math.hypot(dx, dy);
    }
    layout();
    var onResize = function () { layout(); };
    window.addEventListener('resize', onResize);

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      var r = maxR * progress;
      if (r <= 0) return;
      ctx.fillStyle = '#15151b';
      ctx.beginPath();
      ctx.arc(origin.u * w, origin.v * h, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return { draw: draw, destroy: function () { window.removeEventListener('resize', onResize); } };
  }

  var animGen = 0;
  function animate(effect, from, to, duration, onDone) {
    var myGen = ++animGen;
    var start = null, last = null;
    function frame(ts) {
      if (myGen !== animGen) return; // superseded by a newer animation on this canvas
      if (start === null) { start = ts; last = ts; }
      var dt = ts - last; last = ts;
      var t = Math.min(1, (ts - start) / duration);
      var progress = from + (to - from) * easeInOutCubic(t);
      effect.draw(progress, dt);
      if (t < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function getOrigin(btn) {
    var rect = btn.getBoundingClientRect();
    return {
      u: (rect.left + rect.width / 2) / window.innerWidth,
      v: (rect.top + rect.height / 2) / window.innerHeight
    };
  }

  var DURATIONS = { snow: 1500, fade: 650 };

  function makeEffect(kind, canvas, origin) {
    return kind === 'snow' ? makeSnowEffect(canvas, origin) : makeFadeEffect(canvas, origin);
  }

  window.Portal = {
    init: function (config) {
      var canvas = document.getElementById('portalCanvas');
      var toggle = document.getElementById('realmToggle');
      if (!canvas || !toggle) return;
      var dest = toggle.getAttribute('data-dest');

      if (REDUCE_MOTION) {
        canvas.style.display = 'none';
        try { sessionStorage.removeItem('portalEnter'); } catch (e) {}
      } else {
        var enterKind = config.alwaysEnter || null;
        var enterOrigin = { u: 0.92, v: 0.05 };
        var stored = null;
        try { stored = JSON.parse(sessionStorage.getItem('portalEnter') || 'null'); } catch (e) {}
        if (stored && stored.dest === config.selfPath) {
          enterKind = stored.kind;
          enterOrigin = stored.origin;
        }
        try { sessionStorage.removeItem('portalEnter'); } catch (e) {}

        if (enterKind) {
          canvas.classList.add('active');
          var enterEffect = makeEffect(enterKind, canvas, enterOrigin);
          animate(enterEffect, 1, 0, DURATIONS[enterKind], function () {
            canvas.classList.remove('active');
            enterEffect.destroy();
          });
        }
      }

      toggle.addEventListener('click', function () {
        toggle.disabled = true;
        toggle.classList.toggle('is-dark');

        if (REDUCE_MOTION) {
          window.location.href = dest;
          return;
        }

        var origin = getOrigin(toggle);
        try {
          sessionStorage.setItem('portalEnter', JSON.stringify({ dest: dest, kind: config.exitEffect, origin: origin }));
        } catch (e) {}
        canvas.classList.add('active');
        var exitEffect = makeEffect(config.exitEffect, canvas, origin);
        animate(exitEffect, 0, 1, DURATIONS[config.exitEffect], function () {
          setTimeout(function () { window.location.href = dest; }, 90);
        });
      });
    }
  };
})();
