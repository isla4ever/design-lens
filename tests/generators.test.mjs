import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { buildAiAnalysisPayload, buildAiPrompt } from "../src/ai/context.ts";
import { extractResponseText } from "../src/ai/openai.ts";
import { AI_PROVIDER_PRESETS, applyProviderPreset, findProviderPreset } from "../src/ai/provider-presets.ts";
import { buildEvidencePack } from "../src/evidence/evidence-pack.ts";
import { generatePrototypeHtml } from "../src/generators/export/prototype.ts";
import { generateCompactSkillMarkdown, generateSkillMarkdown } from "../src/generators/skill/skill.ts";
import { formatInteractionTimeline } from "../src/generators/skill/skill-timeline-formatters.ts";
import { createDefaultAiSettingsState, getActiveAiProfile, upsertAiProfile } from "../src/shared/ai-settings.ts";
import { DEFAULT_DESIGN_BRIEF, normalizeDesignBrief, prepareDesignBriefForSession } from "../src/shared/design-brief.ts";
import { createZipBytes } from "../src/shared/zip.ts";
import { buildEvidenceOnlyPackFiles, buildRebuildDraftPackFiles, loadRebuildArtifactFiles } from "../entrypoints/popup/pack-builder.ts";
import { CaptureProjectStore } from "../src/storage/capture-project-store.ts";
import { captureProjectFromDesignCapture } from "../src/capture-v2/core/from-design-capture.ts";
import { compileImportedRecorderFlow, matchImportedRecorderFlowPlan } from "../src/capture-v2/core/imported-recorder-flow.ts";

const fixture = {
  scope: "component",
  page: { title: "Demo Page", url: "https://example.test", capturedAt: "2026-06-28T00:00:00.000Z" },
  viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
  tokens: {
    cssVariables: [],
    colors: [{ value: "#111713", count: 2, sampleSelectors: [".card"] }],
    backgrounds: [{ value: "#f5f2ea", count: 1, sampleSelectors: [".card"] }],
    spacing: [{ value: "16px", count: 3, sampleSelectors: [".card"] }],
    radii: [{ value: "14px", count: 2, sampleSelectors: [".card"] }],
    shadows: [],
    typography: [{ family: "Inter", size: "16px", weight: "700", lineHeight: "1.4", count: 2, sampleSelectors: [".card"] }]
  },
  layout: [{ display: "grid", position: "relative", width: 320, height: 180, gap: "16px", gridTemplateColumns: "1fr", flexDirection: "row", alignItems: "center", justifyContent: "start" }],
  layoutProfile: { density: "balanced", composition: "component block", dominantDisplays: ["grid"], dominantGaps: ["16px"], alignment: ["center"], structure: ["media card"], cadence: ["compact module"], emphasis: ["media"] },
  components: [{ id: "card", name: "Card", selector: ".card", tagName: "article", confidence: 90, textSample: "Demo", layout: { display: "grid", position: "relative", width: 320, height: 180, gap: "16px", gridTemplateColumns: "1fr", flexDirection: "row", alignItems: "center", justifyContent: "start" }, visual: { color: "#111713", backgroundColor: "#f5f2ea", font: "700 16px/1.4 Inter", borderRadius: "14px", boxShadow: "none", border: "1px solid #ddd" } }],
  motion: [],
  interactions: [],
  evidence: [],
  implementationTrace: {
    assets: [
      { kind: "script", url: "https://example.test/_next/static/chunks/app.js", label: "example.test/_next/static/chunks/app.js", origin: "same-origin", loading: ["defer"], signals: ["bundled-script", "javascript"] },
      { kind: "stylesheet", url: "https://cdn.example.test/style.css", label: "cdn.example.test/style.css", origin: "cdn", loading: ["stylesheet"], signals: ["style-system", "css"] }
    ],
    frameworkSignals: ["Next.js app/router assets"],
    librarySignals: ["GSAP timeline/animation", "PixiJS renderer/effects"],
    sourceMapHints: ["inline script 1 contains sourceMappingURL"],
    eventModelHints: ["12 interactive candidates", "CDP DOMDebugger.getEventListeners is required for exact listener function locations"],
    styleRuntimeHints: ["2 stylesheet objects", "1 active Web Animations at sample time"],
    networkHints: ["1 script assets", "1 stylesheet assets"]
  },
  interactionTimeline: {
    durationMs: 3200,
    pointerSamples: [{ t: 120, type: "move", x: 80, y: 120, targetSelector: ".card", speed: 720, phase: "work-grid", directionDeg: 18 }],
    focusSamples: [
      { t: 180, type: "in", targetSelector: ".card" },
      { t: 520, type: "out", targetSelector: ".card" }
    ],
    scrollSamples: [{ t: 600, x: 0, y: 420, deltaY: 420, velocity: 700 }],
    frameSamples: [{ t: 100, scrollY: 0, changedElements: 2, elements: [] }],
    runtimeAnimations: [{ t: 150, selector: ".card", name: "enter", source: "css-animation", playState: "running", currentTimeMs: 120, durationMs: 900, delayMs: 0, easing: "ease-out", iterationCount: "1", properties: ["opacity", "transform"], keyframeCount: 2 }],
    domMutations: [{ t: 300, selector: ".card", type: "attributes", attributeName: "class", className: "card active" }],
    visualSurfaces: [{ t: 400, selector: ".card img", tagName: "img", width: 800, height: 600, cssWidth: 320, cssHeight: 180, signal: "image-media", frameSignature: "image|complete" }],
    performanceEvents: [{ t: 450, type: "paint", name: "first-paint", startTime: 12, duration: 0 }],
    patterns: [{ kind: "media-liquid-distortion", confidence: 84, evidence: ["media target hovered"], implementationNotes: ["use localized displacement layer"] }],
    phases: [{ id: "work-grid", label: "media liquid hover stage", startMs: 100, endMs: 600, scrollRange: { min: 0, max: 420 }, dominantSurface: "light", activeSignals: ["media liquid distortion"], keySelectors: [".card"] }],
    metrics: { maxPointerSpeed: 720, averagePointerSpeed: 720, pointerTravel: 100, maxScrollY: 420, changedFrameRatio: 1, mediaStateCount: 1, darkFrameRatio: 0, lightFrameRatio: 1, runtimeAnimationCount: 1, mutationCount: 1, visualSurfaceStateCount: 1, performanceEventCount: 1, longTaskCount: 0, paintCount: 1 }
  },
  analysis: { character: "component reference", tags: ["balanced spacing rhythm"], recommendations: [] }
};

