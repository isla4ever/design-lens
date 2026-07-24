import { buildSelector, isCaptureNoiseElement, isVisibleElement } from "../core/dom-utils";
import type {
  DomMutationSample,
  FocusSample,
  FrameSample,
  InteractionTimeline,
  PerformanceTimelineSample,
  PointerSample,
  RuntimeAnimationSample,
  ScrollSample,
  TimelineMetrics,
  VisualSurfaceSample
} from "../../shared/schema";
import {
  buildTimelineMetrics,
  countChangedElements,
  findTimelineElements,
  frameSignature,
  hasTimelineSemanticEvidence,
  inferInteractionPatterns,
  inferPointPhase,
  inferTimelinePhases,
  mergePatterns,
  mergeTimelineMetrics,
  mergeTimelinePhases,
  sampleElement,
  trim
} from "./interaction-timeline-analysis";
import {
  extractAnimatedProperties,
  inferAnimationName,
  inferAnimationSource,
  isInterestingMutation,
  runtimeAnimationSignature,
  sampleVisualSurface
} from "./interaction-timeline-signals";

const MAX_POINTER_SAMPLES = 160;
const MAX_FOCUS_SAMPLES = 48;
const MAX_SCROLL_SAMPLES = 120;
const MAX_FRAME_SAMPLES = 12;
const MAX_RUNTIME_ANIMATION_SAMPLES = 90;
const MAX_MUTATION_SAMPLES = 120;
const MAX_VISUAL_SURFACE_SAMPLES = 90;
const MAX_PERFORMANCE_SAMPLES = 90;
const MIN_HEAVY_FRAME_INTERVAL_MS = 800;
const HEAVY_FRAME_SETTLE_MS = 240;
const LONG_TASK_DEGRADE_MS = 50;
const MUTATION_SOFT_LIMIT = 750;
const MUTATION_HARD_LIMIT = 10_000;
const MUTATION_STORM_RATE = 500;
const MUTATION_STORM_WINDOWS = 2;
const MAX_LAYOUT_SAMPLING_DOM_NODES = 50_000;
type PendingPointerEvent = {
  type: string;
  x: number;
  y: number;
  target: EventTarget | null;
  pressure: number;
  buttons: number;
};
type TimelineRecorder = {
  start: () => void;
  stop: () => InteractionTimeline;
  sampleFrame: () => void;
  getPreview: () => InteractionTimeline;
};

