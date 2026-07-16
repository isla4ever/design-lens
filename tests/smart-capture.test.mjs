import assert from "node:assert/strict";
import test from "node:test";
import { planSupplementalTasks } from "../src/smart-capture/coverage-planner.ts";
import { getRecorderGapBreakdown, mergeSupplementalTasks, planRecorderSupplementalTasks } from "../src/smart-capture/recorder-gap-planner.ts";

function captureFixture() {
  return {
    scope: "page",
    page: { title: "Smart Capture", url: "https://example.test", capturedAt: "2026-07-16T00:00:00.000Z" },
    viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
    tokens: { cssVariables: [], colors: [], backgrounds: [], spacing: [], radii: [], shadows: [], typography: [] },
    layout: [],
    layoutProfile: { density: "balanced", composition: "page", dominantDisplays: [], dominantGaps: [], alignment: [], structure: [], cadence: [], emphasis: [] },
    components: [],
    motion: [],
    interactions: [],
    evidence: [],
    analysis: { character: "", tags: [], recommendations: [] }
  };
}

const preflight = {
  domNodes: 1200,
  scannedNodes: 1200,
  truncated: false,
  interactiveCandidates: 18,
  semanticCandidates: 12,
  canvasElements: 2,
  iframeElements: 0,
  animatedElements: 3,
  documentHeight: 3200,
  viewportHeight: 900
};

test("Smart Capture planner returns at most three actionable tasks without inventing evidence", () => {
  const capture = captureFixture();
  const tasks = planSupplementalTasks(capture, preflight, {
    viewports: ["desktop", "mobile"],
    states: ["initial", "scroll", "hover", "focus", "open"],
    assetPolicy: "manifest-only",
    captureCanvas: false,
    authorizationConfirmed: true
  });

  assert.equal(tasks.length, 3);
  assert.equal(tasks.some((task) => task.kind === "capture-responsive"), true);
  assert.equal(tasks.some((task) => task.kind === "capture-state"), true);
  assert.equal(tasks.every((task) => task.priority === "high" || task.priority === "medium"), true);
});

test("Smart Capture planner reports no interaction gap when passive evidence exists", () => {
  const capture = captureFixture();
  capture.components = [{ id: "one" }, { id: "two" }, { id: "three" }];
  capture.interactionTimeline = {
    durationMs: 1000,
    pointerSamples: [],
    scrollSamples: [{ t: 100, x: 0, y: 500, deltaY: 500, velocity: 300 }],
    frameSamples: [],
    patterns: [],
    metrics: { maxPointerSpeed: 0, averagePointerSpeed: 0, pointerTravel: 0, maxScrollY: 500, changedFrameRatio: 0, mediaStateCount: 0, darkFrameRatio: 0, lightFrameRatio: 1 }
  };
  const tasks = planSupplementalTasks(capture, preflight);
  assert.equal(tasks.some((task) => task.kind === "record-interactions"), false);
});

function recorderFlow(scenes) {
  return {
    version: 1,
    id: "recorder-test",
    title: "Recorder test",
    source: "chrome-devtools-recorder",
    importedAt: "2026-07-16T00:00:00.000Z",
    totalStepCount: scenes.length,
    supportedStepCount: scenes.length,
    redactedStepCount: 0,
    ignoredStepCount: 0,
    routeCount: 1,
    origins: ["https://example.test"],
    warnings: [],
    scenes: scenes.map((scene, index) => ({
      id: `scene-${index + 1}`,
      stepIndex: index,
      name: scene.trigger.kind,
      viewport: scene.viewport ?? { width: 1280, height: 720, deviceScaleFactor: 1 },
      trigger: scene.trigger,
      status: "planned",
      requiresEvidence: true
    }))
  };
}

function recorderMatch(flow, statuses) {
  const scenes = flow.scenes.map((scene, index) => ({
    sceneId: scene.id,
    status: statuses[index],
    confidence: statuses[index] === "matched" ? 1 : statuses[index] === "partial" ? 0.45 : 0,
    evidenceSceneIds: [],
    reason: "test"
  }));
  return {
    version: 1,
    flowId: flow.id,
    matchedAt: "2026-07-16T00:01:00.000Z",
    counts: {
      matched: statuses.filter((status) => status === "matched").length,
      partial: statuses.filter((status) => status === "partial").length,
      missing: statuses.filter((status) => status === "missing").length
    },
    scenes
  };
}