test("component captures generate component-oriented skills", () => {
  const output = generateSkillMarkdown(fixture, "zh");
  assert.match(output, /组件参考 Skill/);
  assert.match(output, /组件 API 建议/);
  assert.match(output, /技术路线选择/);
  assert.match(output, /实现链路证据/);
  assert.match(output, /Next\.js app\/router assets|GSAP timeline\/animation|PixiJS renderer/);
  assert.match(output, /技术栈矩阵/);
  assert.match(output, /PixiJS|Three\.js|GSAP/);
  assert.match(output, /Radix UI|shadcn\/ui|Headless UI|Rive|Lottie/);
  assert.match(output, /Product Design 插件协作/);
  assert.match(output, /skill\.md.*evidence\.json|evidence\.json.*skill\.md/);
});

test("compact skills stay short and point to merged evidence", () => {
  const full = generateSkillMarkdown(fixture, "zh");
  const compact = generateCompactSkillMarkdown(fixture, "zh");
  assert.match(compact, /evidence\.json/);
  assert.match(compact, /Product Design 插件协作/);
  assert.ok(compact.length < full.length);
  assert.equal(compact.includes("实现链路证据"), false);
});

test("prototype export creates standalone html", () => {
  const output = generatePrototypeHtml(fixture, "zh");
  assert.match(output, /<!doctype html>/i);
  assert.match(output, /Component prototype|组件原型/);
  assert.match(output, /motion-field/);
  assert.match(output, /media-lens/);
  assert.match(output, /media-hover/);
});

test("AI payload excludes raw DOM and keeps structured evidence", () => {
  const payload = buildAiAnalysisPayload(fixture, "zh");
  assert.equal(payload.task, "component-reference");
  assert.deepEqual(Object.keys(payload.capture.tokens).sort(), ["backgrounds", "colors", "radii", "shadows", "spacing", "typography"]);
  assert.ok(payload.capture.evidencePack.replayEvents.length > 2);
  assert.ok(payload.capture.evidencePack.replayEvents.some((event) => event.kind === "implementation"));
  assert.equal(payload.capture.evidenceMetrics.focusSamples, 2);
  assert.ok(payload.capture.implementation.some((item) => item.includes("Next.js")));
  assert.equal(payload.capture.evidencePack.prototypeRecipe.recommendedTemplate, "component-module");
  assert.equal(JSON.stringify(payload).includes("outerHTML"), false);
});

test("AI prompt compiler includes user build intent", () => {
  const payload = buildAiAnalysisPayload(fixture, "zh");
  const prompt = buildAiPrompt(payload, {
    ...DEFAULT_DESIGN_BRIEF,
    siteType: "个人技术博客",
    goal: "个人技术博客首页，借鉴液态媒体和大字舞台",
    borrow: ["visual", "motion", "media"],
    avoid: "不要像工作室官网",
    output: "homepage",
    stack: "html"
  });
  assert.match(prompt, /用户创作意图/);
  assert.match(prompt, /网站\/产品类型/);
  assert.match(prompt, /个人技术博客/);
  assert.match(prompt, /个人技术博客首页/);
  assert.match(prompt, /组件库、动画库、滚动库、媒体\/Canvas\/WebGL\/互动动画特效库路线|component, animation, scroll, media\/canvas\/WebGL, and interactive-animation library routes/);
  assert.match(prompt, /不要像工作室官网/);
  assert.equal(prompt.includes("outerHTML"), false);
});

