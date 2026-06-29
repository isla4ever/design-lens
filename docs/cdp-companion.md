# CDP Companion Plan

The browser extension can capture a useful local-first evidence pack, but some
advanced signals are more reliable through Chrome DevTools Protocol. This file
defines the future companion boundary.

## Why A Companion

Normal MV3 content scripts cannot reliably inspect everything a designer cares
about: animation groups, stylesheet coverage, layout snapshots, framework state,
WebGL commands, shader programs, and trace-level performance. A companion flow
can ask for explicit user permission and collect richer evidence without
pretending the popup has powers it does not have.

## Target Domains

- `Animation`: animation groups, keyframe models, playback rate, current time,
  paused/running state, and timeline order.
- `CSS`: matched rules, computed styles, CSS variables, media queries,
  pseudo-state forcing, and coverage.
- `DOMSnapshot`: layout tree, paint order hints, box geometry, text boxes, and
  computed style snapshots.
- `Runtime`: controlled probes for `document.getAnimations()`, framework debug
  handles, and canvas helpers.
- `Performance` / tracing: paints, layout shifts, long tasks, frame timing, and
  scroll jank signals.

## Output Contract

The companion should not create a separate export format. It should emit the
same evidence-pack shape used by `src/evidence/evidence-pack.ts`, with optional
extra event kinds added only when the normal extension can safely ignore them.

Recommended additions:

- `cdp-animation-group`
- `cdp-css-rule`
- `cdp-dom-snapshot`
- `cdp-trace-frame`
- `webgl-frame-summary`

## Privacy Rules

- User must explicitly start CDP capture.
- Do not collect cookies, localStorage, sessionStorage, request bodies, or
  credentials.
- Prefer summaries over raw source text.
- If stylesheet snippets are included, trim them to selectors and declarations
  required for visible design evidence.
- Never upload companion output automatically.

## Validation

Every companion capture should be judged by the same closed loop:

1. Can the evidence explain the observed layout/motion/interaction?
2. Can the Skill point to concrete implementation choices?
3. Can the prototype improve because of the extra evidence?
4. Does the output name missing states instead of inventing them?
