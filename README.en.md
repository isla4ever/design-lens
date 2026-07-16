# Design Lens

> Turn “use this website as a reference” into traceable, executable, and testable frontend context for AI.

[![CI](https://github.com/isla4ever/design-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/isla4ever/design-lens/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.2.0-2563eb)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285f4)
![Status](https://img.shields.io/badge/status-alpha-f59e0b)
[![License: MIT](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

[中文](README.md) | **English**

Design Lens is an **evidence-first** Chrome extension for AI coding, vibe coding, and frontend reconstruction workflows. Instead of summarizing a screenshot, it translates a live page into visual tokens, layout structure, component grammar, interaction timelines, motion evidence, implementation clues, and acceptance rules.

```text
Live page → Smart Capture → Structured evidence → Explicit gaps → Prompt / Rebuild draft → Scene acceptance
```

It is not a source downloader, and it never turns missing states into a claim of complete reproduction. The rule is simple: **describe what the evidence supports and keep everything else as an explicit gap.**

> [!IMPORTANT]
> Design Lens is currently alpha software installed through Chrome Developer Mode. Use it only on pages you are authorized to analyze, reference, or rebuild.

## Highlights

| Highlight | How Design Lens handles it |
| --- | --- |
| **One action for baseline capture** | Smart Capture runs a bounded index, stable snapshot, and short passive observation under a 15-second total budget. Large or continuously mutating pages degrade safely. |
| **Reference and Rebuild are separate modes** | Reference extracts transferable design language. Rebuild preserves real screenshots, scenes, geometry, and acceptance constraints. The product never conflates inspiration with reproduction. |
| **Capture only what is missing** | Evidence health produces at most three scroll, hover, focus, open, or responsive tasks instead of making users manually record the entire page first. |
| **Capture-to-acceptance workflow** | Rebuild Packs carry scene manifests and acceptance rules for screenshot, pixel, geometry, motion-checkpoint, and browser-error checks. |
| **No synthetic page actions** | The extension does not automatically click, type, submit forms, or navigate. Users perform real supplemental actions while Design Lens observes and saves the requested state. |
| **On-demand injection and split permissions** | The page bridge is injected only after a user action. The standard build excludes `debugger`; deeper CDP collection is isolated in the Collector build. |

## More Than Screenshot-To-Prompt

| Dimension | Typical screenshot workflow | Design Lens |
| --- | --- | --- |
| Input | One or several static screenshots | DOM structure, tokens, geometry, screenshots, events, motion, and runtime clues |
| Interaction states | Described manually or guessed by a model | Real hover, focus, scroll, open, and responsive scene evidence |
| Missing information | Often filled in as an imagined result | Recorded explicitly as `missing`, `partial`, or `not-applicable` |
| Output | One generic prompt | Evidence Pack, AI Prompt Pack, or Rebuild Draft Pack |
| Acceptance | Visual judgment alone | Explainable candidate reports based only on captured scenes |

## Product Preview

> Screenshots below use the Chinese locale. The extension UI supports both Chinese and English.

### 1. Smart Capture And The Reference Workspace

<table>
  <tr>
    <td width="46%" align="center">
      <img src="docs/assets/design-lens-popup-smart-capture.png" alt="Design Lens Smart Capture result" />
    </td>
    <td width="54%" align="center">
      <img src="docs/assets/design-lens-reference-workspace.png" alt="Design Lens Reference workspace" />
    </td>
  </tr>
  <tr>
    <td><strong>Capture result</strong><br />Keeps only mode, Smart Capture, component picking, and export; detailed briefs live in the workspace.</td>
    <td><strong>Reference workspace</strong><br />Centralizes evidence, export, and generated follow-up tasks without duplicate actions.</td>
  </tr>
</table>

### 2. Rebuild Coverage And Multi-Route Projects

<p align="center">
  <img src="docs/assets/design-lens-sidepanel-coverage.png" alt="Design Lens Rebuild coverage, technical clues, and route project" width="768" />
</p>

Rebuild does not hide uncertainty behind a single completion score. Structure, style, state, screenshot, responsive, and Canvas evidence are reported separately; technical signals and Recorder stay collapsed until needed. A project can contain up to eight same-origin routes for per-route verification.

### 3. Guided Capture: The User Acts, The Extension Observes

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/design-lens-guided-workspace.png" alt="Design Lens guided supplemental task in the Side Panel" />
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/design-lens-guided-capture.png" alt="Design Lens in-page hover evidence capture" />
    </td>
  </tr>
  <tr>
    <td><strong>One clear task at a time</strong><br />The Side Panel explains the current gap and the next user action.</td>
    <td><strong>Observe only the target state</strong><br />A real hover, scroll, or open action is saved after it stabilizes, without synthetic clicks.</td>
  </tr>
</table>

<details>
  <summary><strong>View Recorder import and evidence matching</strong></summary>
  <br />
  <p align="center">
    <img src="docs/assets/design-lens-recorder-diagnosis.png" alt="Chrome DevTools Recorder import, evidence matching, and gap diagnosis" width="360" />
  </p>
  <p>Design Lens can import sanitized Chrome DevTools Recorder JSON. It does not automatically replay the flow. Steps are matched against existing screenshot evidence, and unresolved scenes are merged into at most three supplemental tasks.</p>
</details>

## Two Work Modes

| Mode | Best for | Output boundary |
| --- | --- | --- |
| **Reference** | Borrowing visual, layout, motion, or interaction ideas to create an original interface | Extract transferable design grammar without treating the reference brand, content, or assets as the target product |
| **Rebuild** | Creating a verifiable implementation draft under explicit authorization | Be accountable only for captured screenshots and scenes; uncaptured states remain gaps and are never presented as high fidelity |

## Workflow

1. **Open a page**: visit a normal `http` or `https` page and click Design Lens.
2. **Choose the outcome**: use Reference for original design direction or Rebuild for an authorized implementation draft.
3. **Run Smart Capture**: collect baseline evidence; the page bridge is injected on demand only after this kind of user action.
4. **Review gaps**: use the Side Panel and complete guided capture only for important missing states.
5. **Organize the project**: import a Recorder plan or add up to eight same-origin routes to a Rebuild project.
6. **Export and build**: hand the evidence or prompt pack to an AI coding agent.
7. **Verify the candidate**: replay only evidenced Rebuild scenes without inventing uncaptured behavior.

## Output Packs

| Pack | Main files | Use it for |
| --- | --- | --- |
| **Evidence-only Pack** | `README.md`, `skill.md`, `evidence.json` | Saving, sharing, or handing structured design evidence to any AI tool |
| **AI Prompt Pack** | Evidence files, `ai-coding-prompt.md`, `ai-implementation-brief.md` | Generating a target-specific coding prompt with an OpenAI-compatible model |
| **Rebuild Draft Pack** | `capture-project-v2.json`, `scene-manifest.json`, `acceptance.json`, screenshots, and bounded artifacts | Preserving authorized baselines, explicit gaps, and candidate acceptance rules |

## Install

Requirements: Node.js `>=22.13.0`, npm `>=10`, and Chrome or another Chromium browser.

### Standard Build

```bash
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select:

```text
<project-root>/.output/chrome-mv3
```

The standard build does not request Chrome's `debugger` permission. Use it for everyday Reference and baseline Rebuild capture.

### Collector Build

```bash
npm run build:collector
```

Load `<project-root>/.output/collector/chrome-mv3`. Collector adds `debugger` for authorized DOMSnapshot, matched CSS, geometry, viewport, and animation evidence. Canvas bitmap capture is off by default and bounded by count, pixel-area, and file-size budgets.

## Rebuild Candidate Acceptance

```bash
npm run verify:rebuild -- \
  --pack <rebuild-pack.zip> \
  --url http://localhost:3000
```

The verifier replays only initial, scroll, hover, focus, and open states supported by `scene-manifest.json`. It produces JSON/HTML reports, candidate screenshots, diffs, and focused repair context for an agent.

## Privacy And Permissions

Design Lens processes and exports evidence locally by default. It sends a reduced evidence payload only when a user configures a model key and explicitly requests AI output. That payload is designed to exclude raw DOM, cookies, local storage, credentials, screenshots, and unmasked input values.

| Permission | Purpose |
| --- | --- |
| `activeTab`, `scripting` | Inject the page bridge and capture the active page after a user action |
| `storage` | Store locale, theme, workspace metadata, and optional AI settings locally |
| `tabs`, `sidePanel` | Identify the active tab and connect it to the persistent workspace |
| `<all_urls>` | Let users initiate capture across sites; it does not mean the extension runs automatically on every page |
| `debugger` | Included only in Collector for explicitly authorized, bounded deep collection |

Local Rebuild packs may contain visible page text, screenshots, and sanitized DOMSnapshot data. Treat them as potentially sensitive files. See [Privacy And Permissions](docs/privacy.md) for the complete boundary.

## Development And Quality Gates

```bash
npm run dev                 # Standard development server
npm run dev:collector       # Collector development server
npm run check:all           # TypeScript, 78 tests, and both production builds
npm run check:browser       # 20k/100k DOM performance, stop, and recovery probes
npm run package:release     # Permission/version validation, ZIPs, and SHA256SUMS
```

Install Chromium before the first browser gate:

```bash
npx playwright install chromium
```

## Project Structure

```text
entrypoints/        WXT background, content, popup, and side panel entrypoints
src/analyzer/       Page structure, token, interaction, and motion analysis
src/capture-v2/     Rebuild projects, CDP Collector, scenes, and acceptance contracts
src/evidence/       Evidence packs and summaries
src/generators/     Evidence, prompt, and Skill generators
src/overlay/        In-page picker and guided supplemental capture controls
src/smart-capture/  Smart Capture budgets, orchestration, and gap tasks
src/storage/        IndexedDB workspace and artifact storage
scripts/            Release, stress-probe, and Rebuild verification tools
tests/              Behavior tests
docs/               Architecture, privacy, product decisions, and validation records
```

## Documentation And Contributing

- [Architecture](docs/architecture.md)
- [Privacy And Permissions](docs/privacy.md)
- [Validation](docs/validation.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Release Checklist](docs/release-checklist.md)

Open an issue before starting a large feature. Report security issues privately through [GitHub Private Vulnerability Reporting](https://github.com/isla4ever/design-lens/security/advisories/new).

## License

[MIT](LICENSE) © Isla
