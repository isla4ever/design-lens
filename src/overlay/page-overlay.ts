import { withLocalizedAnalysis } from "../analyzer/core/analysis";
import { createInteractionTimelineRecorder, mergeInteractionTimelines } from "../analyzer/timeline/interaction-timeline";
import { collectSceneScreenshots, type ScreenshotCaptureRequest } from "../capture-v2/browser/scene-screenshot-collector";
import { setScreenshotPrivacyMask } from "../capture-v2/browser/screenshot-privacy-mask";
import type { DeepCollectorEvidence, RebuildArtifactReference, RebuildEvidence, RebuildSceneEvidence } from "../capture-v2/core/rebuild-evidence";
import { startRebuildEventRecorder, type RebuildEventRecorder } from "../capture-v2/rrweb/rrweb-recorder";
import { DEFAULT_DESIGN_BRIEF, type CaptureMode, type RebuildBrief } from "../shared/design-brief";
import { DEFAULT_LOCALE, messages, type Locale } from "../shared/i18n";
import { getStoredTheme, type ThemeMode } from "../shared/theme-storage";
import { getStoredLocale } from "../shared/locale-storage";
import type { ArtifactStorageRequest, ArtifactStorageResponse, CaptureResponse, DeepCaptureRequest, DeepCaptureResponse, GuidedCaptureTask, ScanMode } from "../shared/messages";
import type { DesignCapture, InteractionTimeline } from "../shared/schema";
import { runSmartCapture, type SmartCaptureExecutionContext } from "../smart-capture/orchestrator";
import type { SmartCaptureStatus } from "../smart-capture/types";
import { createGuidedTaskObserver, type GuidedTaskEvidence } from "../smart-capture/guided-task-observer";
import {
  buildCaptureCardMarkup,
  buildErrorMarkup,
  buildIdleMarkup,
  buildLoadingMarkup,
  buildOverlayMarkup,
  buildRecorderMarkup,
  buildSmartCaptureMarkup
} from "./page-overlay-view";

type OverlayActions = {
  scanPage: () => Promise<CaptureResponse>;
  pickElement: () => Promise<CaptureResponse>;
  captureCompleted?: (capture: DesignCapture) => Promise<void> | void;
};

