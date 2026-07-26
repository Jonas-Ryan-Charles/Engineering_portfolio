/* ============================================================================
   TypewriterIdentity — hero heading identity cycle

     JONAS RYAN / CHARLES  →  ENGINEER  →  ENTREPRENEUR  →  loop

   Four-phase state machine (typing → holding → deleting → between) driven by a
   SINGLE chained setTimeout (never setInterval, never overlapping chains).
   Segment metadata preserves the teal "RYAN" and the dimmed surname exactly as
   the static markup rendered them. Text is written with textContent only.

   Isolated from the robot/terminal/background: it touches nothing but its own
   wrapper inside the existing <h1>.

   Classic script (matches this repo's no-build convention).
   ============================================================================ */
(function () {
  "use strict";

  /* ---- Timing (spec values) --------------------------------------------- */
  var TYPE_MS = 82;      // per character while typing
  var DEL_MS = 48;       // per character while deleting
  var BETWEEN_MS = 280;  // blank interval between states

  /* ---- Sequence config --------------------------------------------------- */
  /* Segment `c` = class applied to that run of characters, so styling is
     preserved mid-type (RYAN stays teal as it is revealed). */
  var IDENTITY_SEQUENCE = [
    {
      id: "name",
      holdMs: 4000,
      lines: [
        [{ t: "JONAS " }, { t: "RYAN", c: "accent" }],
        [{ t: "CHARLES", c: "ident__seg--dim" }]
      ]
    },
    {
      id: "engineer",
      holdMs: 3000,
      lines: [[{ t: "ENGINEER" }]]
    },
    {
      id: "entrepreneur",
      holdMs: 3000,
      lines: [[{ t: "ENTREPRENEUR", c: "accent" }]]
    }
  ];

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  function totalChars(phrase) {
    var n = 0;
    for (var i = 0; i < phrase.lines.length; i++) {
      for (var j = 0; j < phrase.lines[i].length; j++) n += phrase.lines[i][j].t.length;
    }
    return n;
  }

  function boot() {
    var wrap = document.querySelector("[data-typewriter]");
    if (!wrap) return;

    var caret = document.createElement("span");
    caret.className = "ident__caret";
    caret.setAttribute("aria-hidden", "true");

    var idx = 0;                 // phrase index
    var visible = 0;             // characters revealed
    var phase = "typing";
    var timer = null;
    var running = false;
    var token = 0;               // invalidates stale chains

    /* ---- Rendering (textContent only — no innerHTML) --------------------- */
    function render(phrase, n) {
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

      var budget = n;
      var multiline = phrase.lines.length > 1;
      var lastFilled = null;
      var firstLine = null;

      for (var i = 0; i < phrase.lines.length; i++) {
        var lineEl = document.createElement("span");
        lineEl.className = "ident__line";
        var filled = false;

        for (var j = 0; j < phrase.lines[i].length; j++) {
          var seg = phrase.lines[i][j];
          var take = Math.max(0, Math.min(seg.t.length, budget));
          budget -= Math.min(seg.t.length, Math.max(budget, 0));
          if (take > 0) {
            var s = document.createElement("span");
            if (seg.c) s.className = seg.c;
            s.textContent = seg.t.slice(0, take);
            lineEl.appendChild(s);
            filled = true;
          }
        }

        // Multi-line phrases always keep both line boxes so the block never
        // reflows internally as the second line appears.
        if (filled || multiline) {
          wrap.appendChild(lineEl);
          if (!firstLine) firstLine = lineEl;
          if (filled) lastFilled = lineEl;
        }
      }

      (lastFilled || firstLine || wrap).appendChild(caret);
    }

    function setHolding(on) {
      wrap.classList.toggle("is-holding", !!on);
    }

    /* ---- Identity state contract -----------------------------------------
       Emits semantic state only (never the visible character string), so the
       robot controller never inspects the DOM or diffs text per character. */
    var lastEmit = "";
    function emitIdentity() {
      var identity = IDENTITY_SEQUENCE[idx].id;
      var key = identity + ":" + phase;
      if (key === lastEmit) return;          // only real transitions
      lastEmit = key;
      window.dispatchEvent(new CustomEvent("jrc:identity", {
        detail: { identity: identity, phase: phase }
      }));
    }

    /* ---- State machine ----------------------------------------------------- */
    function schedule(fn, ms, myToken) {
      timer = window.setTimeout(function () {
        if (myToken !== token) return;   // stale chain — drop it
        fn();
      }, ms);
    }

    function step() {
      if (!running) return;
      var myToken = token;
      var phrase = IDENTITY_SEQUENCE[idx];
      var total = totalChars(phrase);

      if (phase === "typing") {
        if (visible < total) {
          visible++;
          render(phrase, visible);
          schedule(step, TYPE_MS, myToken);
        } else {
          phase = "holding";
          setHolding(true);                       // caret blinks only on hold
          schedule(step, phrase.holdMs, myToken); // hold starts AFTER typing
        }
      } else if (phase === "holding") {
        phase = "deleting";
        setHolding(false);
        schedule(step, DEL_MS, myToken);
      } else if (phase === "deleting") {
        if (visible > 0) {
          visible--;
          render(phrase, visible);
          schedule(step, DEL_MS, myToken);
        } else {
          phase = "between";
          schedule(step, BETWEEN_MS, myToken);
        }
      } else { // between
        idx = (idx + 1) % IDENTITY_SEQUENCE.length;
        visible = 0;
        phase = "typing";
        schedule(step, TYPE_MS, myToken);
      }
      emitIdentity(); // de-duped: fires only on real identity/phase changes
    }

    /* ---- Static (reduced motion / no animation) --------------------------- */
    function renderStatic() {
      var name = IDENTITY_SEQUENCE[0];
      render(name, totalChars(name));
      setHolding(false);
      if (caret.parentNode) caret.parentNode.removeChild(caret);
      idx = 0; phase = "holding";
      emitIdentity();   // robot must match the stable name state
    }

    /* ---- Lifecycle --------------------------------------------------------- */
    function stop() {
      running = false;
      token++;                       // invalidate any in-flight callback
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
      setHolding(false);
    }

    function start() {
      if (running || reduceMQ.matches) return;
      stop();                        // guarantee a single chain
      running = true;
      // Restart the current phrase cleanly (spec permits this on resume).
      visible = 0;
      phase = "typing";
      render(IDENTITY_SEQUENCE[idx], 0);
      emitIdentity();
      var myToken = token;
      schedule(step, TYPE_MS, myToken);
    }

    if (reduceMQ.matches) {
      renderStatic();
    } else {
      // Begin once the hero entrance has revealed (falls back on a timeout).
      var hero = document.querySelector(".hero");
      if (hero && hero.classList.contains("hero-ready")) {
        start();
      } else if (hero && "MutationObserver" in window) {
        var mo = new MutationObserver(function () {
          if (hero.classList.contains("hero-ready")) { mo.disconnect(); start(); }
        });
        mo.observe(hero, { attributes: true, attributeFilter: ["class"] });
        window.setTimeout(function () { mo.disconnect(); start(); }, 3500);
      } else {
        window.setTimeout(start, 1200);
      }
    }

    // Pause while the tab is hidden; resume cleanly (no duplicate timers).
    document.addEventListener("visibilitychange", function () {
      if (reduceMQ.matches) return;
      if (document.hidden) stop();
      else start();
    });

    // Pause while the hero is fully off-screen.
    if ("IntersectionObserver" in window) {
      var heroEl = document.querySelector(".hero");
      if (heroEl) {
        new IntersectionObserver(function (entries) {
          if (reduceMQ.matches) return;
          entries.forEach(function (en) {
            if (en.isIntersecting) { if (!document.hidden) start(); }
            else stop();
          });
        }, { threshold: 0 }).observe(heroEl);
      }
    }

    reduceMQ.addEventListener("change", function (e) {
      if (e.matches) { stop(); renderStatic(); }
      else start();
    });

    window.addEventListener("pagehide", stop);

    /* Read-only debug surface for verification. */
    window.__TYPEWRITER__ = {
      state: function () {
        return {
          phrase: IDENTITY_SEQUENCE[idx].id, phase: phase,
          visible: visible, total: totalChars(IDENTITY_SEQUENCE[idx]),
          running: running, holding: wrap.classList.contains("is-holding"),
          text: wrap.textContent, reducedMotion: reduceMQ.matches
        };
      },
      config: IDENTITY_SEQUENCE
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
