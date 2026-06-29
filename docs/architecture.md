# Design Lens Architecture

## Product Decision

Design Lens is a design intelligence extension, not a source-code cloning tool.
The product captures visible design evidence from a live page, normalizes it into
a reusable design model, and exports reference material for future frontend work.

## Framework Choice

The project uses WXT, React, and TypeScript.

- WXT provides MV3 support, popup/content-script bundling, fast Vite builds, and a path to Firefox/Edge later.
- React keeps the popup UI straightforward and easy to extend.
- TypeScript is required because the analyzer output needs stable schemas.

## Open Source Inspirations

These projects are used as capability references rather than as direct forks:

- `Css-Sniffer`: CSS inspection, design token extraction, animation inspection, export formats.
- `design-mirror-ai`: design reference generation, component and motion language.
- `EasyTalkAI`: click-to-capture interaction, multi-element capture, structured AI-readable specs.
- `Token Inspector`: token scanning discipline and future DevTools panel direction.
- `inspectcn`: WXT + React + Tailwind/shadcn-style extension structure.
- `css-tool`: CSS comparison, pinning elements, responsive breakpoint inspection.

Before copying any code from those projects, verify the license and preserve
attribution. The current MVP is an original implementation.

## Runtime Modules

- `entrypoints/content.ts`: Injected into pages and responds to capture requests.
- `entrypoints/background.ts`: Handles extension commands and active-tab messaging.
- `entrypoints/popup`: React UI for scanning, summarizing, and exporting.
- `src/analyzer`: DOM, token, component, layout, motion, and interaction timeline analysis.
- `src/ai`: Reduced AI context builder and optional OpenAI-compatible client.
- `src/evidence`: Evidence pack and replay-style event stream used by AI,
  Skill, and prototype generation.
- `src/generators`: Markdown Skill, prompt, prototype, formatter, label, and Tailwind export generation.
- `src/shared`: Message and capture schemas.

## Capture Pipeline

1. Collect visible elements from the current viewport.
2. Read computed styles with `getComputedStyle`.
3. Normalize colors, spacing, radii, shadows, and typography into token groups.
4. Detect component patterns from tag, role, class names, geometry, and visual surface.
5. Detect motion from CSS transitions, CSS animations, and Web Animations API.
6. During manual recording, collect pointer/scroll events, runtime animation slices,
   DOM mutations, visual surfaces, and performance timeline events.
7. Generate design character tags, pattern evidence, and implementation guidance.
8. Build a compact evidence pack with replay-style events, evidence gaps, and a
   prototype recipe.
9. Export compact Skill, merged evidence JSON, optional AI prompt/brief, and
   prototype cues for evidence-to-output verification.

## Evidence-To-Prototype Loop

`src/evidence/evidence-pack.ts` is the shared bridge between capture and output.
It deliberately stores summaries rather than raw DOM:

- meta and snapshot-summary events,
- pointer and scroll samples,
- DOM mutation summaries,
- runtime animation slices,
- visual surface signatures,
- performance events,
- evidence gaps,
- prototype states and motion hooks.

The Skill, AI prompt, and prototype cues should all derive from this pack. This keeps
the product honest: if the recording did not capture hover, loading, scroll, or
canvas evidence, the output must ask for another recording pass instead of
hallucinating a complex effect.

## AI Layer

The AI layer is opt-in. If the user supplies a provider key, the extension sends
a reduced structured payload to the selected OpenAI-compatible endpoint and
downloads the model output as part of the prompt pack. Provider keys are saved
only through the explicit AI connection UI and can be cleared there.

## Motion Capture Research Notes

The current implementation uses ideas from mature tools without copying their
source:

- `rrweb`: event stream plus incremental DOM snapshots. Design Lens mirrors the
  principle by recording pointer/scroll samples and filtered DOM mutations.
- Chrome DevTools Protocol: `Animation`, `DOMSnapshot`, and `CSS` domains are the
  right model for a future external collector that can inspect animation groups,
  layout trees, and CSS rule coverage outside content-script limits.
- `Spector.js`: WebGL inspection requires frame-level state and command capture.
  The extension currently records canvas/WebGL visual surfaces and frame
  signatures; deep shader/texture inspection should live in an optional DevTools
  companion, not in the normal popup.
- Performance APIs: `PerformanceObserver` gives paint, layout-shift, long-task,
  mark, and measure signals so the exported skill can describe not only what
  moved, but whether the page relies on heavy runtime work or stable compositor
  animation.

## CDP Companion Boundary

The normal extension should remain local-first and lightweight. Advanced CDP
collection should be implemented as a separate companion/DevTools flow because
it may need debugging permissions, a browser launched with remote debugging, or
explicit DevTools attachment. That companion should emit the same evidence-pack
shape so the rest of the product does not change.

## Advanced Capture Direction

- Add true selected-element-only capture.
- Add hover/focus state sampling.
- Add responsive breakpoint capture.
- Add CSS variable extraction and token naming.
- Add component clustering and visual similarity scoring.
- Add DevTools panel for advanced inspection.
- Add optional Chrome DevTools Protocol collector for Animation, DOMSnapshot, CSS
  coverage, and WebGL/Spector-style frame inspection.
- Add optional local library of captured site references.