export function createPageOverlay(actions: OverlayActions) {
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let lastCapture: DesignCapture | null = null;
  let locale: Locale = DEFAULT_LOCALE;
  let theme: ThemeMode = "dark";
  let compactMode = false;
  let recordingStartedAt = 0;
  let dismissTimer: number | null = null;
  let recordedCaptures: DesignCapture[] = [];
  let recordingInFlight = false;
  let recordingPreparation: Promise<void> | null = null;
  let hiddenForFlow = false;
  let timelineRecorder: ReturnType<typeof createInteractionTimelineRecorder> | null = null;
  let recordedTimeline: InteractionTimeline | undefined;
  let recordingMode: CaptureMode = "reference";
  let rebuildPlan: RebuildBrief = DEFAULT_DESIGN_BRIEF.rebuild;
  let smartCaptureController: AbortController | null = null;
  let smartCapturePromise: Promise<DesignCapture> | null = null;
  let smartCaptureStatus: SmartCaptureStatus | undefined;
  let guidedTask: GuidedCaptureTask | undefined;
  let guidedTaskObserver: ReturnType<typeof createGuidedTaskObserver> | null = null;
  let guidedCaptureInFlight = false;
  let rebuildRecording: {
    recordingId: string;
    storageProjectId: string;
    startedAt: string;
    eventRecorder: RebuildEventRecorder | null;
    scenes: RebuildSceneEvidence[];
    artifacts: RebuildArtifactReference[];
    deepCollectors: DeepCollectorEvidence[];
    errors: string[];
  } | null = null;

  async function toggle(nextLocale?: Locale) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    locale = nextLocale ?? (await getStoredLocale());
    theme = await getStoredTheme();

    if (host) {
      host.remove();
      host = null;
      shadow = null;
      return;
    }

    await open(locale);
  }

  async function open(nextLocale?: Locale) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    locale = nextLocale ?? (await getStoredLocale());
    theme = await getStoredTheme();
    compactMode = true;

    if (host) {
      renderIdle();
      return;
    }

    host = document.createElement("div");
    host.id = "design-lens-overlay-root";
    syncHostPosition();
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
    renderIdle();
  }

  async function ensureHost(nextLocale?: Locale) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    locale = nextLocale ?? (await getStoredLocale());
    theme = await getStoredTheme();
    compactMode = true;
    if (host) return;
    host = document.createElement("div");
    host.id = "design-lens-overlay-root";
    syncHostPosition();
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
  }

  async function openAndRun(action: "scan" | "pick", nextLocale?: Locale, scanMode: ScanMode = "instant", persistCapture = true) {
    await ensureHost(nextLocale);
    return run(action, scanMode, persistCapture);
  }

  async function openRecorder(nextLocale?: Locale, mode: CaptureMode = "reference", nextRebuildPlan?: RebuildBrief, nextGuidedTask?: GuidedCaptureTask) {
    await ensureHost(nextLocale);
    recordingMode = mode;
    if (nextRebuildPlan) rebuildPlan = nextRebuildPlan;
    guidedTask = nextGuidedTask;
    smartCaptureStatus = undefined;
    compactMode = true;
    syncHostPosition();
    setFlowHidden(false);
    renderRecorder(false);
    if (guidedTask) await startRecording();
  }

  async function beginRecord(nextLocale?: Locale, mode: CaptureMode = "reference", nextRebuildPlan?: RebuildBrief) {
    locale = nextLocale ?? locale;
    recordingMode = mode;
    if (nextRebuildPlan) rebuildPlan = nextRebuildPlan;
    guidedTask = undefined;
    smartCaptureStatus = undefined;
    theme = await getStoredTheme();
    if (!host) {
      host = document.createElement("div");
      host.id = "design-lens-overlay-root";
      compactMode = true;
      syncHostPosition();
      shadow = host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }
    await startRecording();
  }

  async function beginSmartCapture(nextLocale?: Locale, mode: CaptureMode = "reference", nextRebuildPlan?: RebuildBrief) {
    locale = nextLocale ?? locale;
    recordingMode = mode;
    if (nextRebuildPlan) rebuildPlan = nextRebuildPlan;
    guidedTask = undefined;
    if (recordingMode === "rebuild" && !rebuildPlan.authorizationConfirmed) {
      throw new Error(locale === "zh" ? "请先确认重建和证据采集权限。" : "Confirm rebuild and evidence-capture permission first.");
    }
    theme = await getStoredTheme();
    await ensureHost(locale);
    if (smartCapturePromise || recordingStartedAt) return;

    smartCaptureController = new AbortController();
    smartCaptureStatus = { phase: "preflight", mode: recordingMode, startedAt: new Date().toISOString(), degraded: false };
    const controller = smartCaptureController;
    const promise = runSmartCapture({
      doc: document,
      win: window,
      mode: recordingMode,
      ...(recordingMode === "rebuild" ? { rebuild: rebuildPlan } : {}),
      signal: controller.signal,
      startRecording: async (context) => {
        await startRecording(context);
        if (!recordingStartedAt) throw new Error(locale === "zh" ? "智能捕获未能启动录制器。" : "Smart Capture could not start the recorder.");
      },
      finishRecording: (context) => stopRecording({ keepMinimal: true, persistCapture: false }, context),
      onStatus: (status) => {
        smartCaptureStatus = status;
        if (host && status.phase !== "complete" && status.phase !== "degraded" && status.phase !== "cancelled") renderSmartCapture();
      }
    });
    smartCapturePromise = promise;
    void promise.then(async (capture) => {
      lastCapture = capture;
      await notifyCapture(capture);
      renderDone();
      dismissSoon(5600);
    }).catch((error) => {
      if (controller.signal.aborted) {
        smartCaptureStatus = { phase: "cancelled", mode: recordingMode, startedAt: smartCaptureStatus?.startedAt ?? new Date().toISOString(), degraded: false };
        renderSmartCapture();
        dismissSoon(3200);
        return;
      }
      renderError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (smartCapturePromise === promise) smartCapturePromise = null;
      if (smartCaptureController === controller) smartCaptureController = null;
    });
  }

  async function finishRecord() {
    if (smartCapturePromise) {
      const activeSmartCapture = smartCapturePromise;
      const controller = smartCaptureController;
      controller?.abort("user-stop");
      try {
        return await activeSmartCapture;
      } catch (error) {
        if (controller?.signal.aborted) return lastCapture ?? getEmptyCapture();
        throw error;
      }
    }
    if (!recordingStartedAt) return lastCapture ?? getEmptyCapture();
    const capture = await stopRecording({ keepMinimal: true });
    return capture;
  }

  function getRecordStatus() {
    return {
      isRecording: Boolean(recordingStartedAt || smartCapturePromise),
      capture: lastCapture ?? getEmptyCapture(),
      smartCapture: smartCaptureStatus
    };
  }

  function syncHostPosition() {
    if (!host) return;
    host.style.cssText = `position:fixed;left:18px;bottom:18px;z-index:2147483647;pointer-events:${hiddenForFlow ? "none" : "auto"}`;
  }

  function setFlowHidden(isHidden: boolean) {
    hiddenForFlow = isHidden;
    if (!host) return;
    host.style.opacity = isHidden ? "0" : "1";
    host.style.transform = isHidden ? "translateY(10px) scale(.98)" : "";
    host.style.pointerEvents = isHidden ? "none" : "auto";
    host.setAttribute("aria-hidden", isHidden ? "true" : "false");
  }

  function setLocale(nextLocale: Locale) {
    locale = nextLocale;
    if (!host) return;

    if (smartCapturePromise) renderSmartCapture();
    else if (recordingStartedAt) renderRecorder(true);
    else renderIdle();
  }

  function setTheme(nextTheme: ThemeMode) {
    theme = nextTheme;
    if (!host) return;
    if (smartCapturePromise) renderSmartCapture();
    else if (recordingStartedAt) renderRecorder(true);
    else renderIdle();
  }

  function getLastCapture() {
    return lastCapture;
  }

  function getEmptyCapture(): DesignCapture {
    return {
      scope: "page",
      page: {
        title: document.title || "Untitled page",
        url: location.href,
        capturedAt: new Date().toISOString()
      },
      viewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio
      },
      tokens: {
        cssVariables: [],
        colors: [],
        backgrounds: [],
        spacing: [],
        radii: [],
        shadows: [],
        typography: []
      },
      layout: [],
      layoutProfile: {
        density: "balanced",
        composition: "standard document composition",
        dominantDisplays: [],
        dominantGaps: [],
        alignment: [],
        structure: [],
        cadence: [],
        emphasis: []
      },
      components: [],
      motion: [],
      interactions: [],
      evidence: [],
      interactionTimeline: undefined,
      analysis: {
        character: messages[locale].emptyCharacter,
        tags: [],
        recommendations: []
      }
    };
  }

  async function run(action: "scan" | "pick", scanMode: ScanMode = "instant", persistCapture = true) {
    compactMode = true;
    syncHostPosition();
    if (action === "pick") {
      setFlowHidden(true);
    } else {
      renderLoading(action, scanMode);
    }
    let response: CaptureResponse;
    try {
      if (action === "scan") await waitForScanTiming(scanMode);
      response = action === "scan" ? await actions.scanPage() : await actions.pickElement();
    } catch (error) {
      renderError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setFlowHidden(false);
      compactMode = true;
      syncHostPosition();
    }

    if (!response.ok) {
      renderError(response.error);
      return response;
    }

    lastCapture = response.capture;
    if (persistCapture) await notifyCapture(lastCapture);
    renderDone();
    dismissSoon(5600);
    return response;
  }

  async function startRecording(context?: SmartCaptureExecutionContext) {
    if (recordingStartedAt) {
      if (smartCapturePromise) renderSmartCapture();
      else renderRecorder(true);
      return;
    }
    if (recordingMode === "rebuild" && !rebuildPlan.authorizationConfirmed) {
      const error = locale === "zh" ? "请先在插件面板确认重建和证据采集权限。" : "Confirm rebuild and evidence-capture permission in the extension popup first.";
      renderError(error);
      throw new Error(error);
    }
    recordingPreparation = prepareRecording(context);
    try {
      await recordingPreparation;
    } catch (error) {
      resetRecordingRuntime();
      renderError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      recordingPreparation = null;
    }
  }

  async function prepareRecording(context?: SmartCaptureExecutionContext) {
    recordingStartedAt = performance.now();
    recordedCaptures = [];
    recordedTimeline = undefined;
    rebuildRecording = null;
    setFlowHidden(false);
    if (smartCapturePromise) renderSmartCapture();
    else renderRecorder(true);
    if (recordingMode === "rebuild") {
      await startRebuildRecording(context);
    }
    if (!shouldSkipAdvancedCapture(context)) {
      timelineRecorder = createInteractionTimelineRecorder(document, window);
      timelineRecorder.start();
    }
    if (shouldStopPageWork(context)) {
      recordedCaptures = [getEmptyCapture()];
      return;
    }
    await sampleRecording(context);
    if (recordingMode === "rebuild" && !shouldSkipAdvancedCapture(context)) {
      const initialCapture = recordedCaptures.at(-1);
      if (initialCapture && !guidedTask) await collectRecordingStartDeepEvidence(initialCapture);
      await startRebuildEventStream();
    }
    if (guidedTask) startGuidedTaskObservation();
  }

  async function stopRecording(options: { keepMinimal?: boolean; persistCapture?: boolean } = {}, context?: SmartCaptureExecutionContext) {
    if (recordingPreparation) await waitForPreparation(recordingPreparation, context);
    if (!recordingStartedAt) return lastCapture ?? getEmptyCapture();
    try {
      guidedTaskObserver?.stop();
      guidedTaskObserver = null;
      setFlowHidden(false);
      renderLoading("scan", "recorded");
      recordedTimeline = timelineRecorder?.stop();
      timelineRecorder = null;
      const rebuildEvidence = recordingMode === "rebuild" ? await finishRebuildRecording(context) : undefined;
      if (!shouldStopPageWork(context)) await sampleRecording(context);
      const mergedCapture = mergeCaptures(recordedCaptures);
      if (!mergedCapture) {
        const response = shouldStopPageWork(context)
          ? { ok: true as const, capture: lastCapture ?? getEmptyCapture() }
          : await actions.scanPage();
        if (!response.ok) throw new Error(response.error);
        if (rebuildEvidence) response.capture.rebuildEvidence = rebuildEvidence;
        if (rebuildEvidence && !guidedTask) addObservedOpenScene(response.capture);
        if (rebuildEvidence && !guidedTask && !shouldSkipAdvancedCapture(context)) await collectDeepEvidence(response.capture, "recording-stop");
        lastCapture = response.capture;
        if (options.persistCapture !== false) await notifyCapture(lastCapture);
        renderDone();
        dismissSoon(options.keepMinimal ? 5600 : 7200);
        return response.capture;
      }
      mergedCapture.interactionTimeline = mergeInteractionTimelines([mergedCapture.interactionTimeline, recordedTimeline]);
      if (rebuildEvidence) mergedCapture.rebuildEvidence = rebuildEvidence;
      if (rebuildEvidence && !guidedTask) addObservedOpenScene(mergedCapture);
      if (rebuildEvidence && !guidedTask && !shouldSkipAdvancedCapture(context)) await collectDeepEvidence(mergedCapture, "recording-stop");
      lastCapture = mergedCapture;
      if (options.persistCapture !== false) await notifyCapture(lastCapture);
      renderDone();
      dismissSoon(options.keepMinimal ? 5600 : 7200);
      return mergedCapture;
    } catch (error) {
      renderError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      resetRecordingRuntime();
    }
  }

  function resetRecordingRuntime() {
    try {
      guidedTaskObserver?.stop();
    } catch {
      // Recovery must continue even when observer cleanup is already broken.
    }
    guidedTaskObserver = null;
    try {
      timelineRecorder?.stop();
    } catch {
      // Recovery must continue even when a recorder is already broken.
    }
    try {
      rebuildRecording?.eventRecorder?.stop();
    } catch {
      // Recovery must continue even when an event recorder is already broken.
    }
    timelineRecorder = null;
    rebuildRecording = null;
    recordedCaptures = [];
    recordedTimeline = undefined;
    recordingStartedAt = 0;
    guidedTask = undefined;
    setCaptureSurfacesHidden(false);
  }

  async function startRebuildRecording(context?: SmartCaptureExecutionContext) {
    const recordingId = createRecordingId();
    const storageProjectId = `rebuild-${recordingId}`;
    rebuildRecording = {
      recordingId,
      storageProjectId,
      startedAt: new Date().toISOString(),
      eventRecorder: null,
      scenes: [],
      artifacts: [],
      deepCollectors: [],
      errors: []
    };

    if (guidedTask || shouldStopPageWork(context)) return;
    try {
      const initial = await collectSceneScreenshots({
        win: window,
        doc: document,
        recordingId,
        storageProjectId,
        phase: "recording-start",
        positions: [window.scrollY],
        ...(context ? {
          signal: context.signal,
          maxSegments: 1,
          maxDurationMs: remainingCaptureMs(context, 2_500)
        } : {}),
        eventCount: () => rebuildRecording?.eventRecorder?.eventCount() ?? 0,
        setCaptureUiHidden: setCaptureSurfacesHidden,
        captureVisibleTab: captureAndStoreVisibleTab
      });
      rebuildRecording.scenes.push(...initial.scenes);
      rebuildRecording.artifacts.push(...initial.artifacts);
      for (const scene of initial.scenes) if (scene.error) rebuildRecording.errors.push(`screenshot: ${scene.error}`);
    } catch (error) {
      rebuildRecording.errors.push(`initial screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function startRebuildEventStream() {
    if (!rebuildRecording) return;
    try {
      rebuildRecording.eventRecorder = await startRebuildEventRecorder();
    } catch (error) {
      rebuildRecording.errors.push(`rrweb: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function finishRebuildRecording(context?: SmartCaptureExecutionContext): Promise<RebuildEvidence | undefined> {
    const recording = rebuildRecording;
    if (!recording) return undefined;
    const endedAt = new Date().toISOString();
    let rrweb: RebuildEvidence["rrweb"];
    let rrwebEventCount = 0;

    if (recording.eventRecorder) {
      const snapshot = recording.eventRecorder.stop();
      rrwebEventCount = snapshot.events.length;
      if (shouldStopPageWork(context)) {
        recording.errors.push("rrweb storage skipped after Smart Capture safety stop");
      } else try {
        rrwebEventCount = snapshot.events.length;
        const artifact = await storeRrwebEvents({
          version: 1,
          privacy: { maskAllInputs: true, recordCanvas: rebuildPlan.captureCanvas, recordCrossOriginIframes: false },
          events: snapshot.events
        }, recording.storageProjectId, endedAt);
        recording.artifacts.push(artifact);
        rrweb = {
          artifact,
          eventCount: snapshot.events.length,
          truncated: snapshot.truncated,
          startedAt: recording.startedAt,
          endedAt
        };
      } catch (error) {
        recording.errors.push(`rrweb storage: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let baseline: Awaited<ReturnType<typeof collectSceneScreenshots>> | undefined;
    if (!guidedTask && !shouldStopPageWork(context)) {
      try {
        baseline = await collectSceneScreenshots({
          win: window,
          doc: document,
          recordingId: recording.recordingId,
          storageProjectId: recording.storageProjectId,
          phase: "page-baseline",
          ...(context ? {
            positions: [window.scrollY],
            maxSegments: 1,
            signal: context.signal,
            maxDurationMs: remainingCaptureMs(context, 2_500)
          } : {}),
          eventCount: () => rrwebEventCount,
          setCaptureUiHidden: setCaptureSurfacesHidden,
          captureVisibleTab: captureAndStoreVisibleTab
        });
        recording.scenes.push(...baseline.scenes);
        recording.artifacts.push(...baseline.artifacts);
        for (const scene of baseline.scenes) if (scene.error) recording.errors.push(`screenshot: ${scene.error}`);
      } catch (error) {
        recording.errors.push(`page screenshots: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const documentElement = document.documentElement;
    const body = document.body;
    const lastDeepCollector = recording.deepCollectors.at(-1);
    const evidence: RebuildEvidence = {
      version: 1,
      recordingId: recording.recordingId,
      storageProjectId: recording.storageProjectId,
      privacy: { maskAllInputs: true, recordCanvas: rebuildPlan.captureCanvas, recordCrossOriginIframes: false },
      ...(rrweb ? { rrweb } : {}),
      ...(lastDeepCollector ? {
        deepCollector: lastDeepCollector,
        deepCollectors: recording.deepCollectors.slice()
      } : {}),
      ...(lastDeepCollector?.canvasFrames?.length ? { canvasFrames: lastDeepCollector.canvasFrames } : {}),
      scenes: recording.scenes,
      artifacts: recording.artifacts,
      document: {
        width: baseline?.documentWidth ?? Math.max(innerWidth, documentElement.scrollWidth, body?.scrollWidth ?? 0),
        height: baseline?.documentHeight ?? Math.max(innerHeight, documentElement.scrollHeight, body?.scrollHeight ?? 0),
        maxCapturedScrollY: baseline?.maxCapturedScrollY ?? Math.max(0, ...recording.scenes.map((scene) => scene.scroll.y)),
        truncated: baseline?.truncated ?? true
      },
      request: {
        viewports: rebuildPlan.viewports.slice(),
        states: rebuildPlan.states.slice()
      },
      errors: Array.from(new Set(recording.errors))
    };
    rebuildRecording = null;
    return evidence;
  }

  async function captureAndStoreVisibleTab(request: ScreenshotCaptureRequest) {
    const response = await browser.runtime.sendMessage({ type: "DESIGN_LENS_CAPTURE_VISIBLE_TAB", ...request } satisfies ArtifactStorageRequest) as ArtifactStorageResponse;
    if (!response.ok) throw new Error(response.error);
    return response.artifact;
  }

  async function storeRrwebEvents(payload: unknown, storageProjectId: string, createdAt: string) {
    const request: ArtifactStorageRequest = {
      type: "DESIGN_LENS_STORE_RRWEB_ARTIFACT",
      storageProjectId,
      artifactId: "rrweb-events",
      name: "recordings/rrweb-events.json",
      payload,
      createdAt
    };
    const response = await browser.runtime.sendMessage(request) as ArtifactStorageResponse;
    if (!response.ok) throw new Error(response.error);
    return response.artifact;
  }

  async function collectRecordingStartDeepEvidence(capture: DesignCapture) {
    const recording = rebuildRecording;
    if (!recording) return;
    const evidence = await requestDeepEvidence(capture, recording.storageProjectId, "recording-start");
    if (!evidence) return;
    recording.deepCollectors.push(evidence);
    recording.scenes.push(...evidence.scenes);
    recording.artifacts = mergeByKey([...recording.artifacts, ...evidence.artifacts], (artifact) => artifact.id);
    recording.errors.push(...evidence.errors.map((error) => `deep collector: ${error}`));
  }

  async function collectDeepEvidence(capture: DesignCapture, phase: "recording-start" | "recording-stop") {
    const rebuild = capture.rebuildEvidence;
    if (!rebuild) return;
    const evidence = await requestDeepEvidence(capture, rebuild.storageProjectId, phase);
    if (!evidence) return;
    rebuild.deepCollector = evidence;
    rebuild.deepCollectors = [...(rebuild.deepCollectors ?? []), evidence];
    rebuild.scenes = mergeByKey([...rebuild.scenes, ...evidence.scenes], (scene) => scene.id);
    rebuild.artifacts = mergeByKey([...rebuild.artifacts, ...evidence.artifacts], (artifact) => artifact.id);
    rebuild.errors.push(...evidence.errors.map((error) => `deep collector: ${error}`));
  }

  async function requestDeepEvidence(capture: DesignCapture, storageProjectId: string, phase: "recording-start" | "recording-stop") {
    const scene = (capture.rebuildEvidence?.scenes ?? rebuildRecording?.scenes ?? [])
      .filter((candidate) => candidate.status === "captured")
      .sort((left, right) => Math.abs(left.scroll.y - window.scrollY) - Math.abs(right.scroll.y - window.scrollY))[0];
    const fallbackSceneId = scene?.id ?? `cdp-${phase}`;
    const states = phase === "recording-stop"
      ? rebuildPlan.states.filter((state): state is "hover" | "focus" => state === "hover" || state === "focus")
      : rebuildPlan.states.filter((state): state is "scroll" => state === "scroll");
    if (phase === "recording-stop" && !states.length) return;
    const request: DeepCaptureRequest = {
      type: "DESIGN_LENS_COLLECT_DEEP_EVIDENCE",
      storageProjectId,
      sceneId: fallbackSceneId,
      phase,
      viewports: buildDeepViewportPlan(capture),
      states,
      captureCanvas: recordingMode === "rebuild" && rebuildPlan.captureCanvas,
      stateTargets: states.flatMap((state) => state === "scroll" ? [] : selectStateTargets(capture, state).map((target) => ({ state, nodeId: target.id, selector: target.selector }))),
      nodes: capture.components.slice(0, 24).map((component) => ({ nodeId: component.id, selector: component.selector })),
      createdAt: new Date().toISOString()
    };
    try {
      setFlowHidden(true);
      const response = await browser.runtime.sendMessage(request) as DeepCaptureResponse;
      if (!response.ok) {
        const target = capture.rebuildEvidence ?? rebuildRecording;
        target?.errors.push(`deep collector: ${response.error}`);
        return;
      }
      if (!response.available) return;
      return response.evidence;
    } catch (error) {
      const target = capture.rebuildEvidence ?? rebuildRecording;
      target?.errors.push(`deep collector: ${error instanceof Error ? error.message : String(error)}`);
      return;
    } finally {
      setFlowHidden(false);
    }
  }

  function setCaptureSurfacesHidden(hidden: boolean) {
    setFlowHidden(hidden);
    setScreenshotPrivacyMask(document, hidden);
  }

  function setCapturePrivacyMask(enabled: boolean) {
    setScreenshotPrivacyMask(document, enabled);
  }

  function buildDeepViewportPlan(capture: DesignCapture): DeepCaptureRequest["viewports"] {
    return rebuildPlan.viewports.map((viewport) => {
      if (viewport === "mobile") {
        return capture.viewport.width < 768
          ? { id: "mobile" as const, width: capture.viewport.width, height: capture.viewport.height, devicePixelRatio: capture.viewport.devicePixelRatio }
          : { id: "mobile" as const, width: 390, height: 844, devicePixelRatio: 2 };
      }
      return capture.viewport.width >= 768
        ? { id: "desktop" as const, width: capture.viewport.width, height: capture.viewport.height, devicePixelRatio: capture.viewport.devicePixelRatio }
        : { id: "desktop" as const, width: 1440, height: 900, devicePixelRatio: 1 };
    });
  }

  function selectStateTargets(capture: DesignCapture, state: "hover" | "focus") {
    const timelineSelectors = state === "focus"
      ? (capture.interactionTimeline?.focusSamples ?? []).filter((sample) => sample.type === "in").map((sample) => sample.targetSelector)
      : (capture.interactionTimeline?.pointerSamples ?? []).filter((sample) => sample.type === "enter" || sample.type === "move").map((sample) => sample.targetSelector);
    const observed = mergeByKey(timelineSelectors.flatMap((selector) => {
      const component = findComponentForObservedSelector(capture, selector);
      return component ? [component] : [];
    }), (component) => component.id).slice(0, 3);
    if (observed.length) return observed;
    const matchingInteraction = capture.interactions.find((interaction) => interaction.trigger === state);
    const matchingComponent = matchingInteraction
      ? capture.components.find((component) => component.selector === matchingInteraction.selector)
      : undefined;
    if (matchingComponent) return [matchingComponent];
    if (state === "focus") {
      const component = capture.components.find((candidate) => ["a", "button", "input", "select", "textarea"].includes(candidate.tagName.toLowerCase()));
      return component ? [component] : [];
    }
    return capture.components[0] ? [capture.components[0]] : [];
  }

  function findComponentForObservedSelector(capture: DesignCapture, selector: string) {
    const direct = capture.components.find((component) => component.selector === selector);
    if (direct) return direct;
    try {
      const target = document.querySelector(selector);
      if (!target) return undefined;
      return capture.components.find((component) => {
        try {
          return Boolean(target.closest(component.selector));
        } catch {
          return false;
        }
      });
    } catch {
      return undefined;
    }
  }

  function addObservedOpenScene(capture: DesignCapture) {
    const rebuild = capture.rebuildEvidence;
    const timeline = capture.interactionTimeline;
    if (!rebuild || !timeline || !rebuildPlan.states.includes("open")) return;
    const activations = timeline.pointerSamples.filter((sample) => sample.type === "down" || sample.type === "up");
    if (!activations.length) return;
    const mutations = (timeline.domMutations ?? []).slice().reverse();
    const mutation = mutations.find((candidate) => {
      if (!activations.some((activation) => candidate.t >= activation.t && candidate.t - activation.t <= 1500)) return false;
      try {
        const element = document.querySelector(candidate.selector);
        if (!element) return false;
        const currentState = [element.getAttribute("class"), element.getAttribute("aria-expanded"), element.getAttribute("aria-hidden"), element.getAttribute("open")].filter(Boolean).join(" ");
        return /(open|active|expanded|visible|show|true)/i.test(currentState) && element.getAttribute("aria-hidden") !== "true";
      } catch {
        return false;
      }
    });
    if (!mutation) return;
    const baseline = rebuild.scenes
      .filter((scene) => scene.phase === "page-baseline" && scene.status === "captured" && scene.screenshotArtifactId)
      .sort((left, right) => Math.abs(left.scroll.y - window.scrollY) - Math.abs(right.scroll.y - window.scrollY))[0];
    if (!baseline?.screenshotArtifactId) return;
    const observed: RebuildSceneEvidence = {
      ...baseline,
      id: `scene-${rebuild.recordingId}-observed-open`,
      name: "Observed open state at recording stop",
      phase: "observed-open",
      selector: mutation.selector
    };
    rebuild.scenes = mergeByKey([...rebuild.scenes, observed], (scene) => scene.id);
  }

  function startGuidedTaskObservation() {
    const task = guidedTask;
    if (!task || !recordingStartedAt) return;
    guidedTaskObserver?.stop();
    guidedTaskObserver = createGuidedTaskObserver({
      doc: document,
      win: window,
      task,
      onReady: (evidence) => { void captureGuidedTaskEvidence(evidence); },
      onTimeout: () => {
        rebuildRecording?.errors.push("guided task: timed out before the requested state was observed");
        void stopRecording({ keepMinimal: true });
      }
    });
    guidedTaskObserver.start();
  }

  async function captureGuidedTaskEvidence(evidence: GuidedTaskEvidence) {
    const recording = rebuildRecording;
    if (!recording || guidedCaptureInFlight) return;
    guidedCaptureInFlight = true;
    guidedTaskObserver?.stop();
    guidedTaskObserver = null;
    renderLoading("scan", "recorded");
    const createdAt = new Date().toISOString();
    const suffix = `${evidence.phase}-${recording.scenes.length + 1}`;
    const artifactId = `screenshot-guided-${suffix}`;
    const scene: RebuildSceneEvidence = {
      id: `scene-${recording.recordingId}-guided-${suffix}`,
      name: `User-observed ${evidence.phase.replace(/-/g, " ")} state`,
      phase: evidence.phase,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      ...(evidence.selector ? { selector: evidence.selector } : {}),
      status: "failed"
    };
    try {
      setCaptureSurfacesHidden(true);
      await wait(240);
      const artifact = await captureAndStoreVisibleTab({
        storageProjectId: recording.storageProjectId,
        artifactId,
        name: `screenshots/guided-${evidence.phase}.png`,
        createdAt
      });
      recording.artifacts.push(artifact);
      scene.screenshotArtifactId = artifact.id;
      scene.capturedAt = artifact.createdAt;
      scene.status = "captured";
    } catch (error) {
      scene.error = error instanceof Error ? error.message : String(error);
      recording.errors.push(`guided screenshot: ${scene.error}`);
    } finally {
      recording.scenes.push(scene);
      setCaptureSurfacesHidden(false);
      guidedCaptureInFlight = false;
    }
    await stopRecording({ keepMinimal: true });
  }

  function dismissSoon(delayMs: number) {
    if (dismissTimer !== null) window.clearTimeout(dismissTimer);
    dismissTimer = window.setTimeout(() => closeOverlay(true), delayMs);
  }

  function closeOverlay(animate = false) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (!host) return;
    if (animate && shadow) {
      const panel = shadow.querySelector(".panel");
      panel?.classList.add("is-leaving");
      window.setTimeout(() => {
        host?.remove();
        host = null;
        shadow = null;
      }, 220);
      return;
    }
    host.remove();
    host = null;
    shadow = null;
  }

  async function sampleRecording(context?: SmartCaptureExecutionContext) {
    if (shouldStopPageWork(context)) return;
    if (recordingInFlight) return;
    recordingInFlight = true;
    try {
      const response = await actions.scanPage();
      if (response.ok && !shouldStopPageWork(context)) {
        const preview = timelineRecorder?.getPreview();
        if (preview) response.capture.interactionTimeline = preview;
        recordedCaptures.push(response.capture);
      }
      if (recordedCaptures.length > 8) recordedCaptures = recordedCaptures.slice(-8);
    } finally {
      recordingInFlight = false;
    }
  }

  async function waitForPreparation(preparation: Promise<void>, context?: SmartCaptureExecutionContext) {
    if (!context || !context.signal.aborted) {
      await preparation;
      return;
    }
    await Promise.race([preparation.catch(() => undefined), wait(800)]);
  }

  function shouldSkipAdvancedCapture(context?: SmartCaptureExecutionContext) {
    return Boolean(context && (context.signal.aborted || context.safetyLevel === "snapshot-only" || context.safetyLevel === "stopped"));
  }

  function shouldStopPageWork(context?: SmartCaptureExecutionContext) {
    return Boolean(context && (context.signal.aborted || context.safetyLevel === "stopped" || performance.now() >= context.deadline));
  }

  function remainingCaptureMs(context: SmartCaptureExecutionContext, maximumMs: number) {
    return Math.max(1, Math.min(maximumMs, context.deadline - performance.now()));
  }

  function renderIdle() {
    renderShell(buildIdleMarkup(locale));
  }

  async function notifyCapture(capture: DesignCapture) {
    try {
      await actions.captureCompleted?.(capture);
    } catch {
      // Capture remains usable in-page when workspace persistence is unavailable.
    }
  }

  function renderRecorder(isRecording: boolean) {
    renderShell(buildRecorderMarkup(locale, isRecording, guidedTask), isRecording ? "recording" : "recorder");
  }

  function renderSmartCapture() {
    renderShell(buildSmartCaptureMarkup(locale, smartCaptureStatus?.phase ?? "preflight", smartCaptureStatus?.degraded), "recording");
  }

  function renderDone() {
    if (lastCapture) {
      renderCaptureCard(lastCapture);
      return;
    }
    renderShell(`
      <div class="mini-loading">
        <span class="mini-dot is-done"></span>
        <span>${locale === "zh" ? "采集完成，结果已回到控制台。" : "Capture complete. Results returned to the console."}</span>
      </div>
    `);
  }

  function renderLoading(action: string, scanMode: ScanMode = "instant") {
    renderShell(buildLoadingMarkup(locale, action as "scan" | "pick", scanMode));
  }

  function renderError(error: string) {
    renderShell(buildErrorMarkup(locale, error));
  }

  function renderCaptureCard(capture: DesignCapture) {
    renderShell(buildCaptureCardMarkup({ capture, locale }), "capture");
  }

  function renderShell(content: string, variant: "status" | "capture" | "recorder" | "recording" = "status") {
    if (!shadow) return;
    if (host) {
      host.style.opacity = hiddenForFlow ? "0" : "1";
      host.style.transition = "opacity 180ms ease, transform 180ms ease";
    }
    shadow.innerHTML = buildOverlayMarkup(theme, content, variant);

    shadow.querySelector('[data-action="record-start"]')?.addEventListener("click", () => void startRecording().catch(() => undefined));
    shadow.querySelector('[data-action="record-stop"]')?.addEventListener("click", () => void finishRecord());
    shadow.querySelector('[data-action="close"]')?.addEventListener("click", () => closeOverlay(true));
  }

  return { toggle, openAndRun, openRecorder, beginRecord, beginSmartCapture, finishRecord, getRecordStatus, setLocale, setTheme, setCapturePrivacyMask, getLastCapture, getEmptyCapture };
}

async function waitForScanTiming(scanMode: ScanMode) {
  if (scanMode === "instant") return;
  await waitForDocumentReady();
}

async function waitForDocumentReady() {
  if (document.readyState === "complete") return;
  await new Promise<void>((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
    window.setTimeout(() => resolve(), 2500);
  });
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function createRecordingId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function waitForAnimationWindow(durationMs: number) {
  const startedAt = performance.now();
  let lastMutation = performance.now();
  const observer = new MutationObserver(() => {
    lastMutation = performance.now();
  });
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const quiet = performance.now() - lastMutation > 450;
      if (elapsed >= durationMs && (quiet || elapsed > durationMs + 1400)) {
        observer.disconnect();
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function mergeCaptures(captures: DesignCapture[]) {
  const [base] = captures;
  if (!base) return null;

  const merged: DesignCapture = structuredClone(base);
  merged.scope = captures.some((capture) => capture.scope === "component") ? "component" : "page";
  merged.tokens = {
    cssVariables: mergeTokenValues(captures.flatMap((capture) => capture.tokens.cssVariables)),
    colors: mergeTokenValues(captures.flatMap((capture) => capture.tokens.colors)),
    backgrounds: mergeTokenValues(captures.flatMap((capture) => capture.tokens.backgrounds)),
    spacing: mergeTokenValues(captures.flatMap((capture) => capture.tokens.spacing)),
    radii: mergeTokenValues(captures.flatMap((capture) => capture.tokens.radii)),
    shadows: mergeTokenValues(captures.flatMap((capture) => capture.tokens.shadows)),
    typography: mergeTypography(captures.flatMap((capture) => capture.tokens.typography))
  };
  merged.components = mergeByKey(captures.flatMap((capture) => capture.components), (component) => `${component.name}:${component.selector}`);
  merged.motion = mergeByKey(captures.flatMap((capture) => capture.motion), (motion) => `${motion.selector}:${motion.type}:${motion.name}`);
  merged.interactions = mergeByKey(captures.flatMap((capture) => capture.interactions), (interaction) => `${interaction.selector}:${interaction.trigger}:${interaction.affordance}`);
  merged.layout = mergeByKey(captures.flatMap((capture) => capture.layout), (layout) => `${layout.display}:${layout.position}:${layout.width}:${layout.height}:${layout.gap}`).slice(0, 48);
  merged.evidence = mergeByKey(captures.flatMap((capture) => capture.evidence), (evidence) => `${evidence.reason}:${evidence.selector}`).slice(0, 60);
  merged.interactionTimeline = mergeInteractionTimelines(captures.map((capture) => capture.interactionTimeline));
  merged.layoutProfile = {
    ...merged.layoutProfile,
    structure: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.structure)),
    cadence: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.cadence)),
    emphasis: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.emphasis)),
    dominantDisplays: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.dominantDisplays)),
    dominantGaps: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.dominantGaps)),
    alignment: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.alignment))
  };
  merged.analysis = withLocalizedAnalysis(merged).analysis;
  return merged;
}

function mergeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = getKey(item);
    if (!seen.has(key)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

function mergeStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, 8);
}

function mergeTokenValues(tokens: DesignCapture["tokens"]["colors"]) {
  const seen = new Map<string, DesignCapture["tokens"]["colors"][number]>();
  for (const token of tokens) {
    const existing = seen.get(token.value);
    if (existing) {
      existing.count += token.count;
      existing.sampleSelectors = mergeStrings([...existing.sampleSelectors, ...token.sampleSelectors]).slice(0, 4);
    } else {
      seen.set(token.value, { ...token, sampleSelectors: token.sampleSelectors.slice(0, 4) });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count).slice(0, 32);
}

function mergeTypography(tokens: DesignCapture["tokens"]["typography"]) {
  const seen = new Map<string, DesignCapture["tokens"]["typography"][number]>();
  for (const token of tokens) {
    const key = `${token.family}:${token.size}:${token.weight}:${token.lineHeight}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count += token.count;
      existing.sampleSelectors = mergeStrings([...existing.sampleSelectors, ...token.sampleSelectors]).slice(0, 4);
    } else {
      seen.set(key, { ...token, sampleSelectors: token.sampleSelectors.slice(0, 4) });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count).slice(0, 16);
}
