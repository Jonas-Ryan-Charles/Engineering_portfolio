/* ============================================================================
   MatrixElectricalBackground

   A polished, Matrix-inspired electrical-engineering ambient layer, drawn on a
   single transparent, fixed, pointer-events:none canvas that sits BEHIND all
   page content (.fx-bg, z-index:-1). It replaces the old pointer-reactive
   effect and touches nothing else on the page.

   What it renders (all low-opacity, atmospheric — never distracting):
     - Vertical streams of glowing green glyphs: binary + numerals + engineering
       symbols (0 1 Ω μ Δ Σ V A) with occasional tokens (IC PLC PCB FET), a
       bright near-white leading character and a dim, fading trail for depth.
     - Sparse right-angle circuit traces with connection nodes and a signal
       pulse travelling along each, revealed then faded.
     - An extremely subtle scanline texture and a soft green glow.

   Engineering / performance notes:
     - Canvas-based, device-pixel-ratio aware, re-sizes with the viewport.
     - Frame-rate capped (motion stays time-based, so the cap never slows it).
     - Density is reduced on small screens.
     - Pauses all work while the tab is hidden; respects prefers-reduced-motion
       (renders one quiet static frame, no loop).
     - Cleans up its listeners and animation frame on pagehide.
     - Draws with clearRect each frame so the page's own grid stays visible in
       the gaps and content backgrounds keep the rain off text and cards.

   Classic script (matches this repo's no-build convention).
   ============================================================================ */
