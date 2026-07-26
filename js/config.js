/* ============================================================================
   Jonas Ryan Charles — Portfolio runtime config
   Single source of truth for tunable, non-content settings.
   Classic script (no build). Exposes window.JRC_CONFIG.
   ============================================================================ */
(function () {
  "use strict";

  window.JRC_CONFIG = {
    /* --------------------------------------------------------------------
       Interactive humanoid Nexbot (Spline) scene.

       js/robot.js lazy-loads the Spline runtime from a CDN, renders this
       scene into a transparent canvas on the right of the hero, forwards
       pointer movement so the robot tracks the cursor even over text,
       fades in on load, pauses its WebGL loop off-screen, and shows a
       static humanoid silhouette fallback if WebGL/network/load fails.

       NOTE: the runtime is imported as an ES module and the scene is
       fetched over the network — both require the site to be served over
       http(s) (localhost, GitHub Pages, any host). Opened directly via
       file:// the robot cannot load and the silhouette fallback shows.

       To swap in your own remixed Spline scene later, replace the URL
       below (or set window.JRC_CONFIG.SPLINE_SCENE_URL before this loads).
       -------------------------------------------------------------------- */
    SPLINE_SCENE_URL:
      "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode",

    /* CDN module specifier for the Spline runtime (only fetched when a scene
       URL is set). Pinned to a major version for stability. */
    SPLINE_RUNTIME_URL: "https://esm.sh/@splinetool/runtime@1",

    /* Milliseconds before the robot loader gives up and reveals the fallback,
       so a blocked/slow scene can never trap the interface. */
    SPLINE_FALLBACK_TIMEOUT_MS: 4000,

    /* Preloader boot-sequence total budget (ms). Kept short on purpose; the
       page content mounts behind it and never waits on the 3D scene. */
    PRELOADER_MAX_MS: 2200
  };
})();