test("Recorder planner ignores matched scenes and ranks missing screenshots above partial clues", () => {
  const flow = recorderFlow([
    { trigger: { kind: "initial" } },
    { trigger: { kind: "wait", selector: ".dialog" } },
    { trigger: { kind: "hover", selector: ".menu" } }
  ]);
  const tasks = planRecorderSupplementalTasks(flow, recorderMatch(flow, ["matched", "partial", "missing"]));

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].trigger, "hover");
  assert.equal(tasks[0].priority, "high");
  assert.equal(tasks[1].trigger, "wait");
  assert.equal(tasks[1].priority, "medium");
  assert.equal(tasks.some((task) => task.trigger === "initial"), false);
});

test("Recorder planner merges equivalent gaps but keeps desktop and mobile tasks separate", () => {
  const flow = recorderFlow([
    { trigger: { kind: "hover", selector: ".menu  button" } },
    { trigger: { kind: "hover", selector: ".menu button" } },
    { viewport: { width: 390, height: 844, deviceScaleFactor: 3 }, trigger: { kind: "hover", selector: ".menu button" } }
  ]);
  const tasks = planRecorderSupplementalTasks(flow, recorderMatch(flow, ["missing", "missing", "missing"]));

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => task.viewport).sort(), ["desktop", "mobile"]);
  assert.equal(tasks.find((task) => task.viewport === "desktop").sourceSceneIds.length, 2);
});

test("Recorder scroll tasks preserve the requested position for guided capture", () => {
  const flow = recorderFlow([{ trigger: { kind: "scroll", value: 720 } }]);
  const [task] = planRecorderSupplementalTasks(flow, recorderMatch(flow, ["missing"]));
  assert.equal(task.targetScrollY, 720);
});

test("Recorder planner uses guided capture when click or wait targets have no selector", () => {
  const flow = recorderFlow([
    { trigger: { kind: "click" } },
    { trigger: { kind: "wait" } },
    { trigger: { kind: "hover" } }
  ]);
  const tasks = planRecorderSupplementalTasks(flow, recorderMatch(flow, ["missing", "partial", "missing"]));

  assert.equal(tasks.find((task) => task.trigger === "click").kind, "record-interactions");
  assert.equal(tasks.find((task) => task.trigger === "wait").kind, "record-interactions");
  assert.equal(tasks.find((task) => task.trigger === "hover").kind, "capture-component");
});

test("Recorder gap breakdown explains target, viewport, and screenshot blockers without exposing scenes", () => {
  const flow = recorderFlow([
    { trigger: { kind: "hover" } },
    { viewport: { width: 390, height: 844, deviceScaleFactor: 3 }, trigger: { kind: "initial" } },
    { trigger: { kind: "wait", selector: ".dialog" } },
    { trigger: { kind: "scroll", value: 600 } }
  ]);
  const breakdown = getRecorderGapBreakdown(flow, recorderMatch(flow, ["missing", "missing", "partial", "matched"]));
  assert.deepEqual(breakdown, { total: 3, needsTarget: 1, needsViewportBaseline: 1, needsStateScreenshot: 1 });
});

test("merged supplemental task queue never exceeds three tasks", () => {
  const tasks = mergeSupplementalTasks(Array.from({ length: 6 }, (_, index) => ({
    id: `task-${index}`,
    kind: "capture-state",
    priority: index < 4 ? "high" : "medium",
    state: index % 2 ? "hover" : "open",
    trigger: index % 2 ? "hover" : "click",
    viewport: index % 3 ? "desktop" : "mobile",
    selector: `.target-${index}`,
    reason: "test"
  })));
  assert.equal(tasks.length, 3);
  assert.equal(tasks.every((task) => task.priority === "high"), true);
});

test("specific Recorder tasks subsume equivalent generic Smart Capture tasks", () => {
  const tasks = mergeSupplementalTasks([
    { id: "generic-hover", kind: "capture-state", priority: "high", state: "hover", reason: "generic" },
    { id: "recorder-hover", kind: "capture-state", priority: "high", source: "recorder-flow", trigger: "hover", state: "hover", viewport: "desktop", selector: ".account-menu", reason: "specific" }
  ]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "recorder-hover");
});
