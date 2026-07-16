# Changelog

All notable changes to Design Lens are documented here. The project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic
version tags.

## Unreleased

## 0.2.0 - 2026-07-16

### Added

- Reference and authorized Rebuild workflows with evidence-specific exports.
- Budgeted Smart Capture with safe large-page degradation and recovery probes.
- Side Panel workspace for coverage, history, Recorder plans, and route projects.
- Task-aware guided capture for real hover, focus, scroll, open, wait, and
  responsive evidence without synthetic page actions.
- Standard and Collector release packages with manifest permission validation.
- Pull request CI, browser stress gates, and draft tag releases.

### Changed

- Manual interaction recording is now supplemental rather than the default
  capture path.
- Deep Chrome DevTools Protocol inspection remains isolated to the separately
  authorized Collector build.

### Fixed

- Use 95th-percentile interaction latency for browser CI gates while retaining
  the maximum driver round-trip for diagnostics, avoiding single-runner
  scheduling outliers without weakening page long-task or heartbeat checks.
- Inject the page bridge only after an explicit user action instead of loading
  it on every website.
- Restore overlay, privacy-mask, and recording runtime state after preparation,
  storage, deep-capture, stop, and guided-capture failures.
- Require explicit open-state evidence for guided open tasks instead of treating
  unrelated DOM mutations as successful capture.
- Pinned patched transitive build-tool versions for esbuild, shell-quote, tmp,
  and uuid while upstream WXT dependencies catch up.
- Generate WXT types during dependency installation so TypeScript checks also
  pass in clean CI runners.

## 0.1.0 - 2026-06-29

### Added

- Initial Chrome MV3 extension for design tokens, component structure,
  interaction timelines, implementation traces, and AI-ready evidence packs.

[Unreleased]: https://github.com/isla4ever/design-lens/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/isla4ever/design-lens/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/isla4ever/design-lens/releases/tag/v0.1.0
