/* ============================================================================
   NexbotScene — interactive humanoid Spline robot (vanilla adaptation)

   Behavioural model = reference SplineScene.jsx / Hero.jsx, rewritten for a
   no-build site using @splinetool/runtime (the vanilla equivalent of
   @splinetool/react-spline):
     - lazy import of the runtime from a CDN (kept off the critical path)
     - reserved dimensions (CSS) so there is no layout shift
     - lightweight loading state; fade in on load; 4s fallback timeout
     - Application instance retained; WebGL loop paused off-screen via
       IntersectionObserver (app.stop()/play())
     - rAF-coalesced pointer forwarding so the robot tracks the cursor even
       while the pointer is over hero text / the terminal
     - static humanoid silhouette + label fallback on WebGL/network failure
   Classic script; boots on DOMContentLoaded.
   ============================================================================ */
(function () {
  "use strict";

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarseMQ = window.matchMedia("(pointer: coarse)");

  function boot() {
    var root = document.querySelector("[data-robot]");
    if (!root) return;

    var stage = root.querySelector(".robot__stage");
    var hotspot = root.querySelector(".robot__hotspot");
    var tooltip = root.querySelector(".robot__tooltip");
    var cfg = window.JRC_CONFIG || {};
    var sceneUrl = cfg.SPLINE_SCENE_URL || "";

    setupTooltip(root, hotspot, tooltip);

    var canForward = !coarseMQ.matches; // forwarding is mouse-only

    if (!sceneUrl || !hasWebGL()) {
      root.classList.add("robot--fallback");
      return;
    }

    /* ---- Canvas + loading state ---------------------------------------- */
    var canvas = document.createElement("canvas");
    canvas.className = "robot__spline";
    canvas.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas);
    root.classList.add("robot--loading");

    var settled = false;
    var app = null;

    /* Dev inspection surface: exposes the Spline Application so scene
       structure can be examined. No logging, no UI. */
    window.__ROBOT__ = {
      getApp: function () { return app; },
      isReady: function () { return root.classList.contains("robot--ready"); }
    };

    var fallbackTimer = window.setTimeout(function () {
      if (settled) return;
      settled = true;
      // Never trap the UI: reveal the silhouette, drop the loader.
      root.classList.remove("robot--loading");
      root.classList.add("robot--fallback");
    }, cfg.SPLINE_FALLBACK_TIMEOUT_MS || 4000);

    function fail() {
      window.clearTimeout(fallbackTimer);
      if (settled && root.classList.contains("robot--ready")) return;
      settled = true;
      root.classList.remove("robot--loading");
      root.classList.add("robot--fallback");
      if (canvas.parentNode) canvas.remove();
    }

    function ready() {
      window.clearTimeout(fallbackTimer);
      settled = true;
      root.classList.remove("robot--loading", "robot--fallback");
      root.classList.add("robot--ready");
      if (canForward) setupForwarding(root, canvas);
      gateVisibility(root, function () { return app; });
    }

    // Lazy-load the runtime as an ES module. Dynamic import over the network
    // — only reachable when the site is served over http(s).
    import(/* @vite-ignore */ cfg.SPLINE_RUNTIME_URL)
      .then(function (mod) {
        var Application = mod.Application || (mod.default && mod.default.Application);
        if (!Application) throw new Error("runtime shape");
        app = new Application(canvas);
        return app.load(sceneUrl);
      })
      .then(function () { if (!settled || !root.classList.contains("robot--fallback")) ready(); })
      .catch(fail);
  }

  /* ---- rAF-coalesced pointer forwarding -------------------------------- */
  function setupForwarding(root, canvas) {
    var hero = root.closest(".hero") || document.querySelector(".hero");
    if (!hero) return;
    var lastX = 0, lastY = 0, pending = false;

    function flush() {
      pending = false;
      // One synthetic pointermove + mousemove per frame, non-bubbling.
      var opts = { clientX: lastX, clientY: lastY, bubbles: false };
      canvas.dispatchEvent(new PointerEvent("pointermove", opts));
      canvas.dispatchEvent(new MouseEvent("mousemove", opts));
    }
    function onMove(e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      // If the pointer is already over the canvas, Spline gets it natively.
      if (e.target === canvas) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!pending) { pending = true; window.requestAnimationFrame(flush); }
    }
    hero.addEventListener("pointermove", onMove, { passive: true });
  }

  /* ---- Pause the WebGL loop off-screen --------------------------------- */
  function gateVisibility(root, getApp) {
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          var app = getApp();
          if (!app) return;
          try {
            if (en.isIntersecting) { if (app.play) app.play(); }
            else if (app.stop) app.stop();
          } catch (e) { /* runtime version differences — ignore */ }
        });
      },
      { threshold: 0.02 }
    ).observe(root);
  }

  /* ---- Identity tooltip (hover + keyboard focus) ----------------------- */
  function setupTooltip(root, hotspot, tooltip) {
    if (!hotspot || !tooltip) return;
    function clamp(cx, cy) {
      var pad = 12;
      var tw = tooltip.offsetWidth || 240;
      var th = tooltip.offsetHeight || 60;
      var x = Math.max(pad, Math.min(window.innerWidth - tw - pad, cx + 16));
      var y = Math.max(pad, Math.min(window.innerHeight - th - pad, cy + 16));
      tooltip.style.setProperty("--tx", x + "px");
      tooltip.style.setProperty("--ty", y + "px");
    }
    var show = function () { root.classList.add("robot--tip"); };
    var hide = function () { root.classList.remove("robot--tip"); };

    hotspot.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      clamp(e.clientX, e.clientY);
    });
    hotspot.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "touch") return;
      clamp(e.clientX, e.clientY);
      show();
    });
    hotspot.addEventListener("pointerleave", hide);
    hotspot.addEventListener("focus", function () {
      var r = hotspot.getBoundingClientRect();
      clamp(r.left + r.width / 2, r.top + r.height / 2);
      show();
    });
    hotspot.addEventListener("blur", hide);
    hotspot.addEventListener("click", function () {
      var r = hotspot.getBoundingClientRect();
      clamp(r.left + r.width / 2, r.top);
      root.classList.toggle("robot--tip");
    });
    // Hide when the hero scrolls away.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (!en.isIntersecting) hide(); });
      }, { threshold: 0.01 }).observe(root);
    }
  }

  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext &&
        (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
