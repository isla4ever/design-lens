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

`npm run check` remains the required project gate.

