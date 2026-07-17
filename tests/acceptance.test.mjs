import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import {
  buildAcceptancePlan,
  buildAgentFixContext,
  compareGeometry,
  finalizeAcceptanceReport,
  renderAcceptanceReportHtml
} from "../src/capture-v2/validation/acceptance.ts";
import { comparePng } from "../scripts/lib/visual-diff.mjs";
import { buildDynamicAnimationSelectors, buildTransientEdgeMask, intersectsViewport, isBoundedDynamicMask } from "../scripts/lib/verification-policy.mjs";

function projectFixture() {
  return {
    source: { title: "Reference", url: "https://reference.test", scope: "page", capturedAt: "2026-07-15T00:00:00.000Z" },
    scenes: [
      { id: "desktop-initial", name: "Desktop initial", viewport: { width: 100, height: 80, deviceScaleFactor: 1 }, triggers: [{ kind: "initial" }], scroll: { x: 0, y: 0 }, capture: { fullPage: false, maskNodeIds: [] }, screenshotArtifactId: "shot", status: "captured" }
    ]
  };
}

test("acceptance plan is runnable only with real screenshot baselines and keeps missing scenes explicit", () => {
  const project = projectFixture();
  const plan = buildAcceptancePlan(project, [
    { id: "requested-desktop-initial", viewport: "desktop", state: "initial", status: "captured" },
    { id: "requested-mobile-initial", viewport: "mobile", state: "initial", status: "planned" },
    { id: "requested-mobile-scroll", viewport: "mobile", state: "scroll", status: "not-applicable" }
  ]);
  assert.equal(plan.status, "not-run");
  assert.equal(plan.runnable, true);
  assert.equal(plan.baseline.capturedSceneCount, 1);
  assert.equal(plan.baseline.requestedSceneCount, 2);
  assert.equal(plan.baseline.missingSceneCount, 1);
  assert.equal(plan.baseline.capturedMotionCheckpointCount, 0);
  assert.match(plan.runner.command, /verify:rebuild/);

  const blocked = buildAcceptancePlan({ ...project, scenes: [] }, []);
  assert.equal(blocked.runnable, false);
  assert.match(blocked.blockers.join(" "), /No captured screenshot/);
});

test("geometry comparison reports exact deltas and missing candidates", () => {
  const expected = { x: 10, y: 20, width: 300, height: 120 };
  const passing = compareGeometry("hero", ".hero", expected, { x: 12, y: 18, width: 303, height: 121 }, 4);
  assert.equal(passing.passed, true);
  assert.equal(passing.maxDelta, 3);
  const failing = compareGeometry("hero", ".hero", expected, undefined, 4);
  assert.equal(failing.passed, false);
  assert.equal(failing.maxDelta, Number.POSITIVE_INFINITY);
});

test("acceptance report cannot pass while requested baselines are missing", () => {
  const project = projectFixture();
  const plan = buildAcceptancePlan(project, [
    { id: "desktop", viewport: "desktop", state: "initial", status: "captured" },
    { id: "mobile", viewport: "mobile", state: "initial", status: "planned" }
  ]);
  const report = finalizeAcceptanceReport({
    project,
    candidateUrl: "http://candidate.test/?value=<unsafe>",
    plan,
    generatedAt: "2026-07-15T01:00:00.000Z",
    scenes: [{
      id: "desktop-initial",
      name: "Desktop initial",
      status: "passed",
      viewport: { width: 100, height: 80, deviceScaleFactor: 1 },
      maskedRegionCount: 0,
      browserErrors: [],
      pixel: { dimensionsMatch: true, mismatchPixels: 0, mismatchRatio: 0, threshold: 0.03, passed: true },
      geometry: { checked: 1, failed: 0, toleranceCssPx: 4, passed: true, items: [] }
    }]
  });
  assert.equal(report.status, "incomplete");
  assert.equal(report.summary.stateCoverage, 0.5);
  assert.match(buildAgentFixContext(report), /State coverage: 50\.0%/);
  const html = renderAcceptanceReportHtml(report);
  assert.equal(html.includes("<unsafe>"), false);
  assert.match(html, /&lt;unsafe&gt;/);
});

test("state coverage is based on requested states rather than duplicate baseline segments", () => {
  const project = { ...projectFixture(), scenes: [
    ...projectFixture().scenes,
    { ...projectFixture().scenes[0], id: "desktop-scroll-one" },
    { ...projectFixture().scenes[0], id: "desktop-scroll-two" }
  ] };
  const plan = buildAcceptancePlan(project, [
    { id: "desktop-initial", viewport: "desktop", state: "initial", status: "captured" },
    { id: "desktop-scroll", viewport: "desktop", state: "scroll", status: "captured" },
    { id: "mobile-initial", viewport: "mobile", state: "initial", status: "planned" }
  ]);
  const common = { name: "Scene", status: "passed", viewport: { width: 100, height: 80, deviceScaleFactor: 1 }, maskedRegionCount: 0, browserErrors: [] };
  const report = finalizeAcceptanceReport({
    project,
    candidateUrl: "http://candidate.test/",
    plan,
    scenes: [
      { ...common, id: "desktop-initial" },
      { ...common, id: "desktop-scroll-one" },
      { ...common, id: "desktop-scroll-two" }
    ]
  });
  assert.equal(report.summary.stateCoverage, 0.6667);
});