test("evidence pack exposes replay events and recording gaps", () => {
  const pack = buildEvidencePack(fixture);
  const timeline = formatInteractionTimeline(fixture, "zh");
  assert.equal(pack.source.scope, "component");
  assert.ok(pack.counts.replayEvents >= 6);
  assert.ok(pack.replayEvents.some((event) => event.kind === "focus" && event.selector === ".card"));
  assert.ok(pack.replayEvents.some((event) => event.kind === "animation"));
  assert.ok(pack.prototypeRecipe.motionHooks.some((hook) => hook.includes("displacement")));
  assert.match(timeline, /焦点轨迹：2 个样本/);
  assert.match(timeline, /Focus 类型：in \(1\), out \(1\)；目标：\.card/);
});

test("evidence export preserves the complete capture and adds a v2 manifest", () => {
  const files = buildEvidenceOnlyPackFiles(fixture, {
    ...DEFAULT_DESIGN_BRIEF,
    siteType: "SaaS 官网",
    goal: "原创产品首页",
    borrow: ["visual", "layout"],
    avoid: "不要复制品牌资产",
    output: "homepage",
    stack: "react"
  }, "zh");
  const byName = Object.fromEntries(files.map((file) => [file.name, file.content]));
  assert.ok(byName["capture-v1.json"]);
  assert.ok(byName["capture-project-v2.json"]);
  const rawCapture = JSON.parse(byName["capture-v1.json"]);
  const project = JSON.parse(byName["capture-project-v2.json"]);
  const evidence = JSON.parse(byName["evidence.json"]);
  assert.deepEqual(rawCapture.layout, fixture.layout);
  assert.deepEqual(rawCapture.components, fixture.components);
  assert.equal(rawCapture.interactionTimeline.runtimeAnimations.length, 1);
  assert.equal(project.version, 2);
  assert.equal(project.artifacts["capture-v1"].size, new TextEncoder().encode(byName["capture-v1.json"]).byteLength);
  assert.equal(project.capabilities.screenshots, false);
  assert.equal(project.coverage.items.find((item) => item.area === "screenshots").status, "missing");
  assert.deepEqual(evidence.capture.interactionTimeline, fixture.interactionTimeline);
  assert.deepEqual(evidence.capture.implementationTrace, fixture.implementationTrace);
});

test("legacy similarity settings migrate into explicit workflow modes", () => {
  const rebuild = normalizeDesignBrief({ similarity: "high-fidelity-structure", siteType: "旧配置" });
  assert.equal(rebuild.mode, "rebuild");
  assert.equal(rebuild.rebuild.authorizationConfirmed, false);
  assert.equal(rebuild.rebuild.captureCanvas, false);
  assert.ok(rebuild.rebuild.states.includes("initial"));
  const reference = normalizeDesignBrief({ similarity: "inspired" });
  assert.equal(reference.mode, "reference");
  assert.equal(reference.referenceStrength, "inspired");
});

test("stored rebuild authorization never carries into a new popup session", () => {
  const brief = prepareDesignBriefForSession({
    ...DEFAULT_DESIGN_BRIEF,
    mode: "rebuild",
    rebuild: { ...DEFAULT_DESIGN_BRIEF.rebuild, authorizationConfirmed: true }
  });
  assert.equal(brief.mode, "rebuild");
  assert.equal(brief.rebuild.authorizationConfirmed, false);
});

test("rebuild draft requires authorization and exposes planned scenes and acceptance gaps", () => {
  const unauthorized = { ...DEFAULT_DESIGN_BRIEF, mode: "rebuild" };
  assert.throws(() => buildRebuildDraftPackFiles(fixture, unauthorized, "zh"), /确认.*权限/);
  const brief = {
    ...DEFAULT_DESIGN_BRIEF,
    mode: "rebuild",
    goal: "重建首页首屏",
    stack: "react",
    rebuild: {
      viewports: ["desktop", "mobile"],
      states: ["initial", "hover", "open"],
      assetPolicy: "manifest-only",
      authorizationConfirmed: true
    }
  };
  const files = buildRebuildDraftPackFiles(fixture, brief, "zh");
  const byName = Object.fromEntries(files.map((file) => [file.name, file.content]));
  assert.equal(byName["ai-coding-prompt.md"], undefined);
  assert.ok(byName["reconstruction-spec.json"]);
  assert.ok(byName["scene-manifest.json"]);
  assert.ok(byName["acceptance.json"]);
  const project = JSON.parse(byName["capture-project-v2.json"]);
  const scenes = JSON.parse(byName["scene-manifest.json"]);
  const acceptance = JSON.parse(byName["acceptance.json"]);
  assert.equal(project.mode, "rebuild");
  assert.equal(scenes.requestedScenes.length, 6);
  assert.equal(scenes.finalPackReady, false);
  assert.equal(acceptance.runnable, false);
});

