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

## Extension UI Probe

`npm run verify:ui` loads the production extension in isolated Chromium and
renders the compact view, Side Panel overview, and Side Panel settings in
Chinese and English, light and dark themes, and widths from 320px to 380px. It
fails on horizontal overflow, wrapping button labels, unnamed controls,
off-center button icons, console errors, or a Manifest that still binds the
toolbar action to `default_popup`. Screenshots are written to
`output/playwright/extension-ui/` for visual review.

## Real-Site Rebuild Benchmark

The 2026-07-17 AstroWind benchmark exercises the real unpacked Collector,
continuous long-page screenshots, desktop/mobile CDP scenes, export, oracle
calibration, and an evidence-only candidate implementation. It found and
regressed injection, screenshot quota, CDP capability, scroll restoration,
export-scope, and acceptance-policy bugs. See
[AstroWind 自动重建实战](astrowind-rebuild-benchmark.md) for the measurements and
remaining fidelity gaps.

The 2026-07-24 Bilibili benchmark exercises the same path against a dynamic
homepage: 13/13 captured scenes, 100 deep style groups, 0 evidence errors, and
post-capture scrolling recovery. The run was explicitly marked `degraded` after
four long tasks (maximum 130ms), but it did not freeze the page. The independent
candidate reached 0 visible geometry failures after stable-node matching, while
the strict report remained `failed` at 36.53% average pixel mismatch and 80%
state coverage because `open` and seekable motion checkpoint baselines were not
captured. See [Bilibili 首页智能捕获与重建实战](bilibili-rebuild-benchmark.md)
for the full result and the legal boundary around source-site assets.

## Recording Performance Probe

`npm run verify:performance` loads the production content-script bundle in an
isolated Chromium page. The fixture contains 20,000 DOM nodes, continuous class
mutations, scrolling, pointer movement, and a heartbeat control. The probe fails
when an interaction is lost, 95th-percentile interaction latency exceeds its fixture budget,
the recording adds a long task beyond the fixture-adjusted budget, the timeline
exceeds 12 heavy frames, or the browser console reports an error. Before capture,
the probe measures one second of the same continuously mutating page. The
20,000-node gate keeps a 500ms p95 interaction limit and a long-task limit equal
to the greater of 200ms or the fixture baseline plus 100ms. The intentionally
extreme 100,000-node gate uses 600ms and the greater of 300ms or baseline plus
150ms. Both budgets remain visible in the JSON output, and both tiers still
require all 24 heartbeat actions. The maximum driver round-trip remains in the
output for diagnostics, but one scheduling outlier does not fail an otherwise
responsive page.

Use `DESIGN_LENS_STRESS_NODES=100000 npm run verify:performance` to verify the
large-DOM circuit breaker. Pages above 50,000 nodes intentionally skip geometry
and computed-style collection and return explicit reduced evidence rather than
risk a full-document reflow.

Last local results:

| DOM nodes | Start | Stop | P95 interaction | Max round-trip | Baseline task | Recording task | Heavy frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20,000 | 193ms | 943ms | 48ms | 58ms | 0ms | 52ms | 2 |
| 100,000 | 101ms | 82ms | 114ms | 120ms | 68ms | 96ms | 0 |

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
window after the bounded 1,000-node candidate index. It uses the same tiered
interaction and long-task budgets as the recording probe.

## v0.2.0 Release Candidate

The 2026-07-16 candidate was verified with Node.js 22.23.1 after deleting
`.wxt` and reinstalling with `npm ci`. The postinstall preparation regenerated
WXT types before TypeScript compilation, reproducing the order used by CI.

- Dependency audit: 0 vulnerabilities.
- Automated tests: 90 passed, 0 failed.
- Standard and Collector production builds: passed.
- Standard and Collector ZIP permission/version validation: passed.
- SHA-256 verification for both release archives: passed.
- 100,000-node Smart Capture: 144ms start response, 74ms bounded run, 113ms
  p95 interaction latency, 153ms maximum driver round-trip, 68ms fixture
  baseline and 85ms maximum recording task, all 24 heartbeat actions received,
  and no console errors.
- User stop: the sample count remained unchanged after the 300ms post-stop
  window; the extreme-DOM path remained at zero samples.