(function () {
  "use strict";

  /* ---- Tunables ---------------------------------------------------------- */
  var FONT_DESKTOP = 15;         // glyph size (px)
  var FONT_MOBILE = 13;
  var COL_SPACING = 1.9;         // column pitch as a multiple of font size (low density)
  var ACTIVE_FRACTION = 0.72;    // portion of columns actually raining at once
  var TRAIL_MIN = 6, TRAIL_MAX = 16;      // trail length in cells (desktop)
  var TRAIL_MIN_M = 5, TRAIL_MAX_M = 9;   // mobile
  var SPEED_MIN = 5, SPEED_MAX = 11;      // fall speed (rows / second)
  var HEAD_ALPHA = 0.82;         // leading-glyph opacity
  var TRAIL_ALPHA = 0.34;        // brightest trail opacity (fades to 0 up the tail)
  var MUTATE_CHANCE = 0.06;      // per-frame chance a column reshuffles a trail glyph

  var FPS = 30;                  // frame-rate cap
  var FPS_MOBILE = 24;
  var GRID = 40;                 // circuit-trace grid (matches the body grid)

  var TRACE_MAX = 3;             // concurrent ambient circuit traces (desktop)
  var TRACE_MAX_M = 1;
  var TRACE_SPAWN_MS = 2200;     // average gap between trace spawns
  var T_REVEAL = 420;            // trace draw-in (ms)
  var T_HOLD = 1600;             // trace hold (ms)
  var T_FALL = 900;              // trace fade-out (ms)
  var PULSE_SPEED = 190;         // px / second along a trace

  var SINGLE = ["0", "1", "0", "1", "0", "1", "Ω", "μ", "Δ", "Σ", "V", "A"];
  var MULTI = ["IC", "PLC", "PCB", "FET"];

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
    return m
      ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
      : [0, 229, 160];
  }
  function randGlyph() {
    if (Math.random() < 0.05) return MULTI[(Math.random() * MULTI.length) | 0];
    return SINGLE[(Math.random() * SINGLE.length) | 0];
  }

  function boot() {
    var canvas = document.createElement("canvas");
    canvas.className = "fx-bg";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var w = 0, h = 0, dpr = 1;
    var font = FONT_DESKTOP, spacing = 1, isMobile = false, fps = FPS;
    var columns = [];
    var traces = [];
    var nextTraceAt = 0;
    var rafId = null, running = false;
    var lastT = 0, lastDraw = 0;

    // Palette (green from the design tokens; head is brightened toward white).
    var signalHex = "#00e5a0", amberHex = "#ffb454";
    (function readTokens() {
      var cs = getComputedStyle(document.documentElement);
      signalHex = (cs.getPropertyValue("--signal") || "").trim() || signalHex;
      amberHex = (cs.getPropertyValue("--trace-amber") || "").trim() || amberHex;
    })();
    var S = hexToRgb(signalHex);
    var srgb = S[0] + "," + S[1] + "," + S[2];
    var A = hexToRgb(amberHex);
    var argb = A[0] + "," + A[1] + "," + A[2];
    var headRgb = // pull the signal green ~55% toward white for a bright head
      Math.round(S[0] + (255 - S[0]) * 0.62) + "," +
      Math.round(S[1] + (255 - S[1]) * 0.42) + "," +
      Math.round(S[2] + (255 - S[2]) * 0.5);

    function rm() { return reduceMQ.matches; }

    /* ---- Cached scanline pattern (cheap full-canvas overlay per frame) ---- */
    var scanPattern = null;
    function buildScanlines() {
      var p = document.createElement("canvas");
      p.width = 1; p.height = 3;
      var c = p.getContext("2d");
      c.fillStyle = "rgba(" + srgb + ",0.05)";
      c.fillRect(0, 0, 1, 1);                 // 1 lit row in every 3 → faint lines
      scanPattern = ctx.createPattern(p, "repeat");
    }

    /* ---- Sizing ---------------------------------------------------------- */
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      isMobile = Math.min(window.innerWidth, window.innerHeight) <= 640;
      font = isMobile ? FONT_MOBILE : FONT_DESKTOP;
      fps = isMobile ? FPS_MOBILE : FPS;
      spacing = Math.round(font * COL_SPACING);

      w = canvas.clientWidth || document.documentElement.clientWidth;
      h = canvas.clientHeight || document.documentElement.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "top";

      buildScanlines();
      buildColumns();

      if (rm()) drawStatic();     // static frame is size-dependent; redraw it
    }

    function buildColumns() {
      columns = [];
      var count = Math.max(1, Math.floor(w / spacing));
      var tMin = isMobile ? TRAIL_MIN_M : TRAIL_MIN;
      var tMax = isMobile ? TRAIL_MAX_M : TRAIL_MAX;
      for (var i = 0; i < count; i++) {
        var active = Math.random() < ACTIVE_FRACTION;
        columns.push(makeColumn(i, tMin, tMax, active));
      }
    }

    function makeColumn(i, tMin, tMax, active) {
      var len = (tMin + Math.random() * (tMax - tMin)) | 0;
      var glyphs = [];
      for (var g = 0; g < len; g++) glyphs.push(randGlyph());
      return {
        x: Math.round(i * spacing + spacing * 0.5),
        // start staggered above the fold so streams don't fall in lockstep
        headY: -Math.random() * (h + len * font),
        speed: (SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)) * font,
        len: len,
        lastRow: null,
        glyphs: glyphs,
        active: active,
        // small idle gap before an inactive column re-enters
        respawnAt: 0
      };
    }

    /* ---- Circuit traces (ambient) --------------------------------------- */
    function snap(v) { return Math.round(v / GRID) * GRID; }
    function spawnTrace(now) {
      var max = isMobile ? TRACE_MAX_M : TRACE_MAX;
      if (traces.length >= max) return;
      var ax = snap(GRID + Math.random() * (w - 2 * GRID));
      var ay = snap(GRID + Math.random() * (h - 2 * GRID));
      var reach = 3 + (Math.random() * 4 | 0);          // grid cells
      var dir = Math.random() < 0.5 ? 1 : -1;
      var horizFirst = Math.random() < 0.5;
      var bx = ax + (horizFirst ? dir * reach * GRID : 0);
      var by = ay + (horizFirst ? 0 : dir * reach * GRID);
      var nx = bx + (horizFirst ? 0 : (Math.random() < 0.5 ? 1 : -1) * reach * GRID);
      var ny = by + (horizFirst ? (Math.random() < 0.5 ? 1 : -1) * reach * GRID : 0);
      nx = Math.max(GRID, Math.min(w - GRID, nx));
      ny = Math.max(GRID, Math.min(h - GRID, ny));
      var seg1 = Math.abs(bx - ax) + Math.abs(by - ay);
      var seg2 = Math.abs(nx - bx) + Math.abs(ny - by);
      traces.push({
        ax: ax, ay: ay, bx: bx, by: by, nx: nx, ny: ny,
        seg1: seg1, seg2: seg2, total: seg1 + seg2,
        born: now, amber: Math.random() < 0.16
      });
    }
    function traceAlpha(t, now) {
      var age = now - t.born;
      if (age < T_REVEAL) return age / T_REVEAL * 0.9;
      if (age < T_REVEAL + T_HOLD) return 0.9;
      var k = (age - T_REVEAL - T_HOLD) / T_FALL;
      return k >= 1 ? 0 : (1 - k) * 0.9;
    }
    function pointAt(t, d) {
      if (d <= t.seg1) {
        var k = t.seg1 ? d / t.seg1 : 0;
        return [t.ax + (t.bx - t.ax) * k, t.ay + (t.by - t.ay) * k];
      }
      var k2 = t.seg2 ? (d - t.seg1) / t.seg2 : 0;
      return [t.bx + (t.nx - t.bx) * k2, t.by + (t.ny - t.by) * k2];
    }
    function drawTrace(t, now) {
      var a = traceAlpha(t, now);
      if (a <= 0) return;
      var col = t.amber ? amberHex : signalHex;
      var reveal = Math.min(1, (now - t.born) / T_REVEAL);
      var drawLen = t.total * reveal;

      ctx.strokeStyle = col;
      ctx.globalAlpha = a * 0.28;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.ax, t.ay);
      if (drawLen <= t.seg1) {
        var p = pointAt(t, drawLen);
        ctx.lineTo(p[0], p[1]);
      } else {
        ctx.lineTo(t.bx, t.by);
        var p2 = pointAt(t, drawLen);
        ctx.lineTo(p2[0], p2[1]);
      }
      ctx.stroke();

      // connection nodes at the corner + endpoint (once reached)
      ctx.fillStyle = col;
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.arc(t.ax, t.ay, 1.6, 0, Math.PI * 2); ctx.fill();
      if (reveal >= 1) {
        ctx.beginPath(); ctx.arc(t.bx, t.by, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(t.nx, t.ny, 2.2, 0, Math.PI * 2); ctx.fill();
        // travelling signal pulse
        var d = ((now - t.born) / 1000 * PULSE_SPEED) % t.total;
        var pp = pointAt(t, d);
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath(); ctx.arc(pp[0], pp[1], 1.7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ---- Drawing --------------------------------------------------------- */
    function drawGlow() {
      // soft, low, top-biased green glow for atmosphere
      var g = ctx.createRadialGradient(w * 0.7, -h * 0.1, 0, w * 0.7, -h * 0.1, Math.max(w, h) * 0.9);
      g.addColorStop(0, "rgba(" + srgb + ",0.05)");
      g.addColorStop(0.6, "rgba(" + srgb + ",0.012)");
      g.addColorStop(1, "rgba(" + srgb + ",0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    function drawRain(now, dt) {
      ctx.font = font + "px " + "'JetBrains Mono', ui-monospace, monospace";
      var tMin = isMobile ? TRAIL_MIN_M : TRAIL_MIN;
      var tMax = isMobile ? TRAIL_MAX_M : TRAIL_MAX;

      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        if (!col.active) {
          if (now >= col.respawnAt) {
            var fresh = makeColumn(c, tMin, tMax, true);
            fresh.headY = -fresh.len * font;   // re-enter from the top
            columns[c] = fresh;
          }
          continue;
        }

        col.headY += col.speed * dt;
        var row = Math.floor(col.headY / font);
        if (row !== col.lastRow) {              // advanced to a new cell
          col.lastRow = row;
          col.glyphs.unshift(randGlyph());
          if (col.glyphs.length > col.len) col.glyphs.pop();
        }
        if (Math.random() < MUTATE_CHANCE && col.glyphs.length) {
          col.glyphs[(Math.random() * col.glyphs.length) | 0] = randGlyph();
        }

        // draw head → tail (tail is above the head as it falls)
        for (var i = 0; i < col.glyphs.length; i++) {
          var y = col.headY - i * font;
          if (y < -font || y > h) continue;
          if (i === 0) {
            ctx.fillStyle = "rgba(" + headRgb + "," + HEAD_ALPHA.toFixed(3) + ")";
          } else {
            var a = TRAIL_ALPHA * (1 - i / col.glyphs.length);
            if (a <= 0.01) continue;
            ctx.fillStyle = "rgba(" + srgb + "," + a.toFixed(3) + ")";
          }
          ctx.fillText(col.glyphs[i], col.x, Math.round(y));
        }

        // recycle once the whole trail has fallen past the bottom
        if (col.headY - col.len * font > h) {
          if (Math.random() < 0.22) {          // occasionally rest, then re-enter
            col.active = false;
            col.respawnAt = now + 400 + Math.random() * 2600;
          } else {
            var nc = makeColumn(c, tMin, tMax, true);
            nc.headY = -nc.len * font;
            columns[c] = nc;
          }
        }
      }
    }

    function drawScanlines() {
      if (!scanPattern) return;
      ctx.fillStyle = scanPattern;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, w, h);
    }

    function drawFrame(now, dt) {
      ctx.clearRect(0, 0, w, h);
      drawGlow();
      drawRain(now, dt);
      for (var i = 0; i < traces.length; i++) drawTrace(traces[i], now);
      drawScanlines();
    }

    /* Static, quiet frame for prefers-reduced-motion (no animation loop). */
    function drawStatic() {
      ctx.clearRect(0, 0, w, h);
      drawGlow();
      ctx.font = font + "px 'JetBrains Mono', ui-monospace, monospace";
      var step = spacing;
      for (var x = spacing * 0.5; x < w; x += step) {
        // one short, dim, static column per pitch — atmospheric, motionless
        var n = 3 + (Math.random() * 4 | 0);
        var top = Math.random() * (h - n * font);
        for (var i = 0; i < n; i++) {
          var a = 0.14 * (1 - i / n);
          ctx.fillStyle = "rgba(" + srgb + "," + a.toFixed(3) + ")";
          ctx.fillText(randGlyph(), Math.round(x), Math.round(top + i * font));
        }
      }
      drawScanlines();
    }

    /* ---- Loop ------------------------------------------------------------ */
    function prune(now) {
      var kept = 0;
      for (var i = 0; i < traces.length; i++) {
        if (traceAlpha(traces[i], now) > 0) traces[kept++] = traces[i];
      }
      traces.length = kept;
    }

    function frame(now) {
      rafId = window.requestAnimationFrame(frame);

      var interval = 1000 / fps;
      if (now - lastDraw < interval - 0.5) return;   // frame-rate cap
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 1 / fps;
      lastT = now;
      lastDraw = now;

      if (now >= nextTraceAt) {
        spawnTrace(now);
        nextTraceAt = now + TRACE_SPAWN_MS * (0.6 + Math.random() * 0.9);
      }
      prune(now);
      drawFrame(now, dt);
    }

    function start() {
      if (running || document.hidden || rm()) return;
      running = true;
      lastT = 0; lastDraw = 0;
      if (rafId === null) rafId = window.requestAnimationFrame(frame);
    }
    function stop() {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      running = false;
    }

    /* ---- Lifecycle ------------------------------------------------------- */
    var resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    }
    window.addEventListener("resize", onResize, { passive: true });

    function onVisibility() {
      if (document.hidden) stop();
      else if (!rm()) start();
    }
    document.addEventListener("visibilitychange", onVisibility);

    function onReduceChange() {
      stop();
      if (rm()) drawStatic();
      else start();
    }
    reduceMQ.addEventListener("change", onReduceChange);

    function teardown() {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMQ.removeEventListener("change", onReduceChange);
      window.removeEventListener("pagehide", teardown);
    }
    window.addEventListener("pagehide", teardown);

    /* ---- Go -------------------------------------------------------------- */
    resize();
    nextTraceAt = performance.now() + 600;
    if (rm()) drawStatic(); else start();

    /* Read-only debug surface (verification only; no behavioural effect). */
    window.__ELECTRIC_BG__ = {
      state: function () {
        return {
          running: running,
          columns: columns.length,
          activeColumns: columns.filter(function (c) { return c.active; }).length,
          traces: traces.length,
          reducedMotion: rm(),
          mobile: isMobile,
          fps: fps,
          canvas: { w: canvas.width, h: canvas.height, dpr: dpr }
        };
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