test("rebuild draft exports the imported Recorder plan without treating it as captured evidence", () => {
  const brief = {
    ...DEFAULT_DESIGN_BRIEF,
    mode: "rebuild",
    rebuild: { ...DEFAULT_DESIGN_BRIEF.rebuild, authorizationConfirmed: true }
  };
  const recorderFlow = compileImportedRecorderFlow({
    title: "Imported checkout",
    steps: [
      { type: "navigate", url: "https://example.test/checkout" },
      { type: "click", selectors: [".checkout-button"], offsetX: 1, offsetY: 1 },
      { type: "change", selectors: ["#email"], value: "secret@example.test" }
    ]
  });
  const files = buildRebuildDraftPackFiles(fixture, brief, "zh", [], recorderFlow);
  const byName = Object.fromEntries(files.map((file) => [file.name, file.content]));
  const manifest = JSON.parse(byName["scene-manifest.json"]);
  assert.ok(byName["imported-recorder-flow.json"]);
  assert.equal(manifest.importedRecorderFlow.id, recorderFlow.id);
  assert.equal(manifest.requestedScenes.some((scene) => scene.state === "imported-click" && scene.status === "planned"), true);
  assert.equal(byName["imported-recorder-flow.json"].includes("secret@example.test"), false);

  const captureWithEvidence = {
    ...fixture,
    rebuildEvidence: {
      version: 1,
      recordingId: "import-match",
      storageProjectId: "import-match",
      privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
      request: { viewports: ["desktop"], states: ["initial", "open"] },
      scenes: [
        { id: "import-start", name: "Start", phase: "recording-start", viewport: { width: 1440, height: 900, devicePixelRatio: 2 }, scroll: { x: 0, y: 0 }, screenshotArtifactId: "shot-start", status: "captured" },
        { id: "import-open", name: "Open", phase: "observed-open", viewport: { width: 1440, height: 900, devicePixelRatio: 2 }, scroll: { x: 0, y: 0 }, selector: ".checkout-button", screenshotArtifactId: "shot-open", status: "captured" }
      ],
      artifacts: [],
      document: { width: 1440, height: 900, maxCapturedScrollY: 0, truncated: false },
      errors: []
    }
  };
  const match = matchImportedRecorderFlowPlan(recorderFlow, captureWithEvidence, captureWithEvidence.page.capturedAt);
  const matchedFiles = buildRebuildDraftPackFiles(captureWithEvidence, brief, "zh", [], recorderFlow, match);
  const matchedByName = Object.fromEntries(matchedFiles.map((file) => [file.name, file.content]));
  const matchedManifest = JSON.parse(matchedByName["scene-manifest.json"]);
  assert.ok(matchedByName["imported-recorder-flow-match.json"]);
  assert.equal(matchedManifest.requestedScenes.find((scene) => scene.state === "imported-click").status, "captured");
});

