import type { MotionCheckpointEvidence, RebuildSceneEvidence } from "../core/rebuild-evidence";
import { collectCanvasFrames, collectDeepCdpEvidence, type CanvasFrameCapture, type CdpProtocolEvent, type DeepCaptureNodeRequest, type RawDeepCapture } from "./deep-collector";
import type { CdpCommand } from "./cdp-session";

export type CdpViewportPlan = {
  id: "desktop" | "mobile";
  width: number;
  height: number;
  devicePixelRatio: number;
};

export type CdpStateTarget = {
  state: "hover" | "focus";
  nodeId: string;
  selector: string;
};

export type CdpScenePlan = {
  phase: "recording-start" | "recording-stop";
  viewports: CdpViewportPlan[];
  states: Array<"scroll" | "hover" | "focus">;
  stateTargets: CdpStateTarget[];
  nodes: DeepCaptureNodeRequest[];
  captureCanvas?: boolean;
};

export type CdpSceneCapture = {
  scene: RebuildSceneEvidence;
  raw?: RawDeepCapture;
  screenshotBase64?: string;
  motionCheckpoints?: Array<{ evidence: MotionCheckpointEvidence; screenshotBase64?: string }>;
  canvasFrames?: CanvasFrameCapture[];
};

const MOTION_CHECKPOINT_PROGRESS = [0.25, 0.5, 0.75] as const;
const MAX_CHECKPOINT_ANIMATIONS = 8;

export async function captureCdpScenes(
  command: CdpCommand,
  plan: CdpScenePlan,
  protocolEvents: CdpProtocolEvent[],
  setScreenshotPrivacyMask: (enabled: boolean) => Promise<void> = async () => undefined
) {
  const captures: CdpSceneCapture[] = [];
  await command("Page.enable");
  const originalMetrics = await command<Record<string, unknown>>("Page.getLayoutMetrics");
  const originalScroll = metricScroll(originalMetrics);
  try {
    for (const viewport of uniqueViewports(plan.viewports)) {
      await command("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.devicePixelRatio,
        mobile: viewport.id === "mobile"
      });
      await waitForViewportStability(command, viewport);

      if (plan.phase === "recording-start") {
        captures.push(await captureScene(command, plan.nodes, protocolEvents, viewport, "initial", setScreenshotPrivacyMask, plan.captureCanvas === true));
        if (plan.states.includes("scroll")) captures.push(await captureScrollScene(command, plan.nodes, protocolEvents, viewport, originalScroll, setScreenshotPrivacyMask, plan.captureCanvas === true));
        await scrollPage(command, originalScroll.x, originalScroll.y);
        continue;
      }

      for (const state of plan.states.filter((candidate): candidate is "hover" | "focus" => candidate === "hover" || candidate === "focus")) {
        const targets = plan.stateTargets.filter((candidate) => candidate.state === state).slice(0, 3);
        if (!targets.length) {
          captures.push(failedScene(viewport, state, `No representative ${state} target was captured.`));
          continue;
        }
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          if (target) captures.push(await captureForcedPseudoScene(command, plan.nodes, protocolEvents, viewport, state, target, index, setScreenshotPrivacyMask, index === 0, plan.captureCanvas === true));
        }
      }
    }
  } finally {
    await restorePage(command, originalScroll);
  }
  return captures;
}

