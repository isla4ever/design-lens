import { buildSelector, isCaptureNoiseElement, isVisibleElement } from "../core/dom-utils";
import type {
  DomMutationSample,
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
const MAX_SCROLL_SAMPLES = 120;
const MAX_FRAME_SAMPLES = 36;
const MAX_RUNTIME_ANIMATION_SAMPLES = 90;
const MAX_MUTATION_SAMPLES = 120;
const MAX_VISUAL_SURFACE_SAMPLES = 90;
const MAX_PERFORMANCE_SAMPLES = 90;
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
  let frameTimer: number | null = null;
  let mutationObserver: MutationObserver | null = null;
  let performanceObserver: PerformanceObserver | null = null;
  const pointerSamples: PointerSample[] = [];
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
    scrollSamples.length = 0;
    frameSamples.length = 0;
    runtimeAnimations.length = 0;
    domMutations.length = 0;
    visualSurfaces.length = 0;
    performanceEvents.length = 0;
    lastFrameElements = new Map();
    lastVisualSurfaces = new Map();

    win.addEventListener("pointermove", onPointerMove, true);
    win.addEventListener("pointerdown", onPointerMove, true);
    win.addEventListener("pointerup", onPointerMove, true);
    win.addEventListener("pointerenter", onPointerMove, true);
    win.addEventListener("pointerleave", onPointerMove, true);
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
    sampleFrame();
    frameTimer = win.setInterval(sampleFrame, 260);
  }

  function stop() {
    sampleBufferedPerformanceEntries();
    cleanup();
    sampleFrame();
    return buildTimeline();
  }

  function getPreview() {
    return buildTimeline();
  }

  function cleanup() {
    win.removeEventListener("pointermove", onPointerMove, true);
    win.removeEventListener("pointerdown", onPointerMove, true);
    win.removeEventListener("pointerup", onPointerMove, true);
    win.removeEventListener("pointerenter", onPointerMove, true);
    win.removeEventListener("pointerleave", onPointerMove, true);
    win.removeEventListener("scroll", onScroll, true);
    mutationObserver?.disconnect();
    mutationObserver = null;
    performanceObserver?.disconnect();
    performanceObserver = null;
    if (frameTimer !== null) {
      win.clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!startedAt) return;
    const target = event.target instanceof Element && !isCaptureNoiseElement(event.target) ? event.target : doc.elementFromPoint(event.clientX, event.clientY);
    const selector = target instanceof Element ? buildSelector(target) : "";
    const t = Math.round(win.performance.now() - startedAt);
    const distance = lastPointer ? Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) : 0;
    const elapsed = lastPointer ? Math.max(16, t - lastPointer.t) : 16;
    const directionDeg = lastPointer ? Math.round((Math.atan2(event.clientY - lastPointer.y, event.clientX - lastPointer.x) * 180) / Math.PI) : 0;
    const sample: PointerSample = {
      t,
      type: pointerEventType(event.type),
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      targetSelector: selector,
      speed: Math.round((distance / elapsed) * 1000),
      phase: inferPointPhase(event.clientX, event.clientY, doc, win),
      directionDeg,
      pressure: event.pressure ? Math.round(event.pressure * 100) / 100 : undefined,
      buttons: event.buttons || undefined
    };

    lastPointer = sample;
    pointerSamples.push(sample);
    trim(pointerSamples, MAX_POINTER_SAMPLES);
  }

  function onScroll() {
    if (!startedAt) return;
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
    sampleFrame();
  }

  function sampleFrame() {
    if (!startedAt) return;
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
  }

  function buildTimeline(): InteractionTimeline {
    const durationMs = Math.round(startedAt ? win.performance.now() - startedAt : 0);
    const timeline: InteractionTimeline = {
      durationMs,
      pointerSamples: [...pointerSamples],
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
    if (!startedAt) return;
    const t = Math.round(win.performance.now() - startedAt);
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
    }
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
      name: entry.name || entry.entryType,
      startTime: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      value: typeof layoutShift.value === "number" ? Math.round(layoutShift.value * 1000) / 1000 : undefined,
      selector: eventTargetSelector(entry, doc)
    };
    const key = `${sample.type}|${sample.name}|${sample.startTime}|${sample.duration}|${sample.selector ?? ""}`;
    if (performanceEvents.some((item) => `${item.type}|${item.name}|${item.startTime}|${item.duration}|${item.selector ?? ""}` === key)) return;
    performanceEvents.push(sample);
    trim(performanceEvents, MAX_PERFORMANCE_SAMPLES);
  }

  return { start, stop, sampleFrame, getPreview };
}

export function mergeInteractionTimelines(timelines: Array<InteractionTimeline | undefined>): InteractionTimeline | undefined {
  const available = timelines.filter(Boolean) as InteractionTimeline[];
  if (!available.length) return undefined;

  const merged: InteractionTimeline = {
    durationMs: available.reduce((total, item) => total + item.durationMs, 0),
    pointerSamples: available.flatMap((item) => item.pointerSamples).slice(-MAX_POINTER_SAMPLES),
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
