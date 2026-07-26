/* ============================================================================
   Jonas Ryan Charles — Portfolio behaviour
   Vanilla JS, no deps. Safe to run from file://.

   Modules:
     1. Reduced-motion detection (single source of truth)
     2. Scroll-reveal          — IntersectionObserver adds .is-visible
     3. Circuit-trace dividers  — set --trace-len from real path length,
                                  reveal via the same observer
     4. Nav scroll state        — .is-scrolled after a threshold
     5. Oscilloscope waveform   — animated canvas in the hero
   ============================================================================ */
(function () {
  "use strict";

  /* -- 1. Reduced motion ---------------------------------------------------- */
  var reduceMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReducedMotion = reduceMotionMQ.matches;
  reduceMotionMQ.addEventListener("change", function (e) {
    prefersReducedMotion = e.matches;
  });

  /* -- 2 & 3. Reveal observer (elements + dividers) ------------------------- */
  function initReveal() {
    var revealEls = document.querySelectorAll(".reveal");

    // Prime dividers: measure true path length so the draw-in dasharray fits.
    document.querySelectorAll("[data-divider]").forEach(function (divider) {
      var path = divider.querySelector(".trace-path");
      if (!path || typeof path.getTotalLength !== "function") return;
      try {
        var len = Math.ceil(path.getTotalLength());
        divider.style.setProperty("--trace-len", len);
      } catch (err) {
        /* getTotalLength can throw on hidden SVG in some engines — ignore */
      }
    });

    if (!("IntersectionObserver" in window)) {
      // Fallback: show everything.
      revealEls.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* -- 4. Nav scroll state -------------------------------------------------- */
  function initNav() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var ticking = false;
    function update() {
      nav.classList.toggle("is-scrolled", window.scrollY > 12);
      ticking = false;
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* -- 6. Hero staged entrance --------------------------------------------- */
  function revealHero() {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    var els = hero.querySelectorAll("[data-enter]");
    var step = prefersReducedMotion ? 0 : 90;
    els.forEach(function (el, i) {
      el.style.setProperty("--enter", i * step);
    });
    var revealed = false;
    function show() {
      if (revealed) return;
      revealed = true;
      els.forEach(function (el) {
        el.classList.add("is-in");
      });
      hero.classList.add("hero-ready");
    }
    // Next frame so the transition plays from the hidden state...
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(show);
    });
    // ...but never leave the hero hidden if rAF is throttled (background tab).
    window.setTimeout(show, 200);
  }

  /* -- 7. Preloader boot sequence ------------------------------------------ */
  function initPreloader(done) {
    var pre = document.querySelector("[data-preloader]");
    if (!pre) { done(); return; }

    var log = pre.querySelector(".preloader__log");
    var bar = pre.querySelector(".preloader__bar span");
    var cfg = window.JRC_CONFIG || {};
    var budget = cfg.PRELOADER_MAX_MS || 2000;

    var steps = [
      "INITIALISING INSTRUMENT BUS",
      "CALIBRATING SIGNAL PATH",
      "LOCKING REFERENCE CLOCK",
      "SYSTEM READY"
    ];

    function finish() {
      pre.classList.add("is-done");
      done();
      // Remove from the a11y tree / DOM after the curtain sweeps.
      window.setTimeout(function () {
        if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
      }, 800);
    }

    if (prefersReducedMotion) {
      if (log) {
        var l = document.createElement("div");
        l.className = "preloader__log-line";
        l.textContent = "SYSTEM READY";
        l.style.animation = "none";
        l.style.opacity = "1";
        log.appendChild(l);
      }
      if (bar) bar.style.width = "100%";
      window.setTimeout(finish, 250);
      return;
    }

    var per = Math.max(220, Math.floor(budget / steps.length));
    steps.forEach(function (text, i) {
      window.setTimeout(function () {
        if (log) {
          var line = document.createElement("div");
          line.className = "preloader__log-line";
          var ok = i === steps.length - 1 ? '<span class="ok">✓ </span>' : "&gt; ";
          line.innerHTML = ok + text;
          log.appendChild(line);
        }
        if (bar) bar.style.width = Math.round(((i + 1) / steps.length) * 100) + "%";
        if (i === steps.length - 1) window.setTimeout(finish, 320);
      }, i * per);
    });
  }

  /* -- 8. Scroll progress bar ---------------------------------------------- */
  function initScrollProgress() {
    var bar = document.querySelector(".scroll-progress__bar");
    if (!bar) return;
    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var p = max > 0 ? window.scrollY / max : 0;
      bar.style.width = (p * 100).toFixed(2) + "%";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* -- 9. Return-to-top ----------------------------------------------------- */
  function initReturnToTop() {
    var btn = document.querySelector("[data-to-top]");
    if (!btn) return;
    var ticking = false;
    function update() {
      btn.classList.toggle("is-shown", window.scrollY > window.innerHeight * 0.8);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion ? "auto" : "smooth"
      });
    });
    update();
  }

  /* -- 10. Active-section nav highlight ------------------------------------ */
  function initActiveNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav__link"));
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) {
      var id = (a.getAttribute("href") || "").replace("#", "");
      if (id) map[id] = a;
    });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = map[en.target.id];
        if (!a) return;
        if (en.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("is-active"); });
          a.classList.add("is-active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    Object.keys(map).forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) obs.observe(sec);
    });
  }

  /* -- Boot ----------------------------------------------------------------- */
  function boot() {
    initReveal();
    initNav();
    initScrollProgress();
    initReturnToTop();
    initActiveNav();
    initPreloader(revealHero);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