async function captureForcedPseudoScene(
  command: CdpCommand,
  nodes: DeepCaptureNodeRequest[],
  protocolEvents: CdpProtocolEvent[],
  viewport: CdpViewportPlan,
  state: "hover" | "focus",
  target: CdpStateTarget,
  targetIndex: number,
  setScreenshotPrivacyMask: (enabled: boolean) => Promise<void>,
  captureMotion: boolean,
  captureCanvas: boolean
) {
  const scene = createScene(viewport, state, targetIndex);
  let targetNodeId: number | undefined;
  try {
    const documentResult = await command<{ root?: { nodeId?: number } }>("DOM.getDocument", { depth: -1, pierce: true });
    if (!documentResult.root?.nodeId) throw new Error("CDP did not return a root node");
    const query = await command<{ nodeId?: number }>("DOM.querySelector", { nodeId: documentResult.root.nodeId, selector: target.selector });
    if (!query.nodeId) throw new Error(`Selector did not match: ${target.selector}`);
    targetNodeId = query.nodeId;
    scene.selector = target.selector;
    await command("CSS.forcePseudoState", { nodeId: targetNodeId, forcedPseudoClasses: [state] });
    await waitForViewportStability(command, viewport);
    const targetNodes = [target, ...nodes.filter((node) => node.nodeId !== target.nodeId)].slice(0, 8);
    const raw = await collectDeepCdpEvidence(command, targetNodes, protocolEvents, { sceneId: scene.id, pseudoStates: [state], captureSnapshot: false });
    const canvasFrames = captureCanvas ? await captureCanvasWithPrivacyMask(command, scene.id, setScreenshotPrivacyMask) : [];
    const screenshot = await captureMaskedScreenshot(command, setScreenshotPrivacyMask);
    if (!screenshot.data) throw new Error("CDP screenshot returned no data");
    const motionCheckpoints = captureMotion ? await captureMotionCheckpointFrames(command, raw, scene, setScreenshotPrivacyMask) : [];
    return { scene: { ...scene, scroll: sceneScroll(raw), capturedAt: new Date().toISOString(), status: "captured" as const }, raw, screenshotBase64: screenshot.data, motionCheckpoints, ...(canvasFrames.length ? { canvasFrames } : {}) };
  } catch (error) {
    if (error instanceof AnimationRestoreError) throw error;
    return { scene: { ...scene, status: "failed" as const, error: error instanceof Error ? error.message : String(error) } };
  } finally {
    if (targetNodeId) await command("CSS.forcePseudoState", { nodeId: targetNodeId, forcedPseudoClasses: [] });
  }
}

async function captureScrollScene(
  command: CdpCommand,
  nodes: DeepCaptureNodeRequest[],
  protocolEvents: CdpProtocolEvent[],
  viewport: CdpViewportPlan,
  originalScroll: { x: number; y: number },
  setScreenshotPrivacyMask: (enabled: boolean) => Promise<void>,
  captureCanvas: boolean
): Promise<CdpSceneCapture> {
  const scene = createScrollScene(viewport);
  const metrics = await command<Record<string, unknown>>("Page.getLayoutMetrics");
  const contentHeight = metricContentHeight(metrics);
  const maxScrollY = Math.max(0, contentHeight - viewport.height);
  if (maxScrollY < 1) return { scene: { ...scene, status: "not-applicable" } };
  const targetY = Math.min(maxScrollY, Math.max(1, Math.round(viewport.height * 0.85)));
  let didScroll = false;
  try {
    await scrollPage(command, 0, targetY);
    didScroll = true;
    await waitForViewportStability(command, viewport);
    const raw = await collectDeepCdpEvidence(command, nodes.slice(0, 12), protocolEvents, { sceneId: scene.id, captureSnapshot: false });
    const canvasFrames = captureCanvas ? await captureCanvasWithPrivacyMask(command, scene.id, setScreenshotPrivacyMask) : [];
    const screenshot = await captureMaskedScreenshot(command, setScreenshotPrivacyMask);
    if (!screenshot.data) throw new Error("CDP screenshot returned no data");
    return { scene: { ...scene, scroll: sceneScroll(raw), capturedAt: new Date().toISOString(), status: "captured" }, raw, screenshotBase64: screenshot.data, ...(canvasFrames.length ? { canvasFrames } : {}) };
  } catch (error) {
    return { scene: { ...scene, status: "failed", error: error instanceof Error ? error.message : String(error) } };
  } finally {
    if (didScroll) await scrollPage(command, originalScroll.x, originalScroll.y);
  }
}

