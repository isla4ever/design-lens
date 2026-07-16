import type { Locale } from "./i18n";
import type { CaptureResponse } from "./messages";

const CONTENT_SCRIPT_FILE = "/content-scripts/content.js";

export async function ensureDesignLensPageBridge(tabId: number, locale?: Locale) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_RECORD_STATUS", locale }) as CaptureResponse;
  } catch {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE]
    });
  }

  if (locale) {
    await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_SET_LOCALE", locale });
  }
}
