/* ============================================================================
   Jonas Ryan Charles — Centralized profile + HDL terminal command table
   Single source of truth. The page and the terminal both read from here.
   Facts only — no invented metrics. Classic script; exposes window.JRC_DATA.
   ============================================================================ */
(function () {
  "use strict";

  var profile = {
    name: "Jonas Ryan Charles",
    headline: "Electrical & Electronic Engineering",
    role: "Electrical & Electronic Engineering (Honours) student",
    org: "University of Adelaide",
    location: "Adelaide, SA",
    email: "jonasryancharles@gmail.com",
    phone: "+61 481 328 076",
    linkedin: "#", // placeholder — set real URL when available
    about: [
      "Honours student in Electrical & Electronic Engineering at the",
      "University of Adelaide, working across semiconductor device",
      "modelling, analog circuit design, and embedded systems — from",
      "TCAD device physics up to working hardware."
    ],
    education: [
      {
        id: "adelaide",
        span: "Jul 2025 – Dec 2027 (expected)",
        title: "B.Eng (Honours), Electrical & Electronic Engineering",
        org: "University of Adelaide"
      },
      {
        id: "vit",
        span: "Aug 2023 – Jul 2025",
        title: "B.Tech, Electronics & Communication Engineering",
        org: "VIT Chennai — transferred to Adelaide"
      }
    ],
    experience: [
      {
        id: "trident",
        span: "Mar 2026 – Present",
        role: "Senior Roof & Gutter Technician",
        org: "Trident Gold · Adelaide, SA",
        notes: [
          "Promoted within 8 months; supervises site tasks and coordinates",
          "daily work.",
          "Mentors newer technicians on safe work practices (SWMS, hazard ID).",
          "Level 1 Technician: Aug 2025 – Mar 2026."
        ]
      },
      {
        id: "goodman",
        span: "Oct 2025 – Present",
        role: "Production Worker",
        org: "Goodman Fielder · Adelaide, SA",
        notes: [
          "Line 1 bakehouse operations: production flow, quality checks,",
          "food-safety compliance."
        ]
      },
      {
        id: "band",
        span: "Chennai",
        role: "Event Coordinator — BAND-VIT",
        org: "VIT Chennai",
        notes: ["900+ participant gaming event, 300% ROI."]
      },
      {
        id: "ieee",
        span: "Chennai",
        role: "Core Team Member — IEEE Photonics Society",
        org: "VIT Chennai",
        notes: [
          "TCAD biosensor contributions; semiconductor research webinars."
        ]
      }
    ],
    projects: [
      {
        id: "P-01",
        title: "FinFET & GaNFET Biosensor Research",
        context: "Presented — Intl. Conf. on Multifunctional Materials",
        summary: [
          "TCAD simulation (Synopsys + Silvaco) of FinFET and GaNFET device",
          "architectures for biosensing and high-frequency sensing. Swept gate",
          "scaling and analysed defect detection, quantifying the sensitivity-",
          "vs-noise trade-off to guide device sizing."
        ],
        tools: ["Synopsys TCAD", "Silvaco TCAD", "FinFET", "GaNFET"],
        link: ""
      },
      {
        id: "P-02",
        title: "Secure Messaging on an 8-bit Micro",
        context: "Embedded systems — AT89S52 (8051-class)",
        summary: [
          "Lightweight dual-layer encryption combining dynamic XOR keying with",
          "Morse encoding, sized to an 8-bit micro's memory/clock budget.",
          "Implemented and validated end to end on an AT89S52."
        ],
        tools: ["AT89S52", "8051", "Assembly", "Embedded C"],
        link: ""
      },
      {
        id: "P-03",
        title: "TCAD Nanosensor Sensitivity Study",
        context: "IEEE Photonics Society — core team, Chennai",
        summary: [
          "Contributed TCAD-based device simulations toward biosensor designs",
          "aimed at improving nanosensor sensitivity."
        ],
        tools: ["TCAD", "Nanosensors", "Photonics", "Simulation"],
        link: ""
      },
      {
        id: "P-04",
        title: "Antenna Design & Fabrication",
        context: "RF / electronics lab practice",
        summary: [
          "Designed, fabricated, and tested antennas — iterating between",
          "simulated and measured response across the full RF loop."
        ],
        tools: ["Antenna Design", "RF", "Fabrication", "Measurement"],
        link: ""
      }
    ],
    skills: {
      "semiconductor / device": [
        "Synopsys TCAD", "Silvaco TCAD", "FinFET", "GaNFET",
        "Device Modelling"
      ],
      "analog / electronics": [
        "Analog Circuit Design", "Cadence Virtuoso", "LTspice", "PCB Design",
        "Antenna Design"
      ],
      "embedded systems": [
        "AT89S52 / 8051", "Microcontrollers", "Assembly", "Embedded C"
      ],
      "hdl / programming": [
        "SystemVerilog", "VHDL", "Python", "Java", "Assembly", "MATLAB"
      ],
      "pcb / tools": [
        "KiCad", "Git", "Siemens Automation", "Revit", "Figma", "Postman"
      ]
    },
    tools: [
      "Cadence Virtuoso", "Synopsys TCAD", "Silvaco TCAD", "LTspice", "MATLAB",
      "KiCad", "Git", "Revit", "Figma", "Postman", "VS Code"
    ],

    /* Canonical hero metrics. The hero cards in index.html mirror these values
       verbatim (rendered statically so the hero never depends on JS).
       Every figure is verified against this file / the resume:
         gpa      - supplied by Jonas (not present in the resume PDF)
         projects - 4, counted from `projects` above (P-01..P-04)
         tcad     - 2, Synopsys TCAD + Silvaco TCAD from `skills`
         talks    - 1, Intl. Conference on Multifunctional Materials (P-01) */
    metrics: [
      { id: "gpa", value: "6.0", suffix: "/ 7.0", label: "Engineering GPA", sub: "" },
      { id: "projects", value: "4", suffix: "", label: "Technical Projects", sub: "Semiconductor · Embedded · RF" },
      { id: "tcad", value: "2", suffix: "", label: "TCAD Platforms", sub: "Synopsys · Silvaco" },
      { id: "talks", value: "1", suffix: "", label: "Conference Presentation", sub: "Engineering Research" }
    ]
  };

  /* ---- Command table. Each run() returns an array of output lines. -------- */
  var C = {};

  C.help = {
    summary: "list available commands",
    run: function () {
      return [
        "// JRC-ENG HDL profile console — available commands",
        "",
        "  help                 this list",
        "  whoami               name + engineering identity",
        "  about                short bio",
        "  experience  (ls -e)  work history",
        "  education   (ls -d)  academic timeline",
        "  projects    (ls)     list projects",
        "  open <id>            project detail (e.g. open P-01)",
        "  skills               skills grouped by domain",
        "  tools                EDA / software toolchain",
        "  contact              how to reach me",
        "  resume               how to get my resume",
        "  status               node status readout",
        "  pinout               interface map",
        "  compile profile_top.v   build the profile (thematic)",
        "  simulate profile_top    run the timeline (thematic)",
        "  history              command history",
        "  clear                clear the console"
      ];
    }
  };

  C.whoami = {
    summary: "name + engineering identity",
    run: function (p) {
      return [
        p.name,
        p.role + " · " + p.org,
        p.location + " · open to internships"
      ];
    }
  };

  C.about = {
    summary: "short bio",
    run: function (p) {
      return ["// about"].concat(p.about);
    }
  };

  C.experience = {
    summary: "work history",
    run: function (p) {
      var out = ["// experience"];
      p.experience.forEach(function (e) {
        out.push("");
        out.push("[" + e.span + "]  " + e.role);
        out.push("  " + e.org);
        (e.notes || []).forEach(function (n) { out.push("  - " + n); });
      });
      return out;
    }
  };

  C.education = {
    summary: "academic timeline",
    run: function (p) {
      var out = ["// education"];
      p.education.forEach(function (e) {
        out.push("");
        out.push("[" + e.span + "]");
        out.push("  " + e.title);
        out.push("  " + e.org);
      });
      return out;
    }
  };

  C.projects = {
    summary: "list projects",
    run: function (p) {
      var out = ["// projects — 'open <id>' for detail", ""];
      p.projects.forEach(function (pr) {
        out.push("  " + pr.id + "  " + pr.title);
        out.push("        " + pr.context);
      });
      return out;
    }
  };

  C.open = {
    summary: "project detail: open <id>",
    run: function (p, args) {
      var id = (args[0] || "").toUpperCase();
      if (!id) return ["usage: open <id>   e.g. open P-01"];
      var pr = p.projects.filter(function (x) { return x.id === id; })[0];
      if (!pr) return ["no such project: " + id, "type 'projects' to list."];
      var out = [pr.id + "  " + pr.title, "  " + pr.context, ""];
      pr.summary.forEach(function (s) { out.push("  " + s); });
      out.push("");
      out.push("  tools: " + pr.tools.join(" · "));
      if (pr.link) out.push("  link:  " + pr.link);
      return out;
    }
  };

  C.skills = {
    summary: "skills grouped by domain",
    run: function (p) {
      var out = ["// skills"];
      Object.keys(p.skills).forEach(function (k) {
        out.push("");
        out.push("  " + k + ":");
        out.push("    " + p.skills[k].join(" · "));
      });
      return out;
    }
  };

  C.tools = {
    summary: "EDA / software toolchain",
    run: function (p) {
      return ["// toolchain", "", "  " + p.tools.join(" · ")];
    }
  };

  C.contact = {
    summary: "how to reach me",
    run: function (p) {
      return [
        "// contact",
        "",
        "  email     " + p.email,
        "  phone     " + p.phone,
        "  location  " + p.location,
        "",
        "Open to electrical engineering internships and student engineer",
        "roles in Adelaide and beyond."
      ];
    }
  };

  C.resume = {
    summary: "how to get my resume",
    run: function (p) {
      return [
        "// resume",
        "",
        "  Available on request — email " + p.email + " and I'll send the",
        "  latest PDF. (No file is bundled with this site by design.)"
      ];
    }
  };

  C.status = {
    summary: "node status readout",
    run: function () {
      return [
        "NODE          JRC_ENGINEERING_NODE",
        "STATE         ONLINE",
        "MODE          OPEN_TO_INTERNSHIPS",
        "CLK           locked",
        "BUS           experience · education · projects — nominal"
      ];
    }
  };

  C.pinout = {
    summary: "interface map",
    run: function (p) {
      return [
        "// pinout — profile_top",
        "",
        "  1  CLK_IN      -> university of adelaide",
        "  2  DATA[0]     -> " + p.email,
        "  3  DATA[1]     -> " + p.phone,
        "  4  DOMAIN      -> semiconductor / analog / embedded",
        "  5  GND         -> adelaide, sa"
      ];
    }
  };

  C.modules = {
    summary: "list profile modules",
    run: function () {
      return [
        "// modules in profile_top.v",
        "",
        "  education_rom",
        "  experience_bus",
        "  project_register",
        "  skills_alu",
        "  contact_io"
      ];
    }
  };

  C.compile = {
    summary: "compile profile_top.v (thematic)",
    run: function (p, args) {
      var target = args[0] || "profile_top.v";
      return [
        "// compiling " + target + " — thematic build, not a real HDL compile",
        "[INFO] Elaborating profile_top...",
        "[INFO] Loading education_rom...",
        "[INFO] Linking experience_bus...",
        "[INFO] Indexing project_register...",
        "[INFO] Mapping skills_alu...",
        "[PASS] Profile build completed with 0 unresolved references."
      ];
    }
  };

  C.simulate = {
    summary: "simulate profile_top (thematic)",
    run: function (p) {
      return [
        "// simulate profile_top — timeline trace",
        "",
        "  t0   2023  boot    VIT Chennai (ECE)",
        "  t1   2025  jump    -> University of Adelaide (EEE Hons)",
        "  t2   ....  proc    FinFET/GaNFET TCAD · AT89S52 secure msg",
        "  t3   now   ready   open to internships",
        "",
        "[PASS] simulation finished — 0 errors."
      ];
    }
  };

  /* ---- Aliases resolved by the parser in console.js ---------------------- */
  var ALIASES = {
    ls: "projects",
    "ls -e": "experience",
    "ls -d": "education",
    "cat about": "about",
    "cat experience": "experience",
    "cat education": "education",
    "cat skills": "skills",
    "cat contact": "contact",
    man: "help",
    "?": "help"
  };

  window.JRC_DATA = { profile: profile, commands: C, aliases: ALIASES };
})();
