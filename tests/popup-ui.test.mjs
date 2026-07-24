import assert from "node:assert/strict";
import test from "node:test";
import { formatCoverageStatus } from "../entrypoints/popup/RebuildCoverage.tsx";
import { buildCompactPopupPath, openCompactActionPopup } from "../src/shared/compact-popup.ts";
import { isSmartCaptureProgressNotice } from "../src/shared/workspace-notice.ts";
import { formatCaptureReadiness, getCaptureReadiness } from "../src/smart-capture/readiness.ts";

test("popup coverage labels do not present unavailable evidence as complete", () => {
  assert.equal(formatCoverageStatus("complete", "zh"), "完整");
  assert.equal(formatCoverageStatus("partial", "zh"), "部分");
  assert.equal(formatCoverageStatus("missing", "zh"), "缺失");
  assert.equal(formatCoverageStatus("not-applicable", "zh"), "不适用");
  assert.equal(formatCoverageStatus("unauthorized", "zh"), "未授权");
  assert.equal(formatCoverageStatus("failed", "zh"), "失败");
  assert.equal(formatCoverageStatus("future-status", "zh"), "未知");
  assert.equal(formatCoverageStatus("not-applicable", "en"), "Not applicable");
});

test("compact view opens the native action popup and restores Side Panel routing", async () => {
  const calls = [];
  const previousBrowser = globalThis.browser;
  globalThis.browser = {
    action: {
      async setPopup(details) { calls.push(["setPopup", details]); },
      async openPopup() { calls.push(["openPopup"]); }
    }
  };

  try {
    assert.equal(buildCompactPopupPath(42), "popup.html?targetTabId=42");
    await openCompactActionPopup(42);
    assert.deepEqual(calls, [
      ["setPopup", { tabId: 42, popup: "popup.html?targetTabId=42" }],
      ["openPopup"],
      ["setPopup", { tabId: 42, popup: "" }]
    ]);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test("compact popup routing is restored when native popup opening fails", async () => {
  const calls = [];
  const previousBrowser = globalThis.browser;
  globalThis.browser = {
    action: {
      async setPopup(details) { calls.push(details); },
      async openPopup() { throw new Error("not available"); }
    }
  };

  try {
    await assert.rejects(() => openCompactActionPopup(7), /not available/);
    assert.deepEqual(calls.at(-1), { tabId: 7, popup: "" });
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test("only transient Smart Capture progress notices auto-dismiss", () => {
  assert.equal(isSmartCaptureProgressNotice("智能捕获进行中"), true);
  assert.equal(isSmartCaptureProgressNotice("Smart Capture in progress"), true);
  assert.equal(isSmartCaptureProgressNotice("正在启动智能捕获..."), true);
  assert.equal(isSmartCaptureProgressNotice("捕获已停止"), false);
  assert.equal(isSmartCaptureProgressNotice("AI 配置已保存"), false);
});

test("user-facing readiness separates usable references, rebuild drafts, and capture gaps", () => {
  const reference = readinessCapture();
  assert.equal(getCaptureReadiness(reference), "reference-ready");
  assert.equal(formatCaptureReadiness("reference-ready", "zh").title, "可直接参照");

  const rebuild = readinessCapture();
  rebuild.smartCapture.mode = "rebuild";
  rebuild.rebuildEvidence = {
    version: 1,
    recordingId: "ready",
    storageProjectId: "ready",
    privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
    request: { viewports: ["desktop"], states: ["initial"] },
    scenes: [{ id: "initial", name: "Initial", phase: "recording-start", viewport: rebuild.viewport, scroll: { x: 0, y: 0 }, status: "captured", screenshotArtifactId: "baseline" }],
    artifacts: [],
    document: { width: 1440, height: 900, maxCapturedScrollY: 0, truncated: false },
    errors: []
  };
  assert.equal(getCaptureReadiness(rebuild), "rebuild-ready");

  rebuild.smartCapture.budget.safetyLevel = "stopped";
  assert.equal(getCaptureReadiness(rebuild), "needs-capture");
  assert.equal(formatCaptureReadiness("needs-capture", "en").title, "Needs capture");
});

function readinessCapture() {
  return {
    scope: "page",
    page: { title: "Ready", url: "https://example.test", capturedAt: new Date().toISOString() },
    viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
    tokens: { cssVariables: [], colors: [{ value: "#fff", count: 1, sampleSelectors: ["body"] }], backgrounds: [], spacing: [], radii: [], shadows: [], typography: [] },
    layout: [],
    layoutProfile: { density: "balanced", composition: "page", dominantDisplays: [], dominantGaps: [], alignment: [], structure: [], cadence: [], emphasis: [] },
    components: [{ id: "hero", name: "Hero", selector: "main", tagName: "main", confidence: 1, textSample: "", layout: { display: "block", position: "static", width: 1200, height: 700, gap: "0px", gridTemplateColumns: "none", flexDirection: "row", alignItems: "normal", justifyContent: "normal" }, visual: { color: "#000", backgroundColor: "#fff", font: "16px sans-serif", borderRadius: "0px", boxShadow: "none", border: "none" } }],
    motion: [], interactions: [], evidence: [], analysis: { character: "", tags: [], recommendations: [] },
    smartCapture: { version: 1, mode: "reference", outcome: "complete", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationMs: 100, passiveObservationMs: 0, preflight: { domNodes: 1, scannedNodes: 1, truncated: false, interactiveCandidates: 0, semanticCandidates: 1, canvasElements: 0, iframeElements: 0, animatedElements: 0, documentHeight: 900, viewportHeight: 900 }, budget: { degraded: false, safetyLevel: "normal", reasons: [], longTaskCount: 0, maxLongTaskMs: 0, mutationCount: 0, mutationStorm: false }, tasks: [] }
  };
}
