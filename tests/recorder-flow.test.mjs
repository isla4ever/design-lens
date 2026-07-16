import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { compileImportedRecorderFlow, matchImportedRecorderFlowPlan, MAX_RECORDER_FLOW_STEPS } from "../src/capture-v2/core/imported-recorder-flow.ts";
import { planRecorderSupplementalTasks } from "../src/smart-capture/recorder-gap-planner.ts";
import { CaptureProjectStore } from "../src/storage/capture-project-store.ts";

const flowFixture = () => ({
  title: "Checkout exploration",
  steps: [
    { type: "setViewport", width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true },
    { type: "navigate", url: "https://user:pass@example.test/checkout?token=secret#private" },
    { type: "scroll", x: 0, y: 640 },
    { type: "hover", selectors: ["aria/Account menu"] },
    { type: "click", selectors: [["main", ".checkout-button"]], offsetX: 12, offsetY: 10 },
    { type: "change", selectors: ["#email"], value: "private@example.test" },
    { type: "waitForElement", selectors: [".confirmation"], count: 1, operator: ">=", visible: true },
    { type: "waitForExpression", expression: "window.secretToken === 'private'" },
    { type: "customStep", name: "private payload", parameters: { token: "do-not-store" } }
  ]
});

function captureFixture() {
  return {
    scope: "page",
    page: { title: "Recorder fixture", url: "https://example.test/checkout", capturedAt: "2026-07-16T10:00:00.000Z" },
    viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
    tokens: { cssVariables: [], colors: [], backgrounds: [], spacing: [], radii: [], shadows: [], typography: [] },
    layout: [],
    layoutProfile: { density: "balanced", composition: "single page", dominantDisplays: [], dominantGaps: [], alignment: [], structure: [], cadence: [], emphasis: [] },
    components: [], motion: [], interactions: [], evidence: [], analysis: { character: "structured", tags: [], recommendations: [] }
  };
}

test("Recorder import compiles a redacted plan without executable or typed values", () => {
  const plan = compileImportedRecorderFlow(flowFixture(), { importedAt: "2026-07-16T10:01:00.000Z" });
  const serialized = JSON.stringify(plan);

  assert.equal(plan.totalStepCount, 9);
  assert.equal(plan.scenes.length, 5);
  assert.equal(plan.redactedStepCount, 1);
  assert.equal(plan.ignoredStepCount, 2);
  assert.equal(plan.origins[0], "https://example.test");
  assert.equal(plan.scenes[0].url, "https://example.test/checkout");
  assert.equal(plan.scenes.find((scene) => scene.trigger.kind === "click").trigger.selector, ".checkout-button");
  assert.equal(plan.warnings.includes("non-css-selectors-omitted"), true);
  assert.equal(plan.warnings.includes("sensitive-input-redacted"), true);
  assert.equal(plan.warnings.includes("unsafe-steps-omitted"), true);
  assert.equal(serialized.includes("private@example.test"), false);
  assert.equal(serialized.includes("window.secretToken"), false);
  assert.equal(serialized.includes("do-not-store"), false);
  assert.equal(serialized.includes("token=secret"), false);
  assert.equal(serialized.includes("user:pass"), false);
});

test("Recorder import rejects excessive steps and unsupported viewport dimensions", () => {
  assert.throws(() => compileImportedRecorderFlow({ title: "Too large", steps: Array.from({ length: MAX_RECORDER_FLOW_STEPS + 1 }, () => ({ type: "scroll", y: 0 })) }), /step limit/);
  assert.throws(() => compileImportedRecorderFlow({ title: "Bad viewport", steps: [{ type: "setViewport", width: 10, height: 10, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: false }] }), /viewport/);
});

