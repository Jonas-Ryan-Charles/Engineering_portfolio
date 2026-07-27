/* ============================================================================
   Interactive tags — every .tag is clickable/keyboard-toggleable; toggling
   flips the teal "active" highlight (.tag--signal). Purely presentational.
   Classic script; boots on DOMContentLoaded.
   ============================================================================ */
(function () {
  "use strict";

  function boot() {
    var tags = document.querySelectorAll(".tag");
    Array.prototype.forEach.call(tags, function (t) {
      t.setAttribute("role", "button");
      t.setAttribute("tabindex", "0");
      t.setAttribute(
        "aria-pressed",
        t.classList.contains("tag--signal") ? "true" : "false"
      );

      function toggle() {
        var on = t.classList.toggle("tag--signal");
        t.setAttribute("aria-pressed", on ? "true" : "false");
      }

      t.addEventListener("click", toggle);
      t.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
