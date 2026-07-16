# Validation

This project uses both unit tests and browser-level probes.

## Current Browser Probe

The implementation trace probe lives under `output/playwright/` during local
development and is not meant to be committed as product output. It uses a
controlled page with:

- Next/Vite-style script names,
- GSAP, PixiJS, Three.js, Lenis, Embla, Rive, and Lottie hints,
- pointer-driven visual state,
- CSS keyframes, transitions, clip-path, and canvas surfaces,
- event handlers, DOM mutations, scroll, and resource timing.

The probe verifies that Design Lens can export:

- implementation trace framework/library/resource evidence,
- interaction timeline pointer and scroll samples,
- runtime CSS/WAAPI animation slices,
- visual surface evidence,
- Skill sections for implementation chain, media effects, and technical routes,
- AI payload implementation context,
- Evidence Pack implementation events.

## Last Local Result

The recording-level probe captured:

- 17 pointer samples,
- 3 scroll samples,
- 25 runtime animation samples,
- 2 DOM mutations,
- 1 visual surface,
- 3 performance events,
- 8 inferred interaction patterns,
- 10 implementation replay events,
- 34 AI payload implementation entries.

`npm run check:all` remains the required project gate.

## Recording Performance Probe

`npm run verify:performance` loads the production content-script bundle in an
isolated Chromium page. The fixture contains 20,000 DOM nodes, continuous class
mutations, scrolling, pointer movement, and a heartbeat control. The probe fails
when an interaction is lost, interaction latency exceeds 500ms, a task exceeds
200ms, the timeline exceeds 12 heavy frames, or the browser console reports an
error.

Use `DESIGN_LENS_STRESS_NODES=100000 npm run verify:performance` to verify the
large-DOM circuit breaker. Pages above 50,000 nodes intentionally skip geometry
and computed-style collection and return explicit reduced evidence rather than
risk a full-document reflow.

Last local results:

| DOM nodes | Start | Stop | Max interaction | Max long task | Heavy frames |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20,000 | 1,236ms | 604ms | 60ms | 0ms | 2 |
| 100,000 | 100ms | 80ms | 138ms | 98ms | 0 |

Both runs received all 24 heartbeat interactions and completed without console
errors. Exact timings vary by machine; the assertions above are the release gate.

## Smart Capture Probe

`npm run verify:smart-capture` verifies the automatic orchestration path in an
isolated Chromium page. It checks quick start acknowledgement, automatic
completion, mutation and large-DOM degradation, a maximum of three follow-up
tasks, real user-stop behavior, and that no timeline samples are added after
stopping.

Use `DESIGN_LENS_STRESS_NODES=100000 npm run verify:smart-capture` for the
snapshot-only extreme-DOM path. This path skips the stability wait and passive
window after the bounded 1,000-node candidate index.

## v0.2.0 Release Candidate

The 2026-07-16 candidate was verified with Node.js 22.23.1 after deleting
`.wxt` and reinstalling with `npm ci`. The postinstall preparation regenerated
WXT types before TypeScript compilation, reproducing the order used by CI.

- Dependency audit: 0 vulnerabilities.
- Automated tests: 78 passed, 0 failed.
- Standard and Collector production builds: passed.
- Standard and Collector ZIP permission/version validation: passed.
- SHA-256 verification for both release archives: passed.
- 100,000-node Smart Capture: 141ms start response, 74ms bounded run, 171ms
  maximum interaction latency, 90ms maximum long task, all 24 heartbeat actions
  received, and no console errors.
- User stop: the sample count remained unchanged after the 300ms post-stop
  window; the extreme-DOM path remained at zero samples.
