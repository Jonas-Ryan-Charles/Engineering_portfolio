/* ============================================================================
   InteractiveElectricalBackground

   Decorative pointer-reactive layer: a minimal crosshair marker, a soft local
   brightness field, temporary circuit nodes, PCB-style right-angle traces, and
   sparse signal pulses — drawn ONLY over genuinely empty background space, and
   nothing at all at rest.

   Response model (two coordinate systems, deliberately different):
     - MARKER  tracks the RAW latest pointer sample every frame → zero visible
               lag. Never interpolated.
     - FIELD   (node spawn origin) uses frame-rate-independent exponential
               smoothing so traces trail elegantly without feeling laggy.

   Self-contained: owns its canvas, resize, pointer tracking, empty-space hit
   testing, generation, the single rAF loop, fade timing, touch pulses,
   reduced-motion behaviour, and cleanup. Reads/writes nothing from the hero,
   robot, terminal, or any other component.

   Classic script (matches this repo's no-build convention).
   ============================================================================ */
(function () {
  "use strict";

  /* ---- Tunables ---------------------------------------------------------- */
  var RADIUS = 200;          // node spawn radius (px)      — spec 140–240
  var MAX_NODES = 12;        // active node cap             — spec 5–12
  var MAX_NODES_RM = 4;      // reduced-motion cap
  var SPAWN_STEP = 14;       // min pointer travel between spawns (px)
  var GRID = 40;             // matches the body background grid

  var FIELD_SPEED = 16;      // exp-smoothing rate for the field (≈0.23/frame)
  var MARK_IN = 28, MARK_OUT = 18;   // marker alpha ease (≈100ms in / ~160ms out)
  var BRIGHT_IN = 18, BRIGHT_OUT = 10; // brightness alpha ease (~300ms out)

  /* Reticle: continuous, time-based breathing (never phase-restarted). */
  var BASE_RADIUS = 12;
  var RADIUS_AMPLITUDE = 5;   // ring travels 12 -> 17px
  var PULSE_FREQUENCY = 0.95; // Hz
  var RM_RADIUS = 14;         // static radius under reduced motion
  var ARM_LENGTH = 24;
  var ARM_GAP = 3;

  var N_RISE = 90;           // node fade-in   (ms) — spec 60–140
  var N_HOLD_MIN = 180, N_HOLD_MAX = 450; // active life  — spec 180–450
  var N_FALL = 520;          // node fade-out  (ms) — spec 350–650
  var T_REVEAL = 130;        // trace reveal   (ms) — spec 80–180

  var PULSE_CHANCE = 0.26;
  var PULSE_SPEED = 260;     // px/second (time-based, not frame-based)
  var BRANCH_CHANCE = 0.3;

  /* Regions that must never trigger the effect. */
  var BLOCK_SELECTOR = [
    "a", "button", "input", "textarea", "select", "label",
    '[role="button"]', '[role="link"]', "[tabindex]",
    "[data-no-background-effect]", "[data-interactive]",
    "nav", "header", "footer",
    "h1", "h2", "h3", "h4", "p", "li", "code",
    ".card", ".focus-item", ".panel", ".cap", ".cap-strip",
    ".tl-item", ".timeline", ".contact__row", ".contact__grid",
    ".terminal", ".terminal-wrap", ".terminal__hints",
    ".robot", ".hero__inner", ".hero__stats", ".hero__cta",
    ".tag", ".tag-row", ".chip", ".btn",
    ".section__label", ".section__title", ".section__intro",
    ".to-top", ".preloader", ".scroll-progress"
  ].join(",");
  var ALLOW_SELECTOR = "[data-background-effect-zone]";

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
    return m
      ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
      : [0, 229, 160];
  }

  function boot() {
    var canvas = document.createElement("canvas");
    canvas.className = "fx-bg";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var w = 0, h = 0, dpr = 1;
    var nodes = [];
    var rafId = null;
    var running = false;
    var lastT = 0;

    // Pointer state (plain mutable objects — no per-sample framework state).
    var targetX = 0, targetY = 0;   // latest RAW sample
    var fieldX = 0, fieldY = 0;     // smoothed field origin
    var hasPointer = false, isTouch = false;
    var insideViewport = false;
    var eligible = false, wasEligible = false;
    var lastSpawnX = 0, lastSpawnY = 0;
    var pendingHitTest = false;
    var lastMoveAt = 0;
    var markerA = 0, brightA = 0;   // eased 0..1 visibility

    var signalHex = "#00e5a0", amberHex = "#ffb454";
    (function readTokens() {
      var cs = getComputedStyle(document.documentElement);
      signalHex = (cs.getPropertyValue("--signal") || "").trim() || signalHex;
      amberHex = (cs.getPropertyValue("--trace-amber") || "").trim() || amberHex;
    })();
    var S = hexToRgb(signalHex);
    var srgb = S[0] + "," + S[1] + "," + S[2];

    function rm() { return reduceMQ.matches; }
    function maxNodes() { return rm() ? MAX_NODES_RM : MAX_NODES; }

    /* ---- Sizing --------------------------------------------------------- */
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Canvas's own laid-out box — NOT innerWidth (which includes the
      // scrollbar and would offset every pixel from the real cursor).
      w = canvas.clientWidth || document.documentElement.clientWidth;
      h = canvas.clientHeight || document.documentElement.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    /* ---- Empty-space eligibility (one DOM hit test per frame, max) ------- */
    function isEligible(x, y) {
      if (x < 0 || y < 0 || x > w || y > h) return false;
      var el = document.elementFromPoint(x, y);
      if (!el) return false;
      if (el.closest && el.closest(ALLOW_SELECTOR)) return true;
      if (el.closest && el.closest(BLOCK_SELECTOR)) return false;
      return true;
    }

    /* ---- Node + stable PCB route generation ------------------------------ */
    function snap(v) { return Math.round(v / GRID) * GRID; }

    function spawnNode(px, py, now) {
      if (nodes.length >= maxNodes()) return;
      var ang = Math.random() * Math.PI * 2;
      var dist = 50 + Math.random() * (RADIUS - 50);
      var nx = snap(px + Math.cos(ang) * dist);
      var ny = snap(py + Math.sin(ang) * dist);
      if (nx === snap(px) && ny === snap(py)) return;

      // Anchor + corner are computed ONCE here and stored on the node, so the
      // route is stable for its whole life (never regenerated per frame).
      var ax = px, ay = py;
      if (nodes.length && Math.random() < BRANCH_CHANCE) {
        var prev = nodes[nodes.length - 1];
        ax = prev.x; ay = prev.y;
      }
      var horizFirst = Math.random() < 0.5;
      var cx = horizFirst ? nx : ax;
      var cy = horizFirst ? ay : ny;
      var seg1 = Math.abs(cx - ax) + Math.abs(cy - ay);
      var seg2 = Math.abs(nx - cx) + Math.abs(ny - cy);
      var isJunction = Math.random() < 0.22;

      nodes.push({
        x: nx, y: ny, ax: ax, ay: ay, cx: cx, cy: cy,
        seg1: seg1, seg2: seg2, total: seg1 + seg2,
        r: isJunction ? 4 + Math.random() * 2 : 1 + Math.random() * 2,
        born: now,
        hold: N_HOLD_MIN + Math.random() * (N_HOLD_MAX - N_HOLD_MIN),
        pulse: !rm() && Math.random() < PULSE_CHANCE,
        amber: Math.random() < 0.12
      });
    }

    function lifeOf(n) { return N_RISE + n.hold + N_FALL; }

    function alphaOf(n, now) {
      var age = now - n.born;
      if (age < 0) return 0;
      if (age < N_RISE) return age / N_RISE;          // quick fade-in
      var fallStart = N_RISE + n.hold;
      if (age < fallStart) return 1;                   // hold
      var k = (age - fallStart) / N_FALL;
      return k >= 1 ? 0 : 1 - k;                       // smooth fade-out
    }

    /* ---- Drawing --------------------------------------------------------- */
    function drawBrightness() {
      if (brightA <= 0.003) return;
      // Soft local "inspection lamp" — no hard edge, local only.
      var r = w < 700 ? 140 : 220;
      var g = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, r);
      g.addColorStop(0, "rgba(" + srgb + "," + (0.13 * brightA).toFixed(4) + ")");
      g.addColorStop(0.5, "rgba(" + srgb + "," + (0.05 * brightA).toFixed(4) + ")");
      g.addColorStop(1, "rgba(" + srgb + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(targetX, targetY, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawNodeRoute(n, a, now) {
      // Progressive reveal along the stored route (no per-frame regeneration).
      var reveal = Math.min(1, (now - n.born) / T_REVEAL);
      var drawLen = n.total * reveal;
      var col = n.amber ? amberHex : signalHex;

      ctx.strokeStyle = col;
      ctx.globalAlpha = a * 0.32;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(n.ax, n.ay);
      if (drawLen <= n.seg1) {
        var k = n.seg1 ? drawLen / n.seg1 : 0;
        ctx.lineTo(n.ax + (n.cx - n.ax) * k, n.ay + (n.cy - n.ay) * k);
      } else {
        ctx.lineTo(n.cx, n.cy);
        var k2 = n.seg2 ? (drawLen - n.seg1) / n.seg2 : 0;
        ctx.lineTo(n.cx + (n.x - n.cx) * k2, n.cy + (n.y - n.cy) * k2);
      }
      ctx.stroke();

      if (reveal >= 1) {           // junction dot once the corner is reached
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(n.cx, n.cy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      return reveal;
    }

    function drawPulse(n, a, now) {
      if (!n.total) return;
      // Time-based (px/sec) so speed is frame-rate independent.
      var d = ((now - n.born) / 1000 * PULSE_SPEED) % n.total;
      var px, py;
      if (d <= n.seg1) {
        var k = n.seg1 ? d / n.seg1 : 0;
        px = n.ax + (n.cx - n.ax) * k;
        py = n.ay + (n.cy - n.ay) * k;
      } else {
        var k2 = n.seg2 ? (d - n.seg1) / n.seg2 : 0;
        px = n.cx + (n.x - n.cx) * k2;
        py = n.cy + (n.y - n.cy) * k2;
      }
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = n.amber ? amberHex : signalHex;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawMarker(now) {
      if (markerA <= 0.004 || isTouch) return;

      // Time-based breathing off an absolute clock, so the phase is continuous
      // and never restarts when pointer events arrive or the loop restarts.
      var ring, outer = 0;
      if (rm()) {
        ring = RM_RADIUS;                       // static under reduced motion
      } else {
        var t = now / 1000;
        var pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * PULSE_FREQUENCY);
        ring = BASE_RADIUS + pulse * RADIUS_AMPLITUDE;
        var outerPulse =
          0.5 + 0.5 * Math.sin(t * Math.PI * 2 * PULSE_FREQUENCY - 0.8);
        outer = 21 + outerPulse * 7;            // faint, phase-delayed
      }

      ctx.strokeStyle = signalHex;
      ctx.lineWidth = 1;
      ctx.shadowColor = signalHex;
      ctx.shadowBlur = 8;

      // Faint outer ring
      if (outer) {
        ctx.globalAlpha = markerA * 0.16;
        ctx.beginPath();
        ctx.arc(targetX, targetY, outer, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Primary pulsing ring
      ctx.globalAlpha = markerA * 0.85;
      ctx.beginPath();
      ctx.arc(targetX, targetY, ring, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshair arms (gap around the ring)
      var inner = ring + ARM_GAP;
      ctx.globalAlpha = markerA * 0.65;
      ctx.beginPath();
      ctx.moveTo(targetX - ARM_LENGTH, targetY); ctx.lineTo(targetX - inner, targetY);
      ctx.moveTo(targetX + inner, targetY); ctx.lineTo(targetX + ARM_LENGTH, targetY);
      ctx.moveTo(targetX, targetY - ARM_LENGTH); ctx.lineTo(targetX, targetY - inner);
      ctx.moveTo(targetX, targetY + inner); ctx.lineTo(targetX, targetY + ARM_LENGTH);
      ctx.stroke();

      // Centre point
      ctx.globalAlpha = markerA;
      ctx.fillStyle = signalHex;
      ctx.beginPath();
      ctx.arc(targetX, targetY, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function draw(now) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";

      drawBrightness();                       // 2. local brightness

      for (var i = 0; i < nodes.length; i++) { // 3./4. traces + pulses
        var n = nodes[i];
        var a = alphaOf(n, now);
        if (a <= 0) continue;
        var reveal = drawNodeRoute(n, a, now);
        if (n.pulse && reveal >= 1) drawPulse(n, a, now);
      }

      for (var j = 0; j < nodes.length; j++) { // 5. nodes on top of traces
        var m = nodes[j];
        var a2 = alphaOf(m, now);
        if (a2 <= 0) continue;
        ctx.globalAlpha = a2 * 0.85;
        ctx.fillStyle = m.amber ? amberHex : signalHex;
        ctx.shadowColor = m.amber ? amberHex : signalHex;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      drawMarker(now);                         // 6. marker, crisp on top
    }

    /* ---- Loop ------------------------------------------------------------ */
    function prune(now) {
      var kept = 0;
      for (var i = 0; i < nodes.length; i++) {
        if (now - nodes[i].born < lifeOf(nodes[i])) nodes[kept++] = nodes[i];
      }
      nodes.length = kept;
    }

    function ease(cur, target, rate, dt) {
      return cur + (target - cur) * (1 - Math.exp(-rate * dt));
    }

    function frame(now) {
      rafId = null;
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
      lastT = now;

      // Exactly one hit test per frame, always using the newest sample.
      if (pendingHitTest) {
        pendingHitTest = false;
        eligible = hasPointer && !isTouch && isEligible(targetX, targetY);
      }

      /* Reticle visibility depends ONLY on where the pointer is — never on how
         long ago it moved, and never on whether nodes/traces still exist. */
      var markerVisible = insideViewport && eligible && !isTouch;

      // Marker + brightness sit on the RAW pointer; only their alpha eases.
      markerA = ease(markerA, markerVisible ? 1 : 0,
        markerVisible ? MARK_IN : MARK_OUT, dt);
      brightA = ease(brightA, markerVisible ? 1 : 0,
        markerVisible ? BRIGHT_IN : BRIGHT_OUT, dt);

      // The electrical trail is a separate concern: nodes only spawn while the
      // pointer is actually moving, and are free to fade out underneath a
      // marker that stays visible.
      var active = markerVisible && (now - lastMoveAt < 240);

      // Field origin: fast, frame-rate-independent smoothing (≈0.23/frame).
      var follow = 1 - Math.exp(-FIELD_SPEED * dt);
      fieldX += (targetX - fieldX) * follow;
      fieldY += (targetY - fieldY) * follow;

      if (active) {
        // Energise immediately on the first eligible frame.
        if (!wasEligible) {
          spawnNode(fieldX, fieldY, now);
          if (!rm()) spawnNode(fieldX, fieldY, now);
          lastSpawnX = targetX; lastSpawnY = targetY;
        }
        var dx = targetX - lastSpawnX, dy = targetY - lastSpawnY;
        if (dx * dx + dy * dy > SPAWN_STEP * SPAWN_STEP) {
          lastSpawnX = targetX; lastSpawnY = targetY;
          spawnNode(fieldX, fieldY, now);
          if (!rm() && Math.random() < 0.35) spawnNode(fieldX, fieldY, now);
        }
      }
      wasEligible = active;

      prune(now);
      draw(now);

      // Keep rendering while the reticle is up, even with an empty trail.
      if (markerVisible || nodes.length || markerA > 0.004 || brightA > 0.003) {
        rafId = window.requestAnimationFrame(frame);
      } else {
        running = false;
        lastT = 0;
        ctx.clearRect(0, 0, w, h); // return to fully transparent
      }
    }

    function start() {
      if (running || document.hidden) return;
      running = true;
      lastT = 0;
      if (rafId === null) rafId = window.requestAnimationFrame(frame);
    }
    function stop() {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      running = false;
    }

    /* ---- Pointer input ---------------------------------------------------- */
    function onPointerMove(e) {
      if (e.pointerType === "touch") { isTouch = true; return; }
      isTouch = false;
      targetX = e.clientX; targetY = e.clientY;   // store latest sample only
      if (!hasPointer) { fieldX = targetX; fieldY = targetY; hasPointer = true; }
      insideViewport = true;
      lastMoveAt = performance.now();
      pendingHitTest = true;
      start();                                    // coalesced to 1 frame max
    }
    function onLeave() {
      hasPointer = false;
      insideViewport = false;
      eligible = false;
      start();            // keep running so the reticle can fade out cleanly
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", function (e) {
      if (!e.relatedTarget) onLeave();
    }, { passive: true });
    document.addEventListener("mouseleave", onLeave, { passive: true });

    /* ---- Touch: one short local burst per eligible tap -------------------- */
    var tX = 0, tY = 0, tAt = 0, tOK = false;
    window.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch") return;
      isTouch = true;
      tX = e.clientX; tY = e.clientY; tAt = performance.now(); tOK = true;
    }, { passive: true });

    window.addEventListener("pointerup", function (e) {
      if (e.pointerType !== "touch" || !tOK) return;
      tOK = false;
      var moved = Math.abs(e.clientX - tX) + Math.abs(e.clientY - tY);
      if (moved > 12 || performance.now() - tAt > 500) return; // scroll, not tap
      if (!isEligible(e.clientX, e.clientY)) return;
      var now = performance.now();
      fieldX = e.clientX; fieldY = e.clientY;
      var count = rm() ? 3 : 3 + Math.floor(Math.random() * 5);
      for (var i = 0; i < count; i++) spawnNode(fieldX, fieldY, now);
      eligible = false;   // one-shot: burst fades, no marker follows touch
      start();
    }, { passive: true });

    /* ---- Lifecycle -------------------------------------------------------- */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else if (nodes.length || markerA > 0 || brightA > 0) start();
    });
    reduceMQ.addEventListener("change", function () {
      nodes.length = 0;
      markerA = brightA = 0;
      ctx.clearRect(0, 0, w, h);
    });
    window.addEventListener("pagehide", function () {
      stop();
      window.removeEventListener("pointermove", onPointerMove);
    });

    /* Read-only debug surface for verification. */
    window.__ELECTRIC_BG__ = {
      isEligible: isEligible,
      state: function () {
        return {
          nodes: nodes.length, running: running, eligible: eligible,
          markerA: +markerA.toFixed(3), brightA: +brightA.toFixed(3),
          reducedMotion: rm(), canvas: { w: canvas.width, h: canvas.height },
          marker: { x: targetX, y: targetY },
          field: { x: +fieldX.toFixed(1), y: +fieldY.toFixed(1) }
        };
      },
      _feed: function (x, y) {                    // test helper: raw sample
        targetX = x; targetY = y;
        if (!hasPointer) { fieldX = x; fieldY = y; hasPointer = true; }
        isTouch = false;
        insideViewport = true;
        lastMoveAt = performance.now();
        pendingHitTest = true;
        start();
      },
      _leave: function () {                       // test helper: exit viewport
        hasPointer = false; insideViewport = false; eligible = false; start();
      },
      _step: function (ms) {                      // test helper: manual frame
        frame(performance.now() + (ms || 16));
        return this.state();
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
