import assert from "node:assert/strict";
import test from "node:test";
import { buildAiAnalysisPayload, buildAiPrompt } from "../src/ai/context.ts";
import { extractResponseText } from "../src/ai/openai.ts";
import { AI_PROVIDER_PRESETS, applyProviderPreset, findProviderPreset } from "../src/ai/provider-presets.ts";
import { buildEvidencePack } from "../src/evidence/evidence-pack.ts";
import { generatePrototypeHtml } from "../src/generators/export/prototype.ts";
import { generateCompactSkillMarkdown, generateSkillMarkdown } from "../src/generators/skill/skill.ts";
import { createDefaultAiSettingsState, getActiveAiProfile, upsertAiProfile } from "../src/shared/ai-settings.ts";
import { createZipBytes } from "../src/shared/zip.ts";

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
  assert.ok(payload.capture.implementation.some((item) => item.includes("Next.js")));
  assert.equal(payload.capture.evidencePack.prototypeRecipe.recommendedTemplate, "component-module");
  assert.equal(JSON.stringify(payload).includes("outerHTML"), false);
});

test("AI prompt compiler includes user build intent", () => {
  const payload = buildAiAnalysisPayload(fixture, "zh");
  const prompt = buildAiPrompt(payload, {
    siteType: "个人技术博客",
    goal: "个人技术博客首页，借鉴液态媒体和大字舞台",
    borrow: ["visual", "motion", "media"],
    avoid: "不要像工作室官网",
    output: "homepage",
    stack: "html",
    similarity: "strong-reference"
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
  assert.equal(pack.source.scope, "component");
  assert.ok(pack.counts.replayEvents >= 6);
  assert.ok(pack.replayEvents.some((event) => event.kind === "animation"));
  assert.ok(pack.prototypeRecipe.motionHooks.some((hook) => hook.includes("displacement")));
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
