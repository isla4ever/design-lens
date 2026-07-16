import React from "react";
import type { CaptureMode } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";

export function CaptureModeSelector({ mode, locale, disabled, onChange }: {
  mode: CaptureMode;
  locale: Locale;
  disabled: boolean;
  onChange: (mode: CaptureMode) => void;
}) {
  const zh = locale === "zh";
  return (
    <section className="mode-selector" aria-label={zh ? "采集用途" : "Capture purpose"}>
      <button className={mode === "reference" ? "active" : ""} type="button" aria-pressed={mode === "reference"} disabled={disabled} onClick={() => onChange("reference")}>
        <strong>{zh ? "设计参照" : "Reference"}</strong>
      </button>
      <button className={mode === "rebuild" ? "active" : ""} type="button" aria-pressed={mode === "rebuild"} disabled={disabled} onClick={() => onChange("rebuild")}>
        <strong>{zh ? "重建" : "Rebuild"}</strong>
      </button>
    </section>
  );
}
