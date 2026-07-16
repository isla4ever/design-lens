import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { unzipSync, strFromU8 } from "fflate";
import { chromium } from "playwright";
import {
  buildAcceptancePlan,
  buildAgentFixContext,
  compareGeometry,
  finalizeAcceptanceReport,
  renderAcceptanceReportHtml
} from "../src/capture-v2/validation/acceptance.ts";
import { comparePng, cssRectsToPixelRects } from "./lib/visual-diff.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}
if (!args.pack || !args.url) {
  printHelp();
  throw new Error("Both --pack and --url are required.");
}

const candidateUrl = validateCandidateUrl(args.url);
const pack = await openPack(path.resolve(args.pack), args.route ? `routes/${validateRouteId(args.route)}` : "");
const project = await readJson(pack, "capture-project-v2.json");
const manifest = await readJson(pack, "scene-manifest.json");
const storedPlan = await readJson(pack, "acceptance.json");
const plan = storedPlan?.baseline ? storedPlan : buildAcceptancePlan(project, manifest.requestedScenes ?? []);
const rules = {
  ...plan.rules,
  ...(args.pixelThreshold !== undefined ? { stablePixelMismatchRatio: args.pixelThreshold } : {}),
  ...(args.colorThreshold !== undefined ? { pixelColorThreshold: args.colorThreshold } : {}),
  ...(args.geometryTolerance !== undefined ? { keyElementGeometryToleranceCssPx: args.geometryTolerance } : {})
};
const outputDir = path.resolve(args.output ?? `design-lens-acceptance-${Date.now()}`);
const sceneOutputDir = path.join(outputDir, "scenes");
await fs.mkdir(sceneOutputDir, { recursive: true });

const browser = await chromium.launch({ headless: !args.headed });
const results = [];
try {
  const scenes = project.scenes.filter((scene) => scene.status === "captured" && scene.screenshotArtifactId);
  for (const scene of scenes) {
    results.push(...await verifyScene({ browser, candidateUrl, pack, project, scene, rules, sceneOutputDir, maskSelectors: args.masks }));
  }
} finally {
  await browser.close();
}

const report = finalizeAcceptanceReport({ project, candidateUrl, plan, rules, scenes: results });
await Promise.all([
  fs.writeFile(path.join(outputDir, "acceptance-report.json"), JSON.stringify(report, null, 2)),
  fs.writeFile(path.join(outputDir, "acceptance-report.html"), renderAcceptanceReportHtml(report)),
  fs.writeFile(path.join(outputDir, "agent-fix-context.md"), buildAgentFixContext(report))
]);
console.log(JSON.stringify({ status: report.status, outputDir, summary: report.summary }, null, 2));
if (report.status !== "passed") process.exitCode = 2;