export function createInteractionTimelineRecorder(doc: Document, win: Window): TimelineRecorder {
  let startedAt = 0;
  let lastPointer: PointerSample | null = null;
  let lastScroll: ScrollSample | null = null;
  let lastFrameElements = new Map<string, string>();
  let lastVisualSurfaces = new Map<string, string>();
  let signalFrameRequest: number | null = null;
  let heavyFrameTimer: number | null = null;
  let mutationObserver: MutationObserver | null = null;
  let performanceObserver: PerformanceObserver | null = null;
  let lastHeavyFrameAt = Number.NEGATIVE_INFINITY;
  let pendingScroll = false;
  let pendingHeavyFrame = false;
  let degraded = false;
  let mutationCount = 0;
  let mutationWindowCount = 0;
  let mutationWindowStartedAt = 0;
  let consecutiveMutationStormWindows = 0;
  const pendingPointerEvents: PendingPointerEvent[] = [];
  const pointerSamples: PointerSample[] = [];
  const focusSamples: FocusSample[] = [];
  const scrollSamples: ScrollSample[] = [];
  const frameSamples: FrameSample[] = [];
  const runtimeAnimations: RuntimeAnimationSample[] = [];
  const domMutations: DomMutationSample[] = [];
  const visualSurfaces: VisualSurfaceSample[] = [];
  const performanceEvents: PerformanceTimelineSample[] = [];

  function start() {
    startedAt = win.performance.now();
    lastPointer = null;
    lastScroll = {
      t: 0,
      x: win.scrollX,
      y: win.scrollY,
      deltaY: 0,
      velocity: 0
    };
    pointerSamples.length = 0;
    focusSamples.length = 0;
    scrollSamples.length = 0;
    frameSamples.length = 0;
    runtimeAnimations.length = 0;
    domMutations.length = 0;
    visualSurfaces.length = 0;
    performanceEvents.length = 0;
    lastFrameElements = new Map();
    lastVisualSurfaces = new Map();
    lastHeavyFrameAt = Number.NEGATIVE_INFINITY;
    pendingScroll = false;
    pendingHeavyFrame = false;
    degraded = doc.getElementsByTagName("*").length > MAX_LAYOUT_SAMPLING_DOM_NODES;
    mutationCount = 0;
    mutationWindowCount = 0;
    mutationWindowStartedAt = startedAt;
    consecutiveMutationStormWindows = 0;
    pendingPointerEvents.length = 0;

    win.addEventListener("pointermove", onPointerEvent, true);
    win.addEventListener("pointerdown", onPointerEvent, true);
    win.addEventListener("pointerup", onPointerEvent, true);
    win.addEventListener("pointerenter", onPointerEvent, true);
    win.addEventListener("pointerleave", onPointerEvent, true);
    doc.addEventListener("focusin", onFocus, true);
    doc.addEventListener("focusout", onFocus, true);
    doc.addEventListener("visibilitychange", onVisibilityChange);
    win.addEventListener("scroll", onScroll, true);
    mutationObserver = new MutationObserver(onDomMutations);
    mutationObserver?.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-state", "aria-expanded", "aria-hidden"],
      childList: true,
      subtree: true,
      characterData: false
    });
    startPerformanceObserver();
    sampleBufferedPerformanceEntries();
    if (!degraded) captureFrame(true);
  }

  function stop() {
    flushSignals();
    sampleBufferedPerformanceEntries();
    cleanup();
    if (!degraded && !isPaused()) captureFrame(true);
    const timeline = buildTimeline();
    startedAt = 0;
    return timeline;
  }

  function getPreview() {
    return buildTimeline();
  }

  function cleanup() {
    win.removeEventListener("pointermove", onPointerEvent, true);
    win.removeEventListener("pointerdown", onPointerEvent, true);
    win.removeEventListener("pointerup", onPointerEvent, true);
    win.removeEventListener("pointerenter", onPointerEvent, true);
    win.removeEventListener("pointerleave", onPointerEvent, true);
    doc.removeEventListener("focusin", onFocus, true);
    doc.removeEventListener("focusout", onFocus, true);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    win.removeEventListener("scroll", onScroll, true);
    mutationObserver?.disconnect();
    mutationObserver = null;
    performanceObserver?.disconnect();
    performanceObserver = null;
    cancelScheduledWork();
  }

  function onPointerEvent(event: PointerEvent) {
    if (!startedAt || isPaused()) return;
    const pending: PendingPointerEvent = {
      type: event.type,
      x: event.clientX,
      y: event.clientY,
      target: event.target,
      pressure: event.pressure,
      buttons: event.buttons
    };
    const last = pendingPointerEvents.at(-1);
    if (event.type === "pointermove" && last?.type === "pointermove") pendingPointerEvents[pendingPointerEvents.length - 1] = pending;
    else pendingPointerEvents.push(pending);
    if (pendingPointerEvents.length > 12) pendingPointerEvents.splice(0, pendingPointerEvents.length - 12);
    scheduleSignalFlush();
    if (event.type === "pointerup" || event.type === "pointerdown") scheduleHeavyFrame();
  }

  function recordPointer(event: PendingPointerEvent) {
    const target = event.target instanceof Element && !isCaptureNoiseElement(event.target) ? event.target : doc.elementFromPoint(event.x, event.y);
    const selector = target instanceof Element ? buildSelector(target) : "";
    const t = Math.round(win.performance.now() - startedAt);
    const distance = lastPointer ? Math.hypot(event.x - lastPointer.x, event.y - lastPointer.y) : 0;
    const elapsed = lastPointer ? Math.max(16, t - lastPointer.t) : 16;
    const directionDeg = lastPointer ? Math.round((Math.atan2(event.y - lastPointer.y, event.x - lastPointer.x) * 180) / Math.PI) : 0;
    const sample: PointerSample = {
      t,
      type: pointerEventType(event.type),
      x: Math.round(event.x),
      y: Math.round(event.y),
      targetSelector: selector,
      speed: Math.round((distance / elapsed) * 1000),
      phase: degraded ? (event.y < win.innerHeight * 0.9 ? "hero-stage" : "content-stage") : inferPointPhase(event.x, event.y, doc, win),
      directionDeg,
      pressure: event.pressure ? Math.round(event.pressure * 100) / 100 : undefined,
      buttons: event.buttons || undefined
    };

    lastPointer = sample;
    pointerSamples.push(sample);
    trim(pointerSamples, MAX_POINTER_SAMPLES);
  }

  function onScroll() {
    if (!startedAt || isPaused()) return;
    pendingScroll = true;
    scheduleSignalFlush();
    scheduleHeavyFrame();
  }

  function recordScroll() {
    const t = Math.round(win.performance.now() - startedAt);
    const y = Math.round(win.scrollY);
    const x = Math.round(win.scrollX);
    const deltaY = lastScroll ? y - lastScroll.y : 0;
    const elapsed = lastScroll ? Math.max(16, t - lastScroll.t) : 16;
    const sample: ScrollSample = {
      t,
      x,
      y,
      deltaY,
      velocity: Math.round((deltaY / elapsed) * 1000)
    };

    lastScroll = sample;
    scrollSamples.push(sample);
    trim(scrollSamples, MAX_SCROLL_SAMPLES);
  }

  function onFocus(event: FocusEvent) {
    if (!startedAt || isPaused() || !(event.target instanceof Element) || isCaptureNoiseElement(event.target)) return;
    focusSamples.push({
      t: Math.round(win.performance.now() - startedAt),
      type: event.type === "focusin" ? "in" : "out",
      targetSelector: buildSelector(event.target)
    });
    trim(focusSamples, MAX_FOCUS_SAMPLES);
    scheduleHeavyFrame();
  }

  function sampleFrame() {
    captureFrame();
  }

  function captureFrame(force = false) {
    if (!startedAt || isPaused() || (degraded && !force)) return;
    const started = win.performance.now();
    if (!force && started - lastHeavyFrameAt < MIN_HEAVY_FRAME_INTERVAL_MS) return;
    const elements = findTimelineElements(doc, win).map((element) => sampleElement(element, win));
    const changedElements = countChangedElements(elements, lastFrameElements);
    lastFrameElements = new Map(elements.map((element) => [element.selector, frameSignature(element)]));
    frameSamples.push({
      t: Math.round(win.performance.now() - startedAt),
      scrollY: Math.round(win.scrollY),
      changedElements,
      elements
    });
    trim(frameSamples, MAX_FRAME_SAMPLES);
    sampleRuntimeAnimations();
    sampleVisualSurfaces();
    lastHeavyFrameAt = started;
    if (win.performance.now() - started >= LONG_TASK_DEGRADE_MS) degradeHeavyCapture();
  }

  function scheduleSignalFlush() {
    if (!startedAt || isPaused() || signalFrameRequest !== null) return;
    signalFrameRequest = win.requestAnimationFrame(() => {
      signalFrameRequest = null;
      flushSignals();
    });
  }

  function flushSignals() {
    if (!startedAt || isPaused()) return;
    const pointers = pendingPointerEvents.splice(0, pendingPointerEvents.length);
    for (const pointer of pointers) recordPointer(pointer);
    if (pendingScroll) {
      pendingScroll = false;
      recordScroll();
    }
    if (pendingHeavyFrame) {
      pendingHeavyFrame = false;
      captureFrame();
    }
  }

  function scheduleHeavyFrame() {
    if (!startedAt || degraded || isPaused()) return;
    if (heavyFrameTimer !== null) win.clearTimeout(heavyFrameTimer);
    const elapsed = win.performance.now() - lastHeavyFrameAt;
    const delay = Math.max(HEAVY_FRAME_SETTLE_MS, MIN_HEAVY_FRAME_INTERVAL_MS - elapsed);
    heavyFrameTimer = win.setTimeout(() => {
      heavyFrameTimer = null;
      pendingHeavyFrame = true;
      scheduleSignalFlush();
    }, delay);
  }

  function onVisibilityChange() {
    if (isPaused()) {
      cancelScheduledWork();
      pendingPointerEvents.length = 0;
      pendingScroll = false;
      pendingHeavyFrame = false;
      return;
    }
    scheduleHeavyFrame();
  }

  function isPaused() {
    return doc.visibilityState === "hidden";
  }

  function degradeHeavyCapture() {
    degraded = true;
    pendingHeavyFrame = false;
    if (heavyFrameTimer !== null) {
      win.clearTimeout(heavyFrameTimer);
      heavyFrameTimer = null;
    }
  }

  function cancelScheduledWork() {
    if (signalFrameRequest !== null) {
      win.cancelAnimationFrame(signalFrameRequest);
      signalFrameRequest = null;
    }
    if (heavyFrameTimer !== null) {
      win.clearTimeout(heavyFrameTimer);
      heavyFrameTimer = null;
    }
  }

  function buildTimeline(): InteractionTimeline {
    const durationMs = Math.round(startedAt ? win.performance.now() - startedAt : 0);
    const timeline: InteractionTimeline = {
      durationMs,
      pointerSamples: [...pointerSamples],
      focusSamples: [...focusSamples],
      scrollSamples: [...scrollSamples],
      frameSamples: [...frameSamples],
      runtimeAnimations: [...runtimeAnimations],
      domMutations: [...domMutations],
      visualSurfaces: [...visualSurfaces],
      performanceEvents: [...performanceEvents],
      patterns: []
    };
    timeline.metrics = buildTimelineMetrics(timeline, win);
    timeline.phases = inferTimelinePhases(timeline, win);
    timeline.patterns = inferInteractionPatterns(timeline, doc, win);
    return timeline;
  }

  function sampleRuntimeAnimations() {
    if (!startedAt || !("getAnimations" in doc)) return;
    const t = Math.round(win.performance.now() - startedAt);
    for (const animation of doc.getAnimations().slice(0, 18)) {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect)) continue;
      const target = effect.target;
      if (!(target instanceof Element) || isCaptureNoiseElement(target)) continue;
      const selector = buildSelector(target);
      const timing = effect.getTiming();
      const keyframes = effect.getKeyframes();
      const properties = extractAnimatedProperties(keyframes);
      const source = inferAnimationSource(animation, target, properties);
      const duration = typeof timing.duration === "number" ? timing.duration : 0;
      const sample: RuntimeAnimationSample = {
        t,
        selector,
        name: animation.id || inferAnimationName(target, win) || source,
        source,
        playState: animation.playState,
        currentTimeMs: typeof animation.currentTime === "number" ? Math.round(animation.currentTime) : 0,
        durationMs: Math.round(duration),
        delayMs: typeof timing.delay === "number" ? Math.round(timing.delay) : 0,
        easing: String(timing.easing || "linear"),
        iterationCount: String(timing.iterations ?? "1"),
        properties,
        keyframeCount: keyframes.length,
        fill: String(timing.fill || "auto"),
        direction: String(timing.direction || "normal"),
        playbackRate: animation.playbackRate,
        keyframes: compactKeyframes(keyframes)
      };
      const key = `${sample.selector}|${sample.name}|${sample.currentTimeMs}|${sample.playState}|${sample.properties.join(",")}`;
      if (runtimeAnimations.at(-1) && runtimeAnimationSignature(runtimeAnimations.at(-1) as RuntimeAnimationSample) === key) continue;
      runtimeAnimations.push(sample);
      trim(runtimeAnimations, MAX_RUNTIME_ANIMATION_SAMPLES);
    }
  }

  function sampleVisualSurfaces() {
    if (!startedAt) return;
    const t = Math.round(win.performance.now() - startedAt);
    const surfaces = Array.from(doc.querySelectorAll("canvas, video, img, picture, svg"))
      .filter((element) => !isCaptureNoiseElement(element) && (isVisibleElement(element, win) || hasTimelineSemanticEvidence(element, win)))
      .slice(0, 20);
    for (const element of surfaces) {
      const rect = element.getBoundingClientRect();
      const sample = sampleVisualSurface(element, t, rect);
      const signature = `${sample.selector}|${sample.signal}|${sample.width}x${sample.height}|${sample.frameSignature ?? ""}`;
      if (lastVisualSurfaces.get(sample.selector) === signature) continue;
      lastVisualSurfaces.set(sample.selector, signature);
      visualSurfaces.push(sample);
      trim(visualSurfaces, MAX_VISUAL_SURFACE_SAMPLES);
    }
  }

  function onDomMutations(records: MutationRecord[]) {
    if (!startedAt || isPaused()) return;
    const now = win.performance.now();
    const weight = records.reduce((total, record) => total + 1 + (record.type === "childList" ? record.addedNodes.length + record.removedNodes.length : 0), 0);
    mutationCount += weight;
    mutationWindowCount += weight;
    const windowDuration = now - mutationWindowStartedAt;
    if (windowDuration >= 1000) {
      const rate = (mutationWindowCount * 1000) / windowDuration;
      consecutiveMutationStormWindows = rate > MUTATION_STORM_RATE ? consecutiveMutationStormWindows + 1 : 0;
      mutationWindowCount = 0;
      mutationWindowStartedAt = now;
    }
    if (mutationCount >= MUTATION_SOFT_LIMIT) degradeHeavyCapture();
    if (mutationCount >= MUTATION_HARD_LIMIT || consecutiveMutationStormWindows >= MUTATION_STORM_WINDOWS) {
      mutationObserver?.disconnect();
      mutationObserver = null;
      return;
    }
    const t = Math.round(win.performance.now() - startedAt);
    let capturedInterestingMutation = false;
    for (const record of records.slice(0, 24)) {
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!element || isCaptureNoiseElement(element)) continue;
      if (!isInterestingMutation(element, record)) continue;
      domMutations.push({
        t,
        selector: buildSelector(element),
        type: record.type as DomMutationSample["type"],
        attributeName: record.attributeName ?? undefined,
        className: element.getAttribute("class") ?? undefined,
        styleText: element.getAttribute("style") ?? undefined,
        addedNodes: record.type === "childList" ? record.addedNodes.length : undefined,
        removedNodes: record.type === "childList" ? record.removedNodes.length : undefined
      });
      trim(domMutations, MAX_MUTATION_SAMPLES);
      capturedInterestingMutation = true;
    }
    if (capturedInterestingMutation) scheduleHeavyFrame();
  }

  function startPerformanceObserver() {
    if (!("PerformanceObserver" in win)) return;
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    const entryTypes = ["paint", "layout-shift", "longtask", "measure", "mark", "event", "resource"].filter((type) => supported.includes(type));
    if (!entryTypes.length) return;
    try {
      performanceObserver = new PerformanceObserver((list) => {
        if (!startedAt) return;
        const now = Math.round(win.performance.now() - startedAt);
        for (const entry of list.getEntries()) {
          pushPerformanceEntry(entry, now);
        }
      });
      performanceObserver.observe({ entryTypes });
    } catch {
      performanceObserver = null;
    }
  }

  function sampleBufferedPerformanceEntries() {
    if (!startedAt || !win.performance?.getEntriesByType) return;
    for (const typeName of ["paint", "layout-shift", "longtask", "measure", "mark", "event", "resource"]) {
      for (const entry of win.performance.getEntriesByType(typeName).slice(-18)) {
        pushPerformanceEntry(entry, Math.round(win.performance.now() - startedAt));
      }
    }
  }

  function pushPerformanceEntry(entry: PerformanceEntry, t: number) {
    const type = performanceEventType(entry.entryType);
    if (!type) return;
    const layoutShift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
    if (type === "layout-shift" && layoutShift.hadRecentInput) return;
    const sample: PerformanceTimelineSample = {
      t,
      type,
      name: performanceEntryName(entry, type, win),
      startTime: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      value: typeof layoutShift.value === "number" ? Math.round(layoutShift.value * 1000) / 1000 : undefined,
      selector: eventTargetSelector(entry, doc)
    };
    const key = `${sample.type}|${sample.name}|${sample.startTime}|${sample.duration}|${sample.selector ?? ""}`;
    if (performanceEvents.some((item) => `${item.type}|${item.name}|${item.startTime}|${item.duration}|${item.selector ?? ""}` === key)) return;
    performanceEvents.push(sample);
    trim(performanceEvents, MAX_PERFORMANCE_SAMPLES);
    if (sample.type === "longtask" && entry.startTime >= startedAt && sample.duration >= LONG_TASK_DEGRADE_MS) degradeHeavyCapture();
  }

  return { start, stop, sampleFrame, getPreview };
}

