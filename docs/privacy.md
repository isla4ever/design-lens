# Privacy And Permissions

Design Lens is built as a local-first browser extension.

## Default Behavior

- Captures are processed in the browser tab and extension context.
- The extension does not upload page content by default.
- Exported files are generated locally through browser downloads.
- Captured evidence is limited to structured design data: tokens, layout metrics,
  component summaries, interaction cues, motion timing, and timeline evidence.

## Optional AI Analysis

AI analysis is opt-in. The project provides an OpenAI-compatible analysis layer,
but it is not called unless the user explicitly supplies an API key and requests
AI output.

Before sending data to a model, Design Lens builds a reduced evidence payload. It
does not send raw `outerHTML`, full DOM trees, cookies, storage, credentials, or
tracking identifiers.

The popup supports an explicit AI connection menu for OpenAI-compatible
providers: base URL, model, endpoint mode, and API key. Keys are saved only when
the user clicks the save button. The extension stores provider profiles in
`browser.storage.local` on the user's machine, with separate credentials per
provider/model profile. Switching providers does not copy or reuse a key from
another vendor.

If no saved key is configured, the extension does not generate an AI prompt and
can export an evidence-only pack instead. Saved provider profiles can be cleared
from the same AI connection menu.

## Permissions

- `activeTab`: access the page the user is actively inspecting.
- `scripting`: inject the content script when the user starts capture.
- `storage`: store language, theme, and optional local AI provider preferences.
- `tabs`: identify the active tab and send capture messages.
- `<all_urls>` host permission: required so the extension can run on arbitrary
  websites when the user starts a capture.

## User Responsibility

Do not use Design Lens to copy proprietary source code, private content, logos,
brand assets, or images. The tool is intended for design reference and original
implementation.