test("rebuild draft includes observed scene artifacts and keeps other states planned", () => {
  const createdAt = "2026-07-13T00:00:00.000Z";
  const capture = {
    ...fixture,
    rebuildEvidence: {
      version: 1,
      recordingId: "recording-1",
      storageProjectId: "rebuild-recording-1",
      privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
      rrweb: {
        artifact: { id: "rrweb-events", kind: "rrweb", name: "recordings/rrweb-events.json", mediaType: "application/json", size: 64, createdAt },
        eventCount: 12,
        truncated: false,
        startedAt: createdAt,
        endedAt: createdAt
      },
      scenes: [
        { id: "scene-start", name: "Observed start", phase: "recording-start", viewport: { width: 1440, height: 900, devicePixelRatio: 2 }, scroll: { x: 0, y: 0 }, screenshotArtifactId: "screenshot-start", capturedAt: createdAt, status: "captured" },
        { id: "scene-scroll", name: "Baseline segment", phase: "page-baseline", viewport: { width: 1440, height: 900, devicePixelRatio: 2 }, scroll: { x: 0, y: 900 }, screenshotArtifactId: "screenshot-scroll", capturedAt: createdAt, status: "captured" }
      ],
      artifacts: [
        { id: "rrweb-events", kind: "rrweb", name: "recordings/rrweb-events.json", mediaType: "application/json", size: 64, createdAt },
        { id: "screenshot-start", kind: "screenshot", name: "screenshots/start.png", mediaType: "image/png", size: 8, createdAt },
        { id: "screenshot-scroll", kind: "screenshot", name: "screenshots/scroll.png", mediaType: "image/png", size: 8, createdAt }
      ],
      document: { width: 1440, height: 1800, maxCapturedScrollY: 900, truncated: false },
      errors: []
    }
  };
  const brief = {
    ...DEFAULT_DESIGN_BRIEF,
    mode: "rebuild",
    rebuild: { viewports: ["desktop", "mobile"], states: ["initial", "scroll", "hover"], assetPolicy: "manifest-only", authorizationConfirmed: true }
  };
  const png = new Uint8Array([137, 80, 78, 71]);
  const files = buildRebuildDraftPackFiles(capture, brief, "zh", [
    { name: "screenshots/start.png", content: png },
    { name: "recordings/rrweb-events.json", content: "{\"events\":[]}" }
  ]);
  const byName = Object.fromEntries(files.map((file) => [file.name, file.content]));
  const project = JSON.parse(byName["capture-project-v2.json"]);
  const scenes = JSON.parse(byName["scene-manifest.json"]);
  const acceptance = JSON.parse(byName["acceptance.json"]);

  assert.deepEqual(byName["screenshots/start.png"], png);
  assert.ok(byName["recordings/rrweb-events.json"]);
  assert.equal(project.capabilities.rrweb, true);
  assert.equal(project.capabilities.screenshots, true);
  assert.equal(acceptance.status, "not-run");
  assert.equal(acceptance.runnable, true);
  assert.equal(acceptance.baseline.capturedSceneCount, 2);
  assert.equal(project.coverage.items.find((item) => item.area === "screenshots").status, "complete");
  assert.equal(scenes.requestedScenes.find((scene) => scene.id === "requested-desktop-initial").status, "captured");
  assert.equal(scenes.requestedScenes.find((scene) => scene.id === "requested-desktop-scroll").status, "captured");
  assert.equal(scenes.requestedScenes.find((scene) => scene.id === "requested-desktop-hover").status, "planned");
  assert.equal(scenes.requestedScenes.find((scene) => scene.id === "requested-mobile-initial").status, "planned");
});

test("rebuild artifact loader hydrates stored binary files and rejects missing evidence", async () => {
  const storageProjectId = `rebuild-loader-${Date.now()}-${Math.random()}`;
  const createdAt = "2026-07-13T00:00:00.000Z";
  const artifact = { id: "screenshot-start", kind: "screenshot", name: "screenshots/start.png", mediaType: "image/png", size: 4, createdAt };
  const capture = {
    ...fixture,
    rebuildEvidence: {
      version: 1,
      recordingId: "loader-recording",
      storageProjectId,
      privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
      scenes: [],
      artifacts: [artifact],
      document: { width: 1440, height: 900, maxCapturedScrollY: 0, truncated: false },
      errors: []
    }
  };
  const store = new CaptureProjectStore();
  try {
    await store.putArtifact({
      projectId: storageProjectId,
      artifactId: artifact.id,
      kind: artifact.kind,
      name: artifact.name,
      mediaType: artifact.mediaType,
      data: new Uint8Array([137, 80, 78, 71]),
      createdAt
    });
    const files = await loadRebuildArtifactFiles(capture, "zh");
    assert.equal(files.length, 1);
    assert.equal(files[0].name, "screenshots/start.png");
    assert.deepEqual(new Uint8Array(files[0].content), new Uint8Array([137, 80, 78, 71]));

    capture.rebuildEvidence.artifacts.push({ ...artifact, id: "missing", name: "screenshots/missing.png" });
    await assert.rejects(() => loadRebuildArtifactFiles(capture, "zh"), /已不可用/);
  } finally {
    await store.deleteProject(storageProjectId);
    await store.close();
  }
});

