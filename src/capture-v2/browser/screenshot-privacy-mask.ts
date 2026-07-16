const MASK_STYLE_ID = "design-lens-capture-privacy-mask";

export function setScreenshotPrivacyMask(doc: Document, enabled: boolean) {
  doc.getElementById(MASK_STYLE_ID)?.remove();
  if (!enabled) return;
  const style = doc.createElement("style");
  style.id = MASK_STYLE_ID;
  style.textContent = `
    input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="image"]),
    textarea,
    select,
    [contenteditable="true"] {
      color: transparent !important;
      -webkit-text-fill-color: transparent !important;
      caret-color: transparent !important;
      text-shadow: none !important;
    }
    input::placeholder,
    textarea::placeholder {
      color: transparent !important;
      -webkit-text-fill-color: transparent !important;
    }
  `;
  (doc.head ?? doc.documentElement).appendChild(style);
}