async function captureScene(
  command: CdpCommand,
  nodes: DeepCaptureNodeRequest[],
  protocolEvents: CdpProtocolEvent[],
  viewport: CdpViewportPlan,
  state: "initial",
  setScreenshotPrivacyMask: (enabled: boolean) => Promise<void>,
  captureCanvas: boolean
) {
  const scene = createScene(viewport, state);
  try {
    const raw = await collectDeepCdpEvidence(command, nodes, protocolEvents, { sceneId: scene.id, captureSnapshot: true });
    const canvasFrames = captureCanvas ? await captureCanvasWithPrivacyMask(command, scene.id, setScreenshotPrivacyMask) : [];
    const screenshot = await captureMaskedScreenshot(command, setScreenshotPrivacyMask);
    if (!screenshot.data) throw new Error("CDP screenshot returned no data");
    const motionCheckpoints = await captureMotionCheckpointFrames(command, raw, scene, setScreenshotPrivacyMask);
    return { scene: { ...scene, scroll: sceneScroll(raw), capturedAt: new Date().toISOString(), status: "captured" as const }, raw, screenshotBase64: screenshot.data, motionCheckpoints, ...(canvasFrames.length ? { canvasFrames } : {}) };
  } catch (error) {
    if (error instanceof AnimationRestoreError) throw error;
    return { scene: { ...scene, status: "failed" as const, error: error instanceof Error ? error.message : String(error) } };
  }
}