test("deep collector evidence upgrades v2 structure and style provenance without inventing pseudo states", () => {
  const createdAt = "2026-07-13T00:00:00.000Z";
  const capture = {
    ...fixture,
    rebuildEvidence: {
      version: 1,
      recordingId: "deep-recording",
      storageProjectId: "deep-project",
      privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
      request: { viewports: ["desktop"], states: ["initial"] },
      scenes: [{ id: "deep-scene", name: "Deep scene", phase: "responsive-initial", viewport: { width: 1440, height: 900, devicePixelRatio: 2 }, scroll: { x: 0, y: 0 }, screenshotArtifactId: "deep-shot", status: "captured", capturedAt: createdAt }],
      artifacts: [
        { id: "cdp-dom-snapshot", kind: "dom-snapshot", name: "raw/cdp-dom-snapshot.json", mediaType: "application/json", size: 100, createdAt },
        { id: "cdp-style-evidence", kind: "style", name: "raw/cdp-style-evidence.json", mediaType: "application/json", size: 100, createdAt },
        { id: "deep-shot", kind: "screenshot", name: "screenshots/deep.png", mediaType: "image/png", size: 100, createdAt },
        { id: "deep-motion-50", kind: "screenshot", name: "screenshots/motion/deep-motion-50.png", mediaType: "image/png", size: 100, createdAt }
      ],
      document: { width: 1440, height: 900, maxCapturedScrollY: 0, truncated: false },
      deepCollector: {
        version: 1,
        protocolVersion: "1.3",
        sceneId: "deep-scene",
        capturedAt: createdAt,
        requestedNodeCount: 1,
        capturedNodeCount: 1,
        scenes: [{ id: "deep-scene", name: "Deep scene", phase: "responsive-initial", viewport: { width: 1440, height: 900, devicePixelRatio: 2 }, scroll: { x: 0, y: 0 }, screenshotArtifactId: "deep-shot", status: "captured", capturedAt: createdAt }],
        artifacts: [
          { id: "cdp-dom-snapshot", kind: "dom-snapshot", name: "raw/cdp-dom-snapshot.json", mediaType: "application/json", size: 100, createdAt },
          { id: "cdp-style-evidence", kind: "style", name: "raw/cdp-style-evidence.json", mediaType: "application/json", size: 100, createdAt },
          { id: "deep-motion-50", kind: "screenshot", name: "screenshots/motion/deep-motion-50.png", mediaType: "image/png", size: 100, createdAt }
        ],
        styles: [{ nodeId: "card", selector: ".card", backendNodeId: 42, tagName: "article", computed: { display: "grid", color: "rgb(1, 2, 3)" }, cssVariables: { "--accent": "#0a6" }, matchedRules: [{ selector: ".card", declarations: { display: "grid" }, origin: "regular", styleSheetId: "sheet-1" }], rect: { x: 10, y: 20, width: 320, height: 180 } }],
        animations: [{ id: "anim-1", nodeId: "card", selector: ".card", backendNodeId: 42, name: "enter", type: "CSSAnimation", playState: "running", durationMs: 500, delayMs: 0, easing: "ease", iterationCount: 1 }],
        motionCheckpoints: [{ id: "deep-motion-50", sceneId: "deep-scene", progress: 0.5, animations: [{ animationId: "anim-1", name: "enter", nodeId: "card", selector: ".card", durationMs: 500, currentTimeMs: 250 }], maskNodeIds: [], screenshotArtifactId: "deep-motion-50", capturedAt: createdAt, status: "captured" }],
        page: { frameId: "frame-1", loaderId: "loader-1" },
        errors: []
      },
      errors: []
    }
  };
  const project = captureProjectFromDesignCapture(capture, "rebuild");
  const deepStyle = Object.values(project.styles).find((style) => style.source === "cdp");
  assert.equal(project.capabilities.cdp, true);
  assert.equal(project.capabilities.matchedStyles, true);
  assert.equal(project.nodes.card.backendNodeId, 42);
  assert.deepEqual(project.nodes.card.rectByScene["deep-scene"], { x: 10, y: 20, width: 320, height: 180 });
  assert.equal(deepStyle.matchedRules[0].styleSheetId, "sheet-1");
  assert.deepEqual(deepStyle.pseudoStates, []);
  assert.equal(project.coverage.items.find((item) => item.area === "structure").status, "complete");
  assert.equal(project.coverage.items.find((item) => item.area === "styles").status, "complete");
  assert.ok(project.animations.some((animation) => animation.source === "cdp-CSSAnimation"));
  assert.equal(project.motionCheckpoints.length, 1);
  assert.deepEqual(project.scenes.find((scene) => scene.id === "deep-scene").capture.maskNodeIds, ["card"]);
  assert.equal(project.coverage.items.find((item) => item.area === "animations").status, "complete");

  const mobileScene = { id: "deep-mobile", name: "Deep mobile", phase: "responsive-initial", viewport: { width: 390, height: 844, devicePixelRatio: 2 }, scroll: { x: 0, y: 0 }, screenshotArtifactId: "deep-mobile-shot", status: "captured", capturedAt: createdAt };
  capture.rebuildEvidence.request.viewports.push("mobile");
  capture.rebuildEvidence.scenes.push(mobileScene);
  capture.rebuildEvidence.deepCollector.scenes.push(mobileScene);
  capture.rebuildEvidence.artifacts.push(
    { id: "deep-mobile-shot", kind: "screenshot", name: "screenshots/deep-mobile.png", mediaType: "image/png", size: 100, createdAt },
    { id: "deep-mobile-snapshot", kind: "dom-snapshot", name: "raw/deep-mobile.json", mediaType: "application/json", size: 100, createdAt }
  );
  capture.rebuildEvidence.deepCollector.artifacts.push({ id: "deep-mobile-snapshot", kind: "dom-snapshot", name: "raw/deep-mobile.json", mediaType: "application/json", size: 100, createdAt });
  const incompleteMobileProject = captureProjectFromDesignCapture(capture, "rebuild");
  assert.equal(incompleteMobileProject.coverage.items.find((item) => item.area === "responsive").status, "complete");
  assert.equal(incompleteMobileProject.coverage.items.find((item) => item.area === "styles").status, "partial");
});

