import { defineContentScript } from "wxt/utils/define-content-script";
import { capturePageDesign } from "../src/analyzer/capture/capture-page";
import { createElementPicker } from "../src/analyzer/capture/element-picker";
import { createPageOverlay } from "../src/overlay/page-overlay";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "../src/shared/i18n";
import { getStoredLocale } from "../src/shared/locale-storage";
import type { CaptureRequest, CaptureResponse, ContentScriptResponse, WorkspaceResponse } from "../src/shared/messages";

export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  runAt: "document_idle",
  main() {
    const contentScope = globalThis as typeof globalThis & { __designLensPageBridgeInstalled?: boolean };
    if (contentScope.__designLensPageBridgeInstalled) return;
    contentScope.__designLensPageBridgeInstalled = true;

    let locale: Locale = DEFAULT_LOCALE;
    void getStoredLocale().then((storedLocale) => {
      locale = storedLocale;
    });

    const picker = createElementPicker(() => locale);
    const overlay = createPageOverlay({
      scanPage: () => capturePageDesign(document, window, document.body, locale),
      pickElement: () => picker.start(),
      captureCompleted: async (capture) => {
        const response = await browser.runtime.sendMessage({ type: "DESIGN_LENS_STORE_WORKSPACE_CAPTURE", capture }) as WorkspaceResponse;
        if (!response.ok) throw new Error(response.error);
      }
    });

    browser.runtime.onMessage.addListener(
      (message: CaptureRequest, _sender, sendResponse: (response: ContentScriptResponse) => void) => {
        if (message.type === "DESIGN_LENS_CAPTURE_PAGE") {
          capturePageDesign(document, window, document.body, locale).then(sendResponse).catch((error) => {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_PICK_ELEMENT") {
          picker.start().then(sendResponse).catch((error) => {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_CAPTURE_HOVER") {
          picker.captureHovered().then(sendResponse).catch((error) => {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_RECORD_START") {
          locale = normalizeLocale(message.locale ?? locale);
          overlay.beginRecord(locale, message.mode, message.rebuild).then(() => {
            const status = overlay.getRecordStatus();
            sendResponse({ ok: true, isRecording: status.isRecording, capture: status.capture });
          }).catch((error) => {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_RECORD_STOP") {
          locale = normalizeLocale(message.locale ?? locale);
          overlay.finishRecord().then((capture) => {
            sendResponse({ ok: true, isRecording: false, capture });
          }).catch((error) => {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_RECORD_STATUS") {
          locale = normalizeLocale(message.locale ?? locale);
          const status = overlay.getRecordStatus();
          sendResponse({ ok: true, isRecording: status.isRecording, capture: status.capture, smartCapture: status.smartCapture });
          return false;
        }

        if (message.type === "DESIGN_LENS_SMART_CAPTURE_START") {
          locale = normalizeLocale(message.locale ?? locale);
          overlay.beginSmartCapture(locale, message.mode, message.rebuild).then(() => {
            const status = overlay.getRecordStatus();
            sendResponse({ ok: true, isRecording: status.isRecording, capture: status.capture, smartCapture: status.smartCapture });
          }).catch((error) => {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_TOGGLE_OVERLAY") {
          locale = normalizeLocale(message.locale ?? locale);
          overlay.toggle(locale);
          sendResponse({ ok: true, capture: overlay.getLastCapture() ?? overlay.getEmptyCapture() });
          return false;
        }

        if (message.type === "DESIGN_LENS_OPEN_AND_SCAN") {
          locale = normalizeLocale(message.locale ?? locale);
          overlay.openAndRun("scan", locale, message.scanMode ?? "instant").then(() => {
            sendResponse({ ok: true, capture: overlay.getLastCapture() ?? overlay.getEmptyCapture() });
          }).catch((error) => {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_OPEN_RECORDER") {
          locale = normalizeLocale(message.locale ?? locale);
          overlay.openRecorder(locale, message.mode, message.rebuild, message.guidedTask).then(() => {
            const status = overlay.getRecordStatus();
            sendResponse({ ok: true, isRecording: status.isRecording, capture: status.capture });
          }).catch((error) => {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
          });
          return true;
        }

        if (message.type === "DESIGN_LENS_OPEN_AND_PICK") {
          locale = normalizeLocale(message.locale ?? locale);
          void overlay.openAndRun("pick", locale, "instant", !message.recorderTarget).then(async (response) => {
            if (!message.recorderTarget || !response?.ok || !response.selectedSelector) return;
            const resolved = await browser.runtime.sendMessage({
              type: "DESIGN_LENS_RESOLVE_RECORDER_TARGET",
              id: message.recorderTarget.workspaceRecordId,
              sceneId: message.recorderTarget.sceneId,
              selector: response.selectedSelector
            }) as WorkspaceResponse;
            if (!resolved.ok) throw new Error(resolved.error);
          }).catch((error) => {
            console.warn("Design Lens component picker failed", error);
          });
          sendResponse({ ok: true, capture: overlay.getLastCapture() ?? overlay.getEmptyCapture() });
          return false;
        }

        if (message.type === "DESIGN_LENS_SET_LOCALE") {
          locale = normalizeLocale(message.locale);
          overlay.setLocale(locale);
          sendResponse({ ok: true, capture: overlay.getLastCapture() ?? overlay.getEmptyCapture() });
          return false;
        }

        if (message.type === "DESIGN_LENS_SET_THEME") {
          overlay.setTheme(message.theme);
          sendResponse({ ok: true, capture: overlay.getLastCapture() ?? overlay.getEmptyCapture() });
          return false;
        }

        if (message.type === "DESIGN_LENS_SET_CAPTURE_PRIVACY_MASK") {
          overlay.setCapturePrivacyMask(message.enabled);
          sendResponse({ ok: true });
          return false;
        }

        return false;
      }
    );
  }
});