async function captureMaskedScreenshot(command: CdpCommand, setMask: (enabled: boolean) => Promise<void>) {
  await setMask(true);
  try {
    return await command<{ data?: string }>("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  } finally {
    await setMask(false);
  }
}

async function captureCanvasWithPrivacyMask(command: CdpCommand, sceneId: string, setMask: (enabled: boolean) => Promise<void>) {
  await setMask(true);
  try {
    return await collectCanvasFrames(command, sceneId);
  } finally {
    await setMask(false);
  }
}

async function captureMotionCheckpointFrames(
  command: CdpCommand,
  raw: RawDeepCapture,
  scene: RebuildSceneEvidence,
  setScreenshotPrivacyMask: (enabled: boolean) => Promise<void>
) {
  const eligible = raw.animations.filter((animation) =>
    animation.playState === "running"
    && animation.durationMs >= 120
    && animation.durationMs <= 10_000
    && animation.iterationCount === 1
    && Boolean(animation.selector)
  ).slice(0, MAX_CHECKPOINT_ANIMATIONS);
  const maskNodeIds = Array.from(new Set(raw.animations.filter((animation) => !eligible.includes(animation)).flatMap((animation) => animation.nodeId ? [animation.nodeId] : [])));
  const states = [];
  for (const animation of eligible) {
    try {
      const result = await command<{ currentTime?: number }>("Animation.getCurrentTime", { id: animation.id });
      if (typeof result.currentTime === "number" && Number.isFinite(result.currentTime)) states.push({ animation, currentTime: result.currentTime });
    } catch {
      // Animation may have completed between event collection and checkpoint setup.
    }
  }
  if (!states.length) {
    return [{
      evidence: {
        id: `${scene.id}-motion-not-applicable`,
        sceneId: scene.id,
        progress: 0.5,
        animations: [],
        maskNodeIds,
        status: "not-applicable" as const,
        error: "No finite, target-mapped running CSS/WAAPI animation could be safely seeked."
      }
    }];
  }

  const animationIds = states.map((state) => state.animation.id);
  await command("Animation.setPaused", { animations: animationIds, paused: true });
  const checkpoints: Array<{ evidence: MotionCheckpointEvidence; screenshotBase64?: string }> = [];
  try {
    for (const progress of MOTION_CHECKPOINT_PROGRESS) {
      const animations = states.map(({ animation }) => ({
        animationId: animation.id,
        name: animation.name,
        ...(animation.nodeId ? { nodeId: animation.nodeId } : {}),
        ...(animation.selector ? { selector: animation.selector } : {}),
        durationMs: animation.durationMs,
        currentTimeMs: Math.round(animation.durationMs * progress)
      }));
      const evidence: MotionCheckpointEvidence = {
        id: `${scene.id}-motion-${Math.round(progress * 100)}`,
        sceneId: scene.id,
        progress,
        animations,
        maskNodeIds,
        status: "failed"
      };
      try {
        for (const animation of animations) {
          await command("Animation.seekAnimations", { animations: [animation.animationId], currentTime: animation.currentTimeMs });
        }
        await delay(40);
        const screenshot = await captureMaskedScreenshot(command, setScreenshotPrivacyMask);
        if (!screenshot.data) throw new Error("CDP motion checkpoint screenshot returned no data");
        checkpoints.push({ evidence: { ...evidence, capturedAt: new Date().toISOString(), status: "captured" }, screenshotBase64: screenshot.data });
      } catch (error) {
        checkpoints.push({ evidence: { ...evidence, status: "failed", error: error instanceof Error ? error.message : String(error) } });
      }
    }
  } finally {
    try {
      for (const state of states) {
        await command("Animation.seekAnimations", { animations: [state.animation.id], currentTime: state.currentTime });
      }
      await command("Animation.setPaused", { animations: animationIds, paused: false });
    } catch (error) {
      throw new AnimationRestoreError(error instanceof Error ? error.message : String(error));
    }
  }
  return checkpoints;
}

class AnimationRestoreError extends Error {
  constructor(message: string) {
    super(`Animation state restoration failed: ${message}`);
    this.name = "AnimationRestoreError";
  }
}

function createScene(viewport: CdpViewportPlan, state: "initial" | "hover" | "focus", targetIndex = 0): RebuildSceneEvidence {
  return {
    id: `cdp-${viewport.id}-${state}${state === "initial" ? "" : `-${targetIndex + 1}`}`,
    name: state === "initial" ? `${viewport.id} initial baseline` : `${viewport.id} forced ${state} state ${targetIndex + 1}`,
    phase: state === "initial" ? "responsive-initial" : state === "hover" ? "forced-hover" : "forced-focus",
    viewport: { width: viewport.width, height: viewport.height, devicePixelRatio: viewport.devicePixelRatio },
    scroll: { x: 0, y: 0 },
    status: "failed"
  };
}

function createScrollScene(viewport: CdpViewportPlan): RebuildSceneEvidence {
  return {
    id: `cdp-${viewport.id}-scroll`,
    name: `${viewport.id} scroll baseline`,
    phase: "responsive-scroll",
    viewport: { width: viewport.width, height: viewport.height, devicePixelRatio: viewport.devicePixelRatio },
    scroll: { x: 0, y: 0 },
    status: "failed"
  };
}

function failedScene(viewport: CdpViewportPlan, state: "hover" | "focus", error: string): CdpSceneCapture {
  return { scene: { ...createScene(viewport, state), error } };
}

function sceneScroll(raw: RawDeepCapture) {
  return { x: Math.round(raw.page.layoutViewport?.pageX ?? 0), y: Math.round(raw.page.layoutViewport?.pageY ?? 0) };
}

async function restorePage(command: CdpCommand, scroll: { x: number; y: number }) {
  let error: unknown;
  try {
    await scrollPage(command, scroll.x, scroll.y);
  } catch (restoreError) {
    error = restoreError;
  }
  try {
    await command("Emulation.clearDeviceMetricsOverride");
  } catch (restoreError) {
    error ??= restoreError;
  }
  try {
    await scrollPage(command, scroll.x, scroll.y);
  } catch (restoreError) {
    error ??= restoreError;
  }
  if (error) throw error;
}

async function scrollPage(command: CdpCommand, x: number, y: number) {
  const result = await command<{ exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression: `window.scrollTo(${Math.round(x)}, ${Math.round(y)})`,
    returnByValue: true,
    awaitPromise: false,
    userGesture: false
  });
  if (result.exceptionDetails) throw new Error("The page rejected the requested scroll position");
}

function metricScroll(metrics: Record<string, unknown>) {
  const viewport = asRecord(metrics.cssLayoutViewport) ?? asRecord(metrics.layoutViewport);
  return { x: numberValue(viewport?.pageX), y: numberValue(viewport?.pageY) };
}

function metricContentHeight(metrics: Record<string, unknown>) {
  const size = asRecord(metrics.cssContentSize) ?? asRecord(metrics.contentSize);
  return numberValue(size?.height);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function waitForViewportStability(command: CdpCommand, viewport: CdpViewportPlan) {
  let previous = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const metrics = await command<Record<string, unknown>>("Page.getLayoutMetrics");
    const current = JSON.stringify(metrics.cssLayoutViewport ?? metrics.layoutViewport ?? { width: viewport.width, height: viewport.height });
    if (current === previous) return;
    previous = current;
    await delay(120);
  }
}

function uniqueViewports(viewports: CdpViewportPlan[]) {
  const seen = new Set<string>();
  return viewports.filter((viewport) => {
    const key = `${viewport.id}:${viewport.width}x${viewport.height}@${viewport.devicePixelRatio}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return viewport.width > 0 && viewport.height > 0 && viewport.devicePixelRatio > 0;
  }).slice(0, 2);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