test("scene manifest maps responsive and forced states while leaving unobserved open planned", () => {
  const createdAt = "2026-07-13T00:00:00.000Z";
  const makeScene = (id, phase, width, screenshotArtifactId, selector) => ({
    id,
    name: id,
    phase,
    viewport: { width, height: width < 768 ? 844 : 900, devicePixelRatio: width < 768 ? 2 : 1 },
    scroll: { x: 0, y: 0 },
    screenshotArtifactId,
    ...(selector ? { selector } : {}),
    capturedAt: createdAt,
    status: "captured"
  });
  const scenes = [
    makeScene("desktop-initial", "responsive-initial", 1440, "shot-desktop"),
    makeScene("mobile-initial", "responsive-initial", 390, "shot-mobile"),
    makeScene("desktop-scroll", "responsive-scroll", 1440, "shot-scroll"),
    { id: "mobile-scroll-na", name: "mobile-scroll-na", phase: "responsive-scroll", viewport: { width: 390, height: 844, devicePixelRatio: 2 }, scroll: { x: 0, y: 0 }, status: "not-applicable" },
    makeScene("desktop-hover", "forced-hover", 1440, "shot-hover", ".card"),
    makeScene("desktop-hover-two", "forced-hover", 1440, "shot-hover-two", ".card-two"),
    makeScene("desktop-focus", "forced-focus", 1440, "shot-focus", ".card")
  ];
  const artifacts = scenes.filter((scene) => scene.screenshotArtifactId).map((scene) => ({ id: scene.screenshotArtifactId, kind: "screenshot", name: `screenshots/${scene.id}.png`, mediaType: "image/png", size: 10, createdAt }));
  const capture = {
    ...fixture,
    rebuildEvidence: {
      version: 1,
      recordingId: "scene-mapping",
      storageProjectId: "scene-mapping",
      privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
      request: { viewports: ["desktop", "mobile"], states: ["initial", "scroll", "hover", "focus", "open"] },
      scenes,
      artifacts,
      document: { width: 1440, height: 900, maxCapturedScrollY: 0, truncated: false },
      errors: []
    }
  };
  const brief = {
    ...DEFAULT_DESIGN_BRIEF,
    mode: "rebuild",
    rebuild: { ...DEFAULT_DESIGN_BRIEF.rebuild, authorizationConfirmed: true }
  };
  const files = buildRebuildDraftPackFiles(capture, brief, "zh");
  const project = captureProjectFromDesignCapture(capture, "rebuild");
  const manifest = JSON.parse(files.find((file) => file.name === "scene-manifest.json").content);
  const reconstruction = JSON.parse(files.find((file) => file.name === "reconstruction-spec.json").content);
  const evidence = JSON.parse(files.find((file) => file.name === "evidence.json").content);
  const byId = Object.fromEntries(manifest.requestedScenes.map((scene) => [scene.id, scene]));
  assert.equal(manifest.requestedScenes.length, 10);
  assert.deepEqual(reconstruction.requestedViewports, ["desktop", "mobile"]);
  assert.deepEqual(reconstruction.requestedStates, ["initial", "scroll", "hover", "focus", "open"]);
  assert.deepEqual(evidence.designBrief.rebuild.viewports, ["desktop", "mobile"]);
  assert.equal(byId["requested-desktop-initial"].status, "captured");
  assert.equal(byId["requested-mobile-initial"].status, "captured");
  assert.equal(byId["requested-desktop-scroll"].status, "captured");
  assert.equal(byId["requested-mobile-scroll"].status, "not-applicable");
  assert.equal(byId["requested-desktop-hover"].status, "captured");
  assert.equal(byId["requested-desktop-hover"].evidenceSceneIds.length, 2);
  assert.equal(byId["requested-desktop-hover"].evidenceTargetCount, 2);
  assert.equal(byId["requested-desktop-focus"].status, "captured");
  assert.equal(byId["requested-desktop-open"].status, "planned");
  assert.equal(byId["requested-mobile-hover"].status, "planned");
  assert.equal(project.capabilities.multiViewport, true);
  assert.deepEqual(project.scenes.find((scene) => scene.id === "desktop-hover").triggers, [{ kind: "hover", selector: ".card" }]);
  assert.equal(project.coverage.items.find((item) => item.area === "responsive").status, "complete");
});

