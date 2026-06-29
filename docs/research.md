# Research Notes

Design Lens is inspired by mature browser tooling, but the implementation in
this repository is original.

## Projects To Study

- [VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug): browser-native
  visual editing, selection ergonomics, overlay affordances, and designer-facing
  workflows.
- [rrweb](https://github.com/rrweb-io/rrweb): event stream recording,
  incremental DOM snapshots, replayable evidence, and canvas recording patterns.
- [Spector.js](https://github.com/BabylonJS/Spector.js): WebGL frame inspection,
  shader/texture/command capture concepts, and visual debugging workflows.
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/):
  `Animation`, `DOMSnapshot`, and `CSS` domains for future advanced capture.

## Source Study Findings

### rrweb

rrweb records a session as typed JSON events. A replayable stream starts with
`Meta` and `FullSnapshot`, then appends `IncrementalSnapshot` events for
mutation, mouse move, mouse interaction, scroll, viewport resize, input, media,
stylesheet, canvas, and font changes.

Design Lens should not become a generic rrweb clone. The useful idea is the
event ordering model: every design conclusion should point back to a compact
event or evidence sample. The current `src/evidence/evidence-pack.ts` module is
our local version of that idea: it creates a reduced replay-event stream from
tokens, component summaries, pointer samples, scroll samples, runtime animation
slices, DOM mutations, visual surfaces, and performance events.

### Spector.js

Spector models WebGL capture around canvases, contexts, frame boundaries,
commands, programs, shaders, textures, workers, and result views. That level of
inspection is too heavy for the normal popup and may require privileged
instrumentation.

Design Lens should capture canvas/WebGL as visual evidence by default: canvas
size, CSS size, readable/tainted status, frame signature changes, and whether
the surface responds to pointer or timeline changes. Deep command/shader capture
belongs in an optional DevTools/CDP companion.

### VisBug

VisBug is valuable for selection ergonomics: hover feedback, direct manipulation,
and designer-facing overlays. Design Lens should borrow the product pattern, not
implementation: component picking must be fast, visually quiet, and scoped to a
meaningful component/module boundary.

### Chrome DevTools Protocol

CDP is the right future path for evidence that content scripts cannot reliably
capture:

- `Animation`: animation groups, keyframes, current time, playback rate.
- `CSS`: matched styles, computed styles, stylesheet text, coverage.
- `DOMSnapshot`: layout tree and computed style snapshots.
- `Performance`: tracing, long tasks, paints, layout shifts.
- `Runtime`: controlled probes for framework state and helper scripts.

Normal MV3 extensions cannot freely attach to every page's full DevTools
Protocol from a popup. A credible open-source path is an optional companion
collector or DevTools panel, with explicit user action and clear privacy
boundaries.

## Integration Position

The extension should stay lightweight by default:

- Built-in content script: tokens, layout, components, CSS/WAAPI motion,
  pointer/scroll timeline, DOM mutations, visual surface summaries, performance
  events.
- Optional replay layer: rrweb-style event evidence for sessions where users
  need stronger verification.
- Optional DevTools/CDP collector: advanced animation, CSS coverage, DOMSnapshot,
  and WebGL/Spector-style evidence.

## Closed Loop

The product loop should be:

1. Capture visible design evidence.
2. Convert evidence into a compact replay-style event pack.
3. Generate a Skill, AI prompt, and standalone prototype from the same pack.
4. Let the user visually inspect whether the prototype preserves layout,
   interaction intent, motion order, and component structure.
5. If evidence is weak, the exported material must say what to record again
   instead of inventing details.

## Product Rule

Do not turn Design Lens into a generic recorder. Its differentiator is translating
design evidence into AI-ready design references, component skills, and prototype
checks that reduce frontend iteration cost.