test("Recorder evidence matching requires corresponding screenshot scenes", () => {
  const plan = compileImportedRecorderFlow(flowFixture());
  const capture = captureFixture();
  capture.interactions = [
    { id: "checkout", selector: ".checkout-button", trigger: "click", affordance: "button", cursor: "pointer", role: "button", stateSignals: [], transitionProperties: [] },
    { id: "confirmation", selector: ".confirmation", trigger: "state", affordance: "status", cursor: "default", role: "status", stateSignals: [], transitionProperties: [] }
  ];
  capture.rebuildEvidence = {
    version: 1,
    recordingId: "recorder-match",
    storageProjectId: "recorder-match",
    privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
    request: { viewports: ["desktop"], states: ["initial", "scroll", "open"] },
    scenes: [
      { id: "start", name: "Start", phase: "recording-start", viewport: { width: 1280, height: 720, devicePixelRatio: 1 }, scroll: { x: 0, y: 0 }, screenshotArtifactId: "shot-start", status: "captured" },
      { id: "scroll", name: "Scroll", phase: "responsive-scroll", viewport: { width: 1280, height: 720, devicePixelRatio: 1 }, scroll: { x: 0, y: 640 }, screenshotArtifactId: "shot-scroll", status: "captured" },
      { id: "open", name: "Open", phase: "observed-open", viewport: { width: 1280, height: 720, devicePixelRatio: 1 }, scroll: { x: 0, y: 0 }, selector: ".checkout-button", screenshotArtifactId: "shot-open", status: "captured" }
    ],
    artifacts: [],
    document: { width: 1280, height: 1800, maxCapturedScrollY: 640, truncated: false },
    errors: []
  };
  const match = matchImportedRecorderFlowPlan(plan, capture, "2026-07-16T10:02:00.000Z");
  assert.deepEqual(match.counts, { matched: 3, partial: 1, missing: 1 });
  assert.equal(match.scenes.find((scene) => scene.sceneId.endsWith("click")).status, "matched");
  assert.equal(match.scenes.find((scene) => scene.sceneId.endsWith("wait")).status, "partial");
  assert.equal(match.scenes.find((scene) => scene.sceneId.endsWith("hover")).status, "missing");
});

test("workspace records persist, preserve, and clear an imported Recorder plan", async () => {
  const store = new CaptureProjectStore(`design-lens-recorder-${Date.now()}-${Math.random()}`);
  const capture = captureFixture();
  capture.rebuildEvidence = {
    version: 1,
    recordingId: "recorder-workspace",
    storageProjectId: "recorder-workspace",
    privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
    request: { viewports: ["desktop"], states: ["initial", "hover"] },
    scenes: [],
    artifacts: [],
    document: { width: 1280, height: 1800, maxCapturedScrollY: 0, truncated: false },
    errors: []
  };
  const plan = compileImportedRecorderFlow(flowFixture());
  try {
    const record = await store.putWorkspaceCapture(7, capture);
    const withFlow = await store.setWorkspaceRecorderFlow(record.id, plan);
    assert.equal(withFlow.recorderFlow.id, plan.id);
    assert.equal(withFlow.recorderFlowMatch.flowId, plan.id);
    assert.equal(planRecorderSupplementalTasks(withFlow.recorderFlow, withFlow.recorderFlowMatch).some((task) => task.kind === "capture-component"), true);
    const match = matchImportedRecorderFlowPlan(plan, capture, capture.page.capturedAt);
    const withMatch = await store.setWorkspaceRecorderFlowMatch(record.id, match);
    assert.equal(withMatch.recorderFlowMatch.flowId, plan.id);

    const hoverScene = plan.scenes.find((scene) => scene.trigger.kind === "hover");
    const resolved = await store.resolveWorkspaceRecorderTarget(record.id, hoverScene.id, ".account-menu");
    assert.equal(resolved.recorderFlow.scenes.find((scene) => scene.id === hoverScene.id).trigger.selector, ".account-menu");

    const updatedCapture = structuredClone(capture);
    updatedCapture.page.capturedAt = "2026-07-16T10:05:00.000Z";
    updatedCapture.analysis.character = "updated after Smart Capture";
    updatedCapture.rebuildEvidence.scenes = [{
      id: "hover-account",
      name: "Account hover",
      phase: "observed-hover",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      scroll: { x: 0, y: 0 },
      selector: ".account-menu",
      screenshotArtifactId: "shot-hover-account",
      status: "captured"
    }];
    const updated = await store.putWorkspaceCapture(7, updatedCapture);
    assert.equal(updated.recorderFlow.id, plan.id);
    assert.equal(updated.capture.analysis.character, "updated after Smart Capture");
    assert.equal(updated.recorderFlowMatch.scenes.find((scene) => scene.sceneId === hoverScene.id).status, "matched");
    assert.equal(planRecorderSupplementalTasks(updated.recorderFlow, updated.recorderFlowMatch).some((task) => task.trigger === "hover"), false);

    const cleared = await store.setWorkspaceRecorderFlow(updated.id, null);
    assert.equal(cleared.recorderFlow, undefined);
    assert.equal(cleared.recorderFlowMatch, undefined);
  } finally {
    await store.destroy();
  }
});