test("motion checkpoints fail independently without inflating state coverage", () => {
  const project = { ...projectFixture(), animations: [], motionCheckpoints: [] };
  const plan = buildAcceptancePlan(project, [{ id: "desktop", viewport: "desktop", state: "initial", status: "captured" }]);
  const common = { viewport: { width: 100, height: 80, deviceScaleFactor: 1 }, maskedRegionCount: 0, browserErrors: [] };
  const report = finalizeAcceptanceReport({
    project,
    candidateUrl: "http://candidate.test/",
    plan,
    scenes: [
      { ...common, id: "desktop-initial", name: "Desktop", kind: "scene", status: "passed" },
      { ...common, id: "desktop-motion-50", name: "Desktop motion", kind: "motion-checkpoint", checkpointProgress: 0.5, status: "failed", pixel: { dimensionsMatch: true, mismatchPixels: 20, mismatchRatio: 0.1, threshold: 0.03, passed: false } }
    ]
  });
  assert.equal(report.status, "failed");
  assert.equal(report.summary.stateCoverage, 1);
  assert.equal(report.summary.motionCheckpoints, 1);
  assert.equal(report.summary.failedMotionCheckpoints, 1);
});

test("animation evidence without checkpoint baselines remains incomplete", () => {
  const project = { ...projectFixture(), animations: [{ id: "animation-1" }], motionCheckpoints: [] };
  const plan = buildAcceptancePlan(project, [{ id: "desktop", viewport: "desktop", state: "initial", status: "captured" }]);
  const report = finalizeAcceptanceReport({
    project,
    candidateUrl: "http://candidate.test/",
    plan,
    scenes: [{ id: "desktop-initial", name: "Desktop", kind: "scene", status: "passed", viewport: { width: 100, height: 80, deviceScaleFactor: 1 }, maskedRegionCount: 0, browserErrors: [] }]
  });
  assert.equal(plan.baseline.motionVerificationRequired, true);
  assert.equal(report.status, "incomplete");
  assert.equal(report.summary.missingMotionCheckpointBaseline, true);
});

test("Canvas evidence is reported independently from state coverage", () => {
  const project = {
    ...projectFixture(),
    policy: { captureCanvas: true },
    canvasFrames: [{ id: "canvas-1", sceneId: "desktop-initial", selector: "canvas", index: 0, width: 100, height: 80, cssWidth: 100, cssHeight: 80, status: "readable", artifactId: "canvas-artifact" }]
  };
  const plan = buildAcceptancePlan(project, [{ id: "desktop", viewport: "desktop", state: "initial", status: "captured" }]);
  const common = { viewport: { width: 100, height: 80, deviceScaleFactor: 1 }, maskedRegionCount: 0, browserErrors: [] };
  const report = finalizeAcceptanceReport({
    project,
    candidateUrl: "http://candidate.test/",
    plan,
    scenes: [
      { ...common, id: "desktop-initial", name: "Desktop", kind: "scene", status: "passed" },
      { ...common, id: "canvas-1", name: "Canvas", kind: "canvas-frame", status: "failed", pixel: { dimensionsMatch: true, mismatchPixels: 40, mismatchRatio: 0.2, threshold: 0.03, passed: false } }
    ]
  });
  assert.equal(plan.baseline.capturedCanvasFrameCount, 1);
  assert.equal(report.status, "failed");
  assert.equal(report.summary.stateCoverage, 1);
  assert.equal(report.summary.canvasFrames, 1);
  assert.equal(report.summary.failedCanvasFrames, 1);
});

test("pixel comparison detects differences and honors dynamic masks", () => {
  const reference = solidPng(4, 4, [255, 255, 255, 255]);
  const candidateImage = new PNG({ width: 4, height: 4 });
  candidateImage.data.fill(255);
  candidateImage.data[0] = 0;
  candidateImage.data[1] = 0;
  candidateImage.data[2] = 0;
  const candidate = PNG.sync.write(candidateImage);

  const raw = comparePng(reference, candidate);
  assert.equal(raw.dimensionsMatch, true);
  assert.equal(raw.mismatchPixels, 1);
  assert.deepEqual(raw.hotspot, { x: 0, y: 0, width: 1, height: 1 });
  assert.ok(raw.diffBytes);

  const masked = comparePng(reference, candidate, { maskRects: [{ x: 0, y: 0, width: 1, height: 1 }] });
  assert.equal(masked.mismatchPixels, 0);
  assert.equal(masked.hotspot, undefined);
});

test("verification policy masks only bounded unverified animation regions", () => {
  const project = {
    animations: [
      { selector: ".slow", durationMs: 1000 },
      { selector: ".slow", durationMs: 1000 },
      { selector: ".quick", durationMs: 200 },
      { selector: ".verified", durationMs: 800 }
    ],
    motionCheckpoints: [{ status: "captured", animations: [{ selector: ".verified" }] }]
  };
  assert.deepEqual(buildDynamicAnimationSelectors(project), [".slow"]);
  const viewport = { width: 1000, height: 800 };
  assert.equal(intersectsViewport({ x: 20, y: 20, width: 100, height: 100 }, viewport), true);
  assert.equal(intersectsViewport({ x: 20, y: 900, width: 100, height: 100 }, viewport), false);
  assert.equal(isBoundedDynamicMask({ x: 0, y: 0, width: 400, height: 400 }, viewport), true);
  assert.equal(isBoundedDynamicMask({ x: 0, y: 0, width: 1000, height: 800 }, viewport), false);
  assert.deepEqual(buildTransientEdgeMask({ id: "page-baseline-2", viewport }), { x: 0, y: 560, width: 1000, height: 240 });
  assert.equal(buildTransientEdgeMask({ id: "cdp-desktop-initial", viewport }), undefined);
});

function solidPng(width, height, rgba) {
  const image = new PNG({ width, height });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = rgba[0];
    image.data[offset + 1] = rgba[1];
    image.data[offset + 2] = rgba[2];
    image.data[offset + 3] = rgba[3];
  }
  return PNG.sync.write(image);
}
