# Implementation Trace

Design Lens does not copy source code. It records implementation-chain evidence
that helps humans and AI agents infer how an interface is built.

## Current Content-Script Layer

The normal extension can collect:

- script, stylesheet, inline style, inline script, and resource summaries,
- framework hints such as Next.js, Nuxt/Vue, Astro, Svelte, Angular, Vite, and
  bundled chunk patterns,
- library hints such as GSAP, Motion, Three.js, PixiJS, Lenis, Embla, Rive,
  Lottie, Swiper, and related visual-effect libraries,
- visible sourcemap hints,
- interactive element counts, inline handler hints, delegated-state roots, and
  PerformanceEventTiming availability,
- stylesheet/runtime style counts, active Web Animations, and resource timing
  summaries.

This layer is useful because it gives the exported Skill and AI Brief a stronger
implementation map without copying private code or assets.

## Future CDP Companion Layer

Some evidence cannot be reliably collected from a normal content script. A
future DevTools/CDP companion should add:

- `DOMDebugger.getEventListeners` for exact event listener locations,
- `Debugger.scriptParsed` and sourcemap URLs for script/module mapping,
- `CSS.getMatchedStylesForNode` and `CSS.startRuleUsageTracking` for mapping
  computed styles back to CSS rules,
- `Animation` domain data for animation groups, keyframes, playback rate, and
  scroll-linked animation state,
- `DOMSnapshot.captureSnapshot` for stable layout-tree and computed-style
  snapshots,
- `Performance` / tracing data for long tasks, layout shifts, paints, and
  interaction cost,
- optional WebGL/canvas inspection inspired by Spector.js-style frame analysis.

The companion should emit the same evidence-pack shape so Skill, AI Brief,
evidence export, and prototype cues do not need separate pipelines.

## Product Rule

Implementation trace is evidence, not permission to clone. Use it to recover
architecture, event flow, animation layers, and technical routes. Do not copy
private source code, proprietary imagery, brand assets, or tracking scripts.