export function mergeInteractionTimelines(timelines: Array<InteractionTimeline | undefined>): InteractionTimeline | undefined {
  const available = timelines.filter(Boolean) as InteractionTimeline[];
  if (!available.length) return undefined;

  const merged: InteractionTimeline = {
    durationMs: available.reduce((total, item) => total + item.durationMs, 0),
    pointerSamples: available.flatMap((item) => item.pointerSamples).slice(-MAX_POINTER_SAMPLES),
    focusSamples: available.flatMap((item) => item.focusSamples ?? []).slice(-MAX_FOCUS_SAMPLES),
    scrollSamples: available.flatMap((item) => item.scrollSamples).slice(-MAX_SCROLL_SAMPLES),
    frameSamples: available.flatMap((item) => item.frameSamples).slice(-MAX_FRAME_SAMPLES),
    runtimeAnimations: available.flatMap((item) => item.runtimeAnimations ?? []).slice(-MAX_RUNTIME_ANIMATION_SAMPLES),
    domMutations: available.flatMap((item) => item.domMutations ?? []).slice(-MAX_MUTATION_SAMPLES),
    visualSurfaces: available.flatMap((item) => item.visualSurfaces ?? []).slice(-MAX_VISUAL_SURFACE_SAMPLES),
    performanceEvents: available.flatMap((item) => item.performanceEvents ?? []).slice(-MAX_PERFORMANCE_SAMPLES),
    patterns: []
  };
  merged.patterns = mergePatterns(available.flatMap((item) => item.patterns));
  merged.metrics = mergeTimelineMetrics(available.map((item) => item.metrics).filter(Boolean) as TimelineMetrics[], merged, window);
  merged.phases = mergeTimelinePhases(available.flatMap((item) => item.phases ?? []), merged, window);
  return merged;
}

