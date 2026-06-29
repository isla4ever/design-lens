import type { DesignCapture } from "./schema";
import type { Locale } from "./i18n";
import type { ThemeMode } from "./theme-storage";

export type CaptureRequest =
  | { type: "DESIGN_LENS_CAPTURE_PAGE" }
  | { type: "DESIGN_LENS_PICK_ELEMENT" }
  | { type: "DESIGN_LENS_CAPTURE_HOVER" }
  | { type: "DESIGN_LENS_RECORD_START"; locale?: Locale }
  | { type: "DESIGN_LENS_RECORD_STOP"; locale?: Locale }
  | { type: "DESIGN_LENS_RECORD_STATUS"; locale?: Locale }
  | { type: "DESIGN_LENS_TOGGLE_OVERLAY"; locale?: Locale }
  | { type: "DESIGN_LENS_OPEN_AND_SCAN"; locale?: Locale; scanMode?: ScanMode }
  | { type: "DESIGN_LENS_OPEN_RECORDER"; locale?: Locale }
  | { type: "DESIGN_LENS_OPEN_AND_PICK"; locale?: Locale }
  | { type: "DESIGN_LENS_SET_THEME"; theme: ThemeMode }
  | { type: "DESIGN_LENS_SET_LOCALE"; locale: Locale };

export type ScanMode = "instant" | "recorded";

export type CaptureResponse =
  | {
      ok: true;
      capture: DesignCapture;
      isRecording?: boolean;
    }
  | {
      ok: false;
      error: string;
    };