async function verifyScene({ browser, candidateUrl, pack, project, scene, rules, sceneOutputDir, maskSelectors }) {
  const base = {
    id: scene.id,
    name: scene.name,
    viewport: scene.viewport,
    referenceArtifactId: scene.screenshotArtifactId,
    maskedRegionCount: 0,
    browserErrors: []
  };
  const artifact = project.artifacts[scene.screenshotArtifactId];
  if (!artifact) return [{ ...base, status: "error", reason: "Reference screenshot descriptor is missing." }];
  const referenceBytes = await pack.read(artifact.name);
  if (!referenceBytes) return [{ ...base, status: "error", reason: `Reference screenshot file is missing: ${artifact.name}` }];

  const context = await browser.newContext({
    viewport: { width: scene.viewport.width, height: scene.viewport.height },
    deviceScaleFactor: scene.viewport.deviceScaleFactor,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserErrors.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => browserErrors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`));

  const fileBase = safeName(scene.id);
  const candidateName = `${fileBase}.candidate.png`;
  const diffName = `${fileBase}.diff.png`;
  try {
    await page.goto(candidateUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts?.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const replay = await replayScene(page, scene.triggers);
    if (!replay.ok) {
      return [{ ...base, status: replay.skipped ? "skipped" : "failed", reason: replay.reason, browserErrors }];
    }
    const motionResults = await verifyMotionCheckpoints({
      page,
      pack,
      project,
      scene,
      rules,
      sceneOutputDir,
      maskSelectors,
      browserErrors
    });
    const canvasResults = await verifyCanvasFrames({
      page,
      pack,
      project,
      scene,
      rules,
      sceneOutputDir,
      browserErrors
    });
    await page.waitForTimeout(160);

    const geometryItems = [];
    for (const node of Object.values(project.nodes).slice(0, 80)) {
      const expected = node.rectByScene[scene.id];
      if (!expected || !node.selector) continue;
      const actualBox = await page.locator(node.selector).first().boundingBox().catch(() => null);
      const actual = actualBox ? { x: actualBox.x, y: actualBox.y, width: actualBox.width, height: actualBox.height } : undefined;
      geometryItems.push(compareGeometry(node.id, node.selector, expected, actual, rules.keyElementGeometryToleranceCssPx));
    }

    const cssMaskRects = [];
    for (const nodeId of scene.capture.maskNodeIds) {
      const node = project.nodes[nodeId];
      const expected = node?.rectByScene[scene.id];
      if (expected) cssMaskRects.push(expected);
      if (node?.selector) {
        const actual = await page.locator(node.selector).first().boundingBox().catch(() => null);
        if (actual) cssMaskRects.push(actual);
      }
    }
    for (const selector of [...project.policy.blockSelectors, ...maskSelectors]) {
      const boxes = await page.locator(selector).evaluateAll((elements) => elements.slice(0, 24).map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })).catch(() => []);
      cssMaskRects.push(...boxes);
    }

    const candidateBytes = await page.screenshot({ animations: "disabled", caret: "hide", fullPage: scene.capture.fullPage });
    await fs.writeFile(path.join(sceneOutputDir, candidateName), candidateBytes);
    const maskRects = cssRectsToPixelRects(
      cssMaskRects,
      scene.viewport.deviceScaleFactor,
      scene.viewport.width * scene.viewport.deviceScaleFactor,
      scene.viewport.height * scene.viewport.deviceScaleFactor
    );
    const pixel = comparePng(referenceBytes, candidateBytes, {
      colorThreshold: rules.pixelColorThreshold,
      maskRects
    });
    if (pixel.diffBytes) await fs.writeFile(path.join(sceneOutputDir, diffName), pixel.diffBytes);
    const pixelPassed = pixel.dimensionsMatch && pixel.mismatchRatio <= rules.stablePixelMismatchRatio;
    const failedGeometry = geometryItems.filter((item) => !item.passed).length;
    const geometryPassed = failedGeometry === 0;
    const passed = pixelPassed && geometryPassed && browserErrors.length === 0;
    const staticResult = {
      ...base,
      kind: "scene",
      status: passed ? "passed" : "failed",
      candidateScreenshot: `scenes/${candidateName}`,
      ...(pixel.diffBytes ? { diffScreenshot: `scenes/${diffName}` } : {}),
      maskedRegionCount: maskRects.length,
      browserErrors,
      pixel: {
        dimensionsMatch: pixel.dimensionsMatch,
        mismatchPixels: pixel.mismatchPixels,
        mismatchRatio: pixel.mismatchRatio,
        threshold: rules.stablePixelMismatchRatio,
        passed: pixelPassed,
        ...(pixel.hotspot ? { hotspot: pixel.hotspot } : {})
      },
      geometry: {
        checked: geometryItems.length,
        failed: failedGeometry,
        toleranceCssPx: rules.keyElementGeometryToleranceCssPx,
        passed: geometryPassed,
        items: geometryItems
      }
    };
    return [staticResult, ...motionResults, ...canvasResults];
  } catch (error) {
    return [{ ...base, status: "error", reason: error instanceof Error ? error.message : String(error), browserErrors }];
  } finally {
    await context.close();
  }
}

async function verifyCanvasFrames({ page, pack, project, scene, rules, sceneOutputDir, browserErrors }) {
  const frames = (project.canvasFrames ?? []).filter((frame) => frame.sceneId === scene.id && frame.status === "readable" && frame.artifactId);
  if (!frames.length) return [];
  const results = [];
  for (const frame of frames) {
    const base = {
      id: frame.id,
      name: `${scene.name} Canvas ${frame.index + 1}`,
      kind: "canvas-frame",
      viewport: scene.viewport,
      referenceArtifactId: frame.artifactId,
      maskedRegionCount: 0,
      browserErrors
    };
    const artifact = project.artifacts[frame.artifactId];
    const referenceBytes = artifact ? await pack.read(artifact.name) : undefined;
    if (!artifact || !referenceBytes) {
      results.push({ ...base, status: "error", reason: "Canvas frame reference artifact is missing." });
      continue;
    }
    let candidateBytes;
    try {
      const dataUrl = await page.locator(frame.selector).first().evaluate((element, input) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Candidate selector is not a Canvas element.");
        const scale = typeof input.scale === "number" && input.scale > 0 ? input.scale : 1;
        if (scale >= 0.999) return element.toDataURL("image/png");
        const target = document.createElement("canvas");
        target.width = Math.max(1, Math.floor(element.width * scale));
        target.height = Math.max(1, Math.floor(element.height * scale));
        const context = target.getContext("2d");
        if (!context) throw new Error("Candidate Canvas could not be scaled.");
        context.drawImage(element, 0, 0, target.width, target.height);
        return target.toDataURL("image/png");
      }, { scale: frame.scale });
      candidateBytes = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
      if (!candidateBytes.length) throw new Error("Candidate Canvas returned an empty PNG.");
    } catch (error) {
      results.push({ ...base, status: "failed", reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const candidateName = `${safeName(frame.id)}.candidate.png`;
    const diffName = `${safeName(frame.id)}.diff.png`;
    await fs.writeFile(path.join(sceneOutputDir, candidateName), candidateBytes);
    const pixel = comparePng(referenceBytes, candidateBytes, {
      colorThreshold: rules.pixelColorThreshold,
      maskRects: []
    });
    if (pixel.diffBytes) await fs.writeFile(path.join(sceneOutputDir, diffName), pixel.diffBytes);
    const passed = pixel.dimensionsMatch && pixel.mismatchRatio <= rules.stablePixelMismatchRatio && browserErrors.length === 0;
    results.push({
      ...base,
      status: passed ? "passed" : "failed",
      candidateScreenshot: `scenes/${candidateName}`,
      ...(pixel.diffBytes ? { diffScreenshot: `scenes/${diffName}` } : {}),
      pixel: {
        dimensionsMatch: pixel.dimensionsMatch,
        mismatchPixels: pixel.mismatchPixels,
        mismatchRatio: pixel.mismatchRatio,
        threshold: rules.stablePixelMismatchRatio,
        passed,
        ...(pixel.hotspot ? { hotspot: pixel.hotspot } : {})
      }
    });
  }
  return results;
}

async function verifyMotionCheckpoints({ page, pack, project, scene, rules, sceneOutputDir, maskSelectors, browserErrors }) {
  const checkpoints = (project.motionCheckpoints ?? []).filter((checkpoint) => checkpoint.sceneId === scene.id && checkpoint.status === "captured" && checkpoint.screenshotArtifactId);
  if (!checkpoints.length) return [];
  const descriptors = uniqueBy(checkpoints.flatMap((checkpoint) => checkpoint.animations), (animation) => `${animation.animationId}|${animation.selector ?? ""}`);
  const session = await startMotionSession(page, descriptors);
  const results = [];
  try {
    for (const checkpoint of checkpoints) {
      const checkpointBase = {
        id: checkpoint.id,
        name: `${scene.name} motion ${Math.round(checkpoint.progress * 100)}%`,
        kind: "motion-checkpoint",
        checkpointProgress: checkpoint.progress,
        viewport: scene.viewport,
        referenceArtifactId: checkpoint.screenshotArtifactId,
        maskedRegionCount: 0,
        browserErrors
      };
      const missing = checkpoint.animations.filter((animation) => session.missingKeys.includes(motionKey(animation)));
      if (missing.length) {
        results.push({ ...checkpointBase, status: "failed", reason: `Candidate animation target missing: ${missing.map((animation) => animation.selector ?? animation.name).join(", ")}` });
        continue;
      }
      const artifact = project.artifacts[checkpoint.screenshotArtifactId];
      const referenceBytes = artifact ? await pack.read(artifact.name) : undefined;
      if (!artifact || !referenceBytes) {
        results.push({ ...checkpointBase, status: "error", reason: "Motion checkpoint reference screenshot is missing." });
        continue;
      }
      await seekMotionSession(page, checkpoint.progress);
      const candidateName = `${safeName(checkpoint.id)}.candidate.png`;
      const diffName = `${safeName(checkpoint.id)}.diff.png`;
      const candidateBytes = await page.screenshot({ animations: "allow", caret: "hide", fullPage: scene.capture.fullPage });
      await fs.writeFile(path.join(sceneOutputDir, candidateName), candidateBytes);
      const cssMaskRects = [];
      for (const nodeId of checkpoint.maskNodeIds) {
        const node = project.nodes[nodeId];
        const expected = node?.rectByScene[scene.id];
        if (expected) cssMaskRects.push(expected);
        if (node?.selector) {
          const actual = await page.locator(node.selector).first().boundingBox().catch(() => null);
          if (actual) cssMaskRects.push(actual);
        }
      }
      for (const selector of [...project.policy.blockSelectors, ...maskSelectors]) {
        const boxes = await selectorBoxes(page, selector);
        cssMaskRects.push(...boxes);
      }
      const maskRects = cssRectsToPixelRects(
        cssMaskRects,
        scene.viewport.deviceScaleFactor,
        scene.viewport.width * scene.viewport.deviceScaleFactor,
        scene.viewport.height * scene.viewport.deviceScaleFactor
      );
      const pixel = comparePng(referenceBytes, candidateBytes, { colorThreshold: rules.pixelColorThreshold, maskRects });
      if (pixel.diffBytes) await fs.writeFile(path.join(sceneOutputDir, diffName), pixel.diffBytes);
      const passed = pixel.dimensionsMatch && pixel.mismatchRatio <= rules.stablePixelMismatchRatio && browserErrors.length === 0;
      results.push({
        ...checkpointBase,
        status: passed ? "passed" : "failed",
        candidateScreenshot: `scenes/${candidateName}`,
        ...(pixel.diffBytes ? { diffScreenshot: `scenes/${diffName}` } : {}),
        maskedRegionCount: maskRects.length,
        pixel: {
          dimensionsMatch: pixel.dimensionsMatch,
          mismatchPixels: pixel.mismatchPixels,
          mismatchRatio: pixel.mismatchRatio,
          threshold: rules.stablePixelMismatchRatio,
          passed,
          ...(pixel.hotspot ? { hotspot: pixel.hotspot } : {})
        }
      });
    }
  } finally {
    await restoreMotionSession(page);
  }
  return results;
}

async function startMotionSession(page, descriptors) {
  return page.evaluate((items) => {
    const animations = document.getAnimations({ subtree: true });
    const used = new Set();
    const entries = [];
    const missingKeys = [];
    for (const item of items) {
      const key = `${item.animationId}|${item.selector ?? ""}`;
      const candidates = animations.filter((animation) => {
        if (used.has(animation)) return false;
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        return target instanceof Element && item.selector && target.matches(item.selector);
      });
      const preferred = candidates.find((animation) => animationName(animation) === item.name) ?? candidates[0];
      if (!preferred) {
        missingKeys.push(key);
        continue;
      }
      used.add(preferred);
      entries.push({ key, animation: preferred, currentTime: preferred.currentTime, playbackRate: preferred.playbackRate, playState: preferred.playState });
      preferred.pause();
    }
    globalThis.__designLensMotionSession = entries;
    return { missingKeys };

    function animationName(animation) {
      if ("animationName" in animation && typeof animation.animationName === "string") return animation.animationName;
      if ("transitionProperty" in animation && typeof animation.transitionProperty === "string") return animation.transitionProperty;
      return animation.id || "anonymous";
    }
  }, descriptors);
}

async function seekMotionSession(page, progress) {
  await page.evaluate((nextProgress) => {
    const entries = globalThis.__designLensMotionSession ?? [];
    for (const entry of entries) {
      const duration = entry.animation.effect?.getComputedTiming().duration;
      if (typeof duration === "number" && Number.isFinite(duration)) entry.animation.currentTime = duration * nextProgress;
    }
  }, progress);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function restoreMotionSession(page) {
  const result = await page.evaluate(() => {
    const errors = [];
    const entries = globalThis.__designLensMotionSession ?? [];
    for (const entry of entries) {
      try {
        entry.animation.currentTime = entry.currentTime;
        entry.animation.playbackRate = entry.playbackRate;
        if (entry.playState === "running") entry.animation.play();
        else entry.animation.pause();
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    delete globalThis.__designLensMotionSession;
    return errors;
  });
  if (result.length) throw new Error(`Candidate animation restoration failed: ${result.join("; ")}`);
}

function motionKey(animation) {
  return `${animation.animationId}|${animation.selector ?? ""}`;
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function selectorBoxes(page, selector) {
  return page.locator(selector).evaluateAll((elements) => elements.slice(0, 24).map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })).catch(() => []);
}

async function replayScene(page, triggers) {
  for (const trigger of triggers) {
    if (trigger.kind === "initial") continue;
    if (trigger.kind === "scroll") {
      const y = typeof trigger.value === "number" ? trigger.value : 0;
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      continue;
    }
    if (trigger.kind === "wait") {
      await page.waitForTimeout(typeof trigger.value === "number" ? trigger.value : 100);
      continue;
    }
    if (!trigger.selector) return { ok: false, skipped: true, reason: `${trigger.kind} has no selector in the scene manifest.` };
    const target = page.locator(trigger.selector).first();
    if (trigger.kind === "hover") await target.hover({ timeout: 5_000 });
    if (trigger.kind === "focus") await target.focus({ timeout: 5_000 });
    if (trigger.kind === "click") await target.click({ timeout: 5_000 });
    if (trigger.kind === "open") {
      const isOpen = await target.evaluate((element) => {
        const state = element.getAttribute("data-state");
        return element.matches(":popover-open, dialog[open], details[open]") || element.getAttribute("aria-expanded") === "true" || state === "open" || element.classList.contains("open") || element.classList.contains("active");
      }).catch(() => false);
      if (!isOpen) return { ok: false, skipped: true, reason: "Observed open state is not present in the candidate; no activation click was inferred." };
    }
  }
  return { ok: true };
}

async function openPack(packPath, prefix = "") {
  const stat = await fs.stat(packPath);
  if (stat.isDirectory()) {
    const base = path.resolve(packPath, prefix);
    return {
      async read(name) {
        const target = path.resolve(base, name);
        if (!target.startsWith(`${base}${path.sep}`)) throw new Error(`Unsafe pack path: ${name}`);
        return fs.readFile(target).catch(() => undefined);
      }
    };
  }
  const entries = unzipSync(new Uint8Array(await fs.readFile(packPath)));
  return { async read(name) { return entries[prefix ? `${prefix}/${name}` : name]; } };
}

function readJson(pack, name) {
  return pack.read(name).then((bytes) => {
    if (!bytes) throw new Error(`Pack is missing ${name}`);
    return JSON.parse(strFromU8(bytes));
  });
}

function parseArgs(values) {
  const parsed = { masks: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") parsed.help = true;
    else if (value === "--headed") parsed.headed = true;
    else if (value === "--pack") parsed.pack = values[++index];
    else if (value === "--url") parsed.url = values[++index];
    else if (value === "--route") parsed.route = values[++index];
    else if (value === "--output") parsed.output = values[++index];
    else if (value === "--mask") parsed.masks.push(values[++index]);
    else if (value === "--pixel-threshold") parsed.pixelThreshold = numberArg(values[++index], value);
    else if (value === "--color-threshold") parsed.colorThreshold = numberArg(values[++index], value);
    else if (value === "--geometry-tolerance") parsed.geometryTolerance = numberArg(values[++index], value);
    else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

function validateRouteId(value) {
  if (!/^route-[a-z0-9._-]+$/i.test(value)) throw new Error("--route requires a safe route id from route-manifest.json.");
  return value;
}

function validateCandidateUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:", "file:"].includes(url.protocol)) throw new Error("Candidate URL must use http, https, or file.");
  return url.href;
}

function numberArg(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} requires a non-negative number.`);
  return number;
}

function safeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "scene";
}

function printHelp() {
  console.log(`Design Lens rebuild verifier

Usage:
  npm run verify:rebuild -- --pack <rebuild-pack.zip|folder> --url <candidate-url> [options]

Options:
  --output <folder>              Report output directory
  --route <route-id>            Verify a route inside a site rebuild pack
  --mask <selector>              Dynamic selector to mask; repeatable
  --pixel-threshold <0..1>       Allowed mismatched-pixel ratio
  --color-threshold <0..1>       Pixelmatch color sensitivity
  --geometry-tolerance <px>      Key-element CSS pixel tolerance
  --headed                       Show the verification browser
`);
}