function pointerEventType(type: string): PointerSample["type"] {
  if (type === "pointerdown") return "down";
  if (type === "pointerup") return "up";
  if (type === "pointerenter") return "enter";
  if (type === "pointerleave") return "leave";
  return "move";
}

function performanceEventType(type: string): PerformanceTimelineSample["type"] | "" {
  if (type === "paint") return "paint";
  if (type === "layout-shift") return "layout-shift";
  if (type === "longtask") return "longtask";
  if (type === "measure") return "measure";
  if (type === "mark") return "mark";
  if (type === "event") return "event";
  if (type === "resource") return "resource";
  return "";
}

function eventTargetSelector(entry: PerformanceEntry, doc: Document) {
  const maybe = entry as PerformanceEntry & { target?: EventTarget | null };
  return maybe.target instanceof Element ? buildSelector(maybe.target) : undefined;
}

function performanceEntryName(entry: PerformanceEntry, type: PerformanceTimelineSample["type"], win: Window) {
  if (type !== "resource") return entry.name || entry.entryType;
  try {
    const url = new URL(entry.name, win.location.href);
    return `${url.hostname}${url.pathname}`.slice(0, 240);
  } catch {
    return entry.name.split(/[?#]/, 1)[0]?.slice(0, 240) || "resource";
  }
}

function compactKeyframes(keyframes: ComputedKeyframe[]) {
  return keyframes.slice(0, 4).map((keyframe) => {
    const compact: Record<string, string | number> = {};
    for (const key of ["offset", "opacity", "transform", "clipPath", "filter", "easing"]) {
      const value = keyframe[key as keyof ComputedKeyframe];
      if (typeof value === "string" || typeof value === "number") compact[key] = value;
    }
    return compact;
  });
}
