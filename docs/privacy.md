# Privacy And Permissions

Design Lens is a local-first browser extension. This document describes the
behavior of the source build in this repository; a modified distribution may
behave differently.

## Activation And Default Behavior

- The extension does not register a content script that runs automatically on
  every matching website.
- The page bridge is injected on demand after a user starts capture, opens a
  page tool, or uses the capture shortcut. Once injected, it remains idle
  between explicit commands and is removed by the browser when the page unloads.
- Captures are processed in the page and extension contexts. Generated exports
  are downloaded locally.
- The extension does not automatically click, type, submit forms, or navigate
  to unknown pages.

Workspace metadata and bounded artifacts are stored in the extension's local
IndexedDB or `browser.storage.local`. Users can delete workspace records from
the Side Panel or clear all extension data through the browser.

## Data In Captures

A reference capture can include design tokens, layout metrics, component
summaries, visible text excerpts, resource clues, interaction samples, motion
timing, and evidence metadata.

An authorized Rebuild capture can additionally include screenshots, masked
rrweb events, and, in the Collector build, sanitized DOMSnapshot, matched CSS,
geometry, viewport, animation, and optionally bounded Canvas evidence. Input
values are masked and DOMSnapshot form-value fields are sanitized, but captures
can still contain visible page content. Treat exported packs as potentially
sensitive files.

Design Lens is not designed to read cookies, local-storage values, credentials,
request headers, or request bodies. Cross-origin iframe internals and unreadable
or oversized visual surfaces remain explicit gaps.

## Optional AI Generation

AI generation is opt-in. It is not called unless the user configures an
OpenAI-compatible provider and requests AI output.

Before a request, Design Lens builds a reduced evidence payload. It is designed
to exclude raw DOM, full DOM trees, cookies, browser storage, credentials,
tracking identifiers, screenshots, and unmasked input values. The selected
provider still receives the reduced design evidence and the user's build brief;
its own privacy policy applies.

Provider base URL, model, endpoint mode, and API key are saved only when the
user chooses to save them. Profiles are stored in `browser.storage.local` on
the user's machine and are not encrypted by Design Lens. Profiles can be
cleared from the AI settings UI. Without a configured key, users can export an
evidence-only pack.

## Permissions

| Permission | Why it is requested |
| --- | --- |
| `activeTab` | Work with the page the user is actively inspecting. |
| `scripting` | Inject the page bridge after a user action. |
| `storage` | Store locale, theme, workspace metadata, and optional AI provider settings locally. |
| `tabs` | Identify the active tab and exchange capture messages. |
| `sidePanel` | Provide the persistent coverage, history, route, and settings workspace. |
| `<all_urls>` | Let users initiate capture on arbitrary websites. This host permission does not cause automatic capture or automatic page injection. |

The separately built Collector adds Chrome's `debugger` permission. It is used
only after explicit Rebuild authorization for bounded DOMSnapshot, CSS,
geometry, viewport, and animation evidence. The standard release is validated
to exclude this permission. Collector sessions detach and restore viewport,
scroll, animation, forced pseudo-state, capture UI, and privacy-mask state on
success, stop, timeout, and handled failure paths.

## User Responsibility

Use Design Lens only where you have permission to inspect and reuse the
resulting evidence. Do not use it to republish proprietary source code, private
content, credentials, trademarks, brand assets, fonts, images, or video without
the required rights.

Report a privacy or security vulnerability through
[GitHub Private Vulnerability Reporting](https://github.com/isla4ever/design-lens/security/advisories/new).
