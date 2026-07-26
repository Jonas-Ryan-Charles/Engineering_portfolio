/* ============================================================================
   HDL Profile Terminal — interactive, deterministic, local-only.

   Output streams like a program printing results rather than appearing at once:

     idle -> processing -> printing -> idle

   One controlled timeout chain, guarded by a run id so a cancelled or
   fast-forwarded command can never have stale output land later. No eval, no
   shell, no network. Reads everything from window.JRC_DATA.

   Controls while output is streaming:
     Enter  -> fast-forward (reveal the rest immediately)
     Escape -> cancel printing and restore the prompt
   ============================================================================ */
(function () {
  "use strict";

  var MAX_INPUT = 120;

  /* Streaming timings (balanced set from the spec). */
  var PROCESSING_MS = 450;   // total processing indicator time
  var DOT_MS = 130;          // processing dot cadence
  var CHAR_MS = 18;          // per character while typing a line
  var LINE_MS = 150;         // pause after a typed line
  var REVEAL_MS = 100;       // pause between non-typed (revealed) lines
  var PROMPT_MS = 220;       // delay before the prompt returns
  var TYPE_LINES_MAX = 3;    // only the first N lines are char-typed
  var TYPE_LINE_MAXLEN = 72; // longer lines are revealed, not typed
  /* Reduced motion: keep the "program ran" feel, drop the typing. */
  var RM_PROCESSING_MS = 200;
  var RM_REVEAL_MS = 60;

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  function boot() {
    var el = document.querySelector("[data-terminal]");
    if (!el) return;
    var data = window.JRC_DATA;
    if (!data || !data.commands) return;
    var profile = data.profile;
    var commands = data.commands;
    var aliases = data.aliases || {};

    var output = el.querySelector(".terminal__output");
    var input = el.querySelector(".terminal__input");
    var form = el.querySelector(".terminal__form");
    var statusEl = el.querySelector("[data-terminal-status]");
    if (!output || !input || !form) return;

    var history = [];
    var hIndex = -1;

    /* ---- Streaming state ------------------------------------------------- */
    var status = "idle";      // idle | processing | printing
    var runId = 0;            // invalidates stale callbacks
    var timer = null;
    var job = null;           // { lines, i, el, text }

    function rm() { return reduceMQ.matches; }

    function later(fn, ms, myRun) {
      timer = window.setTimeout(function () {
        if (myRun !== runId) return;   // stale chain — drop it
        fn();
      }, ms);
    }
    function clearTimer() {
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
    }

    function setBusy(on) {
      el.classList.toggle("is-busy", !!on);
      if (statusEl) statusEl.textContent = on ? "● BUSY" : "";
    }

    /* ---- Rendering (textContent only — no innerHTML) ---------------------- */
    function classify(text) {
      if (/^\s*\/\//.test(text)) return "c-comment";
      if (/\[PASS\]/.test(text)) return "c-ok";
      if (/\[INFO\]/.test(text)) return "c-param";
      if (/^command not found/.test(text) || /^no such|^usage:/.test(text))
        return "c-err";
      return "";
    }

    function addLine(text, forceCls) {
      var div = document.createElement("div");
      div.className = "terminal__line";
      var cls = forceCls != null ? forceCls : classify(text || "");
      if (cls) div.className += " " + cls;
      div.textContent = text || "";
      output.appendChild(div);
      return div;
    }

    function echo(cmd) {
      var div = document.createElement("div");
      div.className = "terminal__line terminal__line--cmd";
      var p = document.createElement("span");
      p.className = "terminal__prompt";
      p.textContent = "jonas@fpga:~$ ";
      var c = document.createElement("span");
      c.textContent = cmd;
      div.appendChild(p);
      div.appendChild(c);
      output.appendChild(div);
      scrollEnd();
    }

    /* Auto-scroll the terminal body only — never the page. */
    function scrollEnd() { output.scrollTop = output.scrollHeight; }

    /* ---- Command resolution ---------------------------------------------- */
    function resolve(raw) {
      var cmd = raw.trim().replace(/\s+/g, " ");
      if (aliases[cmd.toLowerCase()]) cmd = aliases[cmd.toLowerCase()];
      var parts = cmd.split(" ");
      var name = (parts.shift() || "").toLowerCase();
      return { name: name, args: parts };
    }

    function linesFor(r) {
      if (r.name === "history") {
        return history.slice(0, -1).map(function (h, i) {
          return "  " + (i + 1) + "  " + h;
        });
      }
      var entry = commands[r.name];
      if (entry && typeof entry.run === "function") {
        return entry.run(profile, r.args) || [];
      }
      return [
        "command not found: " + r.name,
        'type "help" to list supported commands'
      ];
    }

    /* ---- Lifecycle -------------------------------------------------------- */
    function complete(myRun) {
      if (myRun !== runId) return;
      addLine("");
      scrollEnd();
      later(function () {
        status = "idle";
        job = null;
        setBusy(false);
        if (document.activeElement === input || document.body.contains(input)) {
          try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
        }
      }, rm() ? 80 : PROMPT_MS, myRun);
    }

    function typeLine(myRun) {
      if (myRun !== runId || !job) return;
      var text = job.text;
      if (job.charIndex >= text.length) {
        job.i++;
        job.el = null;
        later(function () { nextLine(myRun); }, LINE_MS, myRun);
        return;
      }
      job.charIndex++;
      job.el.textContent = text.slice(0, job.charIndex);
      later(function () { typeLine(myRun); }, CHAR_MS, myRun);
    }

    function nextLine(myRun) {
      if (myRun !== runId || !job) return;
      if (job.i >= job.lines.length) { complete(myRun); return; }

      var text = job.lines[job.i];
      var shouldType =
        !rm() && job.i < TYPE_LINES_MAX && text.length <= TYPE_LINE_MAXLEN;

      if (shouldType) {
        job.el = addLine("", classify(text));
        job.text = text;
        job.charIndex = 0;
        typeLine(myRun);
      } else {
        addLine(text);
        scrollEnd();
        job.i++;
        later(function () { nextLine(myRun); }, rm() ? RM_REVEAL_MS : REVEAL_MS, myRun);
      }
    }

    function startPrinting(myRun) {
      if (myRun !== runId) return;
      status = "printing";
      nextLine(myRun);
    }

    function processing(myRun) {
      var line = addLine("processing", "c-param");
      var dots = 0;
      var elapsed = 0;
      var budget = rm() ? RM_PROCESSING_MS : PROCESSING_MS;
      (function tick() {
        if (myRun !== runId) return;
        if (elapsed >= budget) {
          if (line.parentNode) line.parentNode.removeChild(line);
          startPrinting(myRun);
          return;
        }
        dots = (dots % 3) + 1;
        line.textContent = "processing" + new Array(dots + 1).join(".");
        elapsed += DOT_MS;
        scrollEnd();
        later(tick, DOT_MS, myRun);
      })();
    }

    /* Reveal everything still pending, immediately. */
    function fastForward() {
      if (status === "idle" || !job) return;
      clearTimer();
      var myRun = ++runId;      // invalidate the old chain
      // finish a partially typed line
      if (job.el) { job.el.textContent = job.text; job.i++; job.el = null; }
      // drop a lingering "processing" indicator
      var last = output.lastChild;
      if (last && /^processing\.*$/.test(last.textContent)) output.removeChild(last);
      for (var k = job.i; k < job.lines.length; k++) addLine(job.lines[k]);
      job.i = job.lines.length;
      scrollEnd();
      status = "printing";
      complete(myRun);
    }

    /* Stop printing and hand the prompt back, leaving what was printed. */
    function cancel() {
      if (status === "idle") return;
      clearTimer();
      runId++;
      var last = output.lastChild;
      if (last && /^processing\.*$/.test(last.textContent)) output.removeChild(last);
      job = null;
      status = "idle";
      setBusy(false);
      addLine("^C", "c-err");
      addLine("");
      scrollEnd();
    }

    function run(raw) {
      if (status !== "idle") return;       // input is locked while streaming
      var clean = (raw || "").slice(0, MAX_INPUT);
      var trimmed = clean.trim();
      if (!trimmed) return;

      echo(trimmed);
      history.push(trimmed);
      hIndex = history.length;

      var r = resolve(trimmed);
      if (r.name === "clear") { output.innerHTML = ""; return; }

      job = { lines: linesFor(r), i: 0, el: null, text: "", charIndex: 0 };
      status = "processing";
      setBusy(true);
      processing(++runId);
    }

    /* ---- Input ------------------------------------------------------------ */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (status !== "idle") { fastForward(); return; } // Enter = fast-forward
      var v = input.value;
      input.value = "";
      run(v);
      input.focus();
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (status !== "idle") { cancel(); return; }
        input.blur();
      } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        output.innerHTML = "";
      } else if (e.key === "ArrowUp") {
        if (history.length) {
          hIndex = Math.max(0, hIndex - 1);
          input.value = history[hIndex] || "";
          e.preventDefault();
        }
      } else if (e.key === "ArrowDown") {
        if (history.length) {
          hIndex = Math.min(history.length, hIndex + 1);
          input.value = history[hIndex] || "";
          e.preventDefault();
        }
      }
    });
    input.setAttribute("maxlength", String(MAX_INPUT));

    // Clickable command chips (ignored while busy, so nothing queues up).
    var wrap = el.parentNode;
    if (wrap && wrap.querySelectorAll) {
      wrap.querySelectorAll("[data-cmd]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (status !== "idle") { fastForward(); return; }
          run(btn.getAttribute("data-cmd"));
          input.focus();
        });
      });
    }

    // Never leave timers running past the page.
    window.addEventListener("pagehide", function () { clearTimer(); runId++; });

    /* Boot banner prints instantly; the first command streams. */
    addLine("// JRC-ENG // HDL profile console");
    addLine("// type a command, or tap a chip below. try 'help'.");
    addLine("");
    run("whoami");

    /* Read-only debug surface. */
    window.__TERMINAL__ = {
      state: function () {
        return {
          status: status, runId: runId,
          queued: job ? job.lines.length : 0,
          printed: job ? job.i : 0,
          busyClass: el.classList.contains("is-busy"),
          text: output.textContent
        };
      },
      run: run,
      fastForward: fastForward
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