test("AI response parser supports responses and chat-completions shapes", () => {
  assert.equal(extractResponseText({ output_text: "responses text" }), "responses text");
  assert.equal(extractResponseText({ choices: [{ message: { content: "chat text" } }] }), "chat text");
});

test("provider presets include China-focused compatible providers", () => {
  const presetIds = new Set(AI_PROVIDER_PRESETS.map((preset) => preset.id));
  for (const id of ["deepseek", "dashscope", "siliconflow", "zhipu", "moonshot", "volcengine", "baidu-qianfan"]) {
    assert.equal(presetIds.has(id), true);
  }
  const baseSettings = { apiKey: "", model: "custom", baseUrl: "https://example.test/v1", endpoint: "chat-completions" };
  const next = applyProviderPreset(baseSettings, "deepseek");
  assert.equal(next.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(findProviderPreset(next)?.id, "deepseek");
});

test("AI settings profiles save provider-specific credentials", () => {
  const state = createDefaultAiSettingsState();
  const next = upsertAiProfile(state, {
    id: "deepseek",
    presetId: "deepseek",
    name: "DeepSeek",
    apiKey: "sk-deepseek",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    endpoint: "chat-completions",
    updatedAt: "2026-06-28T00:00:00.000Z"
  });

  assert.equal(next.activeProfileId, "deepseek");
  assert.equal(getActiveAiProfile(next).apiKey, "sk-deepseek");
  assert.equal(next.profiles.openai.apiKey, "");
  assert.equal(next.profiles.deepseek.endpoint, "chat-completions");
});

test("reference pack zip bytes expose separate readable files", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "design-lens-zip-"));
  const zipPath = join(dir, "pack.zip");
  try {
    const bytes = createZipBytes([
      { name: "README.md", content: "# Pack\n" },
      { name: "skill.md", content: "# Skill\n" },
      { name: "evidence.json", content: "{\"tokens\":{\"colors\":[]}}" },
      { name: "ai-coding-prompt.md", content: "Build a site" },
      { name: "ai-implementation-brief.md", content: "Brief" }
    ]);
    await writeFile(zipPath, bytes);
    const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
    assert.match(listing, /README\.md/);
    assert.match(listing, /skill\.md/);
    assert.match(listing, /evidence\.json/);
    assert.match(listing, /ai-coding-prompt\.md/);
    assert.match(listing, /ai-implementation-brief\.md/);
    assert.equal(listing.trim().split("\n").length, 5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("evidence-only zip does not imply prompt files", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "design-lens-evidence-"));
  const zipPath = join(dir, "design-lens-evidence-only-example.zip");
  try {
    const bytes = createZipBytes([
      { name: "README.md", content: "No AI prompt is included." },
      { name: "skill.md", content: "# Skill\n" },
      { name: "evidence.json", content: "{\"tokens\":{\"colors\":[]}}" }
    ]);
    await writeFile(zipPath, bytes);
    const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
    assert.equal(listing.includes("ai-coding-prompt.md"), false);
    assert.equal(listing.includes("ai-implementation-brief.md"), false);
    assert.match(listing, /evidence\.json/);
    assert.equal(listing.trim().split("\n").length, 3);
    assert.match(zipPath, /evidence-only/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("zip entries carry a current modified date", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "design-lens-date-"));
  const zipPath = join(dir, "pack.zip");
  try {
    const bytes = createZipBytes([{ name: "README.md", content: "# Pack\n" }]);
    await writeFile(zipPath, bytes);
    const listing = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
    assert.match(listing, new RegExp(String(new Date().getFullYear())));
    assert.equal(/1979|1980/.test(listing), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("zip supports compressed binary artifacts without changing their bytes", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "design-lens-binary-"));
  const zipPath = join(dir, "pack.zip");
  const binary = new Uint8Array(1024 * 1024);
  binary.fill(23);
  try {
    const bytes = createZipBytes([
      { name: "screenshots/baseline.bin", content: binary },
      { name: "README.md", content: "# Binary pack\n" }
    ]);
    assert.ok(bytes.byteLength < binary.byteLength / 10);
    await writeFile(zipPath, bytes);
    const extracted = execFileSync("unzip", ["-p", zipPath, "screenshots/baseline.bin"]);
    assert.equal(extracted.byteLength, binary.byteLength);
    assert.deepEqual(extracted.subarray(0, 32), Buffer.from(binary.subarray(0, 32)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("zip rejects duplicate and unsafe entry paths", () => {
  assert.throws(() => createZipBytes([{ name: "../secret.txt", content: "no" }]), /Invalid ZIP entry path/);
  assert.throws(() => createZipBytes([
    { name: "same.txt", content: "one" },
    { name: "same.txt", content: "two" }
  ]), /Duplicate ZIP entry/);
});
