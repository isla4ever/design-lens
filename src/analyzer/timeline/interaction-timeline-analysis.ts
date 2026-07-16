import { buildSelector, cleanText, isCaptureNoiseElement, isVisibleElement } from "../core/dom-utils";
import type {
  FrameElementSample,
  FrameSample,
  InteractionPattern,
  InteractionTimeline,
  TimelineMetrics,
  TimelinePhase
} from "../../shared/schema";

const FRAME_ELEMENT_LIMIT = 18;
const CLASS_SIGNAL_SCAN_LIMIT = 2000;

export function findTimelineElements(doc: Document, win: Window) {
  const selector = [
    "canvas",
    "svg",
    "video",
    "img",
    "picture",
    "main",
    "section",
    "article",
    "header",
    "nav",
    "h1",
    "h2",
    "h3",
    "[role='button']",
    "[tabindex]",
    "[class*='hero' i]",
    "[class*='preload' i]",
    "[class*='loader' i]",
    "[class*='cursor' i]",
    "[class*='hover' i]",
    "[class*='ripple' i]",
    "[class*='distort' i]",
    "[class*='water' i]",
    "[class*='fluid' i]",
    "[class*='wave' i]",
    "[class*='mask' i]",
    "[class*='clip' i]",
    "[class*='reveal' i]",
    "[class*='work' i]",
    "[class*='project' i]",
    "[class*='scene' i]",
    "[class*='gallery' i]",
    "[class*='image' i]",
    "[class*='media' i]",
    "[class*='sticky' i]",
    "[class*='pin' i]"
  ].join(",");

  return Array.from(doc.querySelectorAll(selector))
    .filter((element) => !isCaptureNoiseElement(element) && (isVisibleElement(element, win) || hasTimelineSemanticEvidence(element, win)))
    .sort((a, b) => scoreTimelineElement(b, win) - scoreTimelineElement(a, win))
    .slice(0, FRAME_ELEMENT_LIMIT);
}

export function sampleElement(element: Element, win: Window): FrameElementSample {
  const rect = element.getBoundingClientRect();
  const style = win.getComputedStyle(element);
  return {
    selector: buildSelector(element),
    tagName: element.tagName.toLowerCase(),
    textSample: cleanText(element.textContent ?? "").slice(0, 80),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    opacity: style.opacity,
    transform: style.transform,
    clipPath: style.clipPath,
    filter: style.filter,
    mixBlendMode: style.mixBlendMode,
    position: style.position,
    backgroundColor: style.backgroundColor,
    color: style.color,
    zIndex: style.zIndex
  };
}

export function countChangedElements(elements: FrameElementSample[], previous: Map<string, string>) {
  return elements.reduce((count, element) => count + (previous.get(element.selector) !== frameSignature(element) ? 1 : 0), 0);
}

export function frameSignature(element: FrameElementSample) {
  return [
    element.rect.x,
    element.rect.y,
    element.rect.width,
    element.rect.height,
    element.opacity,
    element.transform,
    element.clipPath,
    element.filter,
    element.mixBlendMode,
    element.position,
    element.backgroundColor,
    element.color,
    element.zIndex
  ].join("|");
}

export function inferInteractionPatterns(timeline: InteractionTimeline, doc: Document, win: Window): InteractionPattern[] {
  const patterns: InteractionPattern[] = [];
  const allElements = timeline.frameSamples.flatMap((frame) => frame.elements);
  const uniquePointerTargets = new Set(timeline.pointerSamples.map((sample) => sample.targetSelector).filter(Boolean));
  const changedFrameRatio = timeline.frameSamples.length
    ? timeline.frameSamples.filter((frame) => frame.changedElements >= 2).length / timeline.frameSamples.length
    : 0;
  const highPointerSpeedCount = timeline.pointerSamples.filter((sample) => sample.speed > 650).length;
  const hasCanvasOrSvg = allElements.some((element) => element.tagName === "canvas" || element.tagName === "svg");
  const hasDistortionClass = findClassSignal(doc, /(ripple|distort|water|fluid|wave|noise|shader|webgl|gl|canvas)/i);
  const distortionElements = allElements.filter((element) => element.tagName === "canvas" || /ripple|distort|water|fluid|wave|shader|webgl|gl/i.test(`${element.selector} ${element.textSample}`));
  const distortionStage = inferDistortionStage(distortionElements, win);
  const distortionLayerEvidence = inferDistortionLayerEvidence(distortionElements);
  const hasCursorClass = findClassSignal(doc, /(cursor|pointer|magnetic|follow|trail)/i);
  const mediaSelectors = new Set(allElements.filter((element) => ["img", "video", "picture"].includes(element.tagName) || /image|media|gallery/i.test(element.selector)).map((element) => element.selector));
  const hasClip = allElements.some((element) => element.clipPath && element.clipPath !== "none");
  const hasTransformChanges = hasElementStateChanges(timeline.frameSamples, (element) => element.transform);
  const hasOpacityChanges = hasElementStateChanges(timeline.frameSamples, (element) => element.opacity);
  const hasLargeScroll = timeline.scrollSamples.some((sample) => Math.abs(sample.deltaY) > win.innerHeight * 0.35) || (timeline.scrollSamples.at(-1)?.y ?? 0) > win.innerHeight;
  const hasFixedOrSticky = findClassSignal(doc, /(sticky|pin|fixed|stage|scroll)/i) || allElements.some((element) => /position:(fixed|sticky)/i.test(element.selector));
  const hasLoadingSignal = findClassSignal(doc, /(preload|loader|loading|intro|splash)/i) || timeline.frameSamples.some((frame) => frame.t < 1200 && frame.changedElements > 1);
  const hasDetailSignal = findClassSignal(doc, /(modal|dialog|detail|drawer|panel|open)/i);
  const metrics = timeline.metrics ?? buildTimelineMetrics(timeline, win);
  const runtimeAnimations = timeline.runtimeAnimations ?? [];
  const domMutationSamples = timeline.domMutations ?? [];
  const visualSurfaceSamples = timeline.visualSurfaces ?? [];
  const darkPointerSamples = timeline.pointerSamples.filter((sample) => /dark|typography/i.test(sample.phase ?? ""));
  const hasTypographyScale = allElements.some((element) => /^h[1-3]$/.test(element.tagName) && (element.rect.width > win.innerWidth * 0.45 || element.rect.height > win.innerHeight * 0.18));
  const hasStagePhases = (timeline.phases?.length ?? 0) >= 2 || (hasLoadingSignal && (hasLargeScroll || hasMediaSequenceEvidence(allElements)));
  const hasRuntimeAnimationEvidence = runtimeAnimations.length >= 2;
  const hasMutationStateEvidence = domMutationSamples.filter((sample) => sample.attributeName === "class" || sample.attributeName === "style").length >= 4;
  const hasCanvasBitmapEvidence = visualSurfaceSamples.filter((sample) => /canvas/i.test(sample.signal)).length >= 2;
  const hasStyleKeyframes = runtimeAnimations.some((sample) => sample.keyframeCount >= 2 || sample.source === "css-animation");
  const mediaLiquidTargets = new Set(timeline.pointerSamples.map((sample) => sample.targetSelector).filter((selector) => /img|video|picture|media|image|gallery|scene|card/i.test(selector)));
  const mediaLiquidElements = allElements.filter((element) => ["img", "video", "picture"].includes(element.tagName) || /media|image|gallery|scene|card/i.test(element.selector));
  const hasMediaLiquidState = mediaLiquidElements.some((element) => (element.filter && element.filter !== "none") || (element.transform && element.transform !== "none") || (element.clipPath && element.clipPath !== "none") || (element.mixBlendMode && element.mixBlendMode !== "normal"));
  const hasMediaLiquidInteraction = timeline.pointerSamples.length >= 6 && mediaLiquidTargets.size >= 1 && (hasMediaLiquidState || hasTransformChanges || hasOpacityChanges || hasClip || hasDistortionClass);

  if ((hasCanvasOrSvg || hasDistortionClass) && timeline.pointerSamples.length >= 8 && (changedFrameRatio > 0.16 || highPointerSpeedCount >= 4)) {
    patterns.push(pattern("pointer-distortion", 88, [
      `${timeline.pointerSamples.length} pointer samples`,
      hasCanvasOrSvg ? "canvas/svg visual surface detected" : "distortion-like class names detected",
      distortionStage,
      ...distortionLayerEvidence,
      darkPointerSamples.length ? `${darkPointerSamples.length} pointer samples in dark/typography phase` : "",
      `${Math.round(changedFrameRatio * 100)}% sampled frames changed during recording`
    ], [
      "Record pointer x/y, speed, direction, and decay as first-class animation inputs.",
      "Implement the effect as a dedicated canvas/WebGL/SVG displacement layer, not as a hover decoration.",
      "Specify whether the layer sits above typography, between text and media, or behind the hero stage.",
      "Match blend mode, occlusion, trail length, blur radius, and fade-out timing to the recorded stage.",
      "Use reduced-motion fallback only as a fallback, not as the default interpretation."
    ]));
  }

  if (timeline.pointerSamples.length >= 12 && metrics.pointerTravel > win.innerWidth * 0.7 && (hasCanvasOrSvg || hasDistortionClass || darkPointerSamples.length >= 4)) {
    patterns.push(pattern("pointer-trail-field", 86, [
      `pointer travel ${metrics.pointerTravel}px`,
      `max pointer speed ${metrics.maxPointerSpeed}px/s`,
      `${Math.round(metrics.darkFrameRatio * 100)}% dark frames`,
      darkPointerSamples.length ? "pointer activity overlaps dark/typography stage" : "pointer activity recorded across visual field"
    ], [
      "Rebuild the trail as a persistent field with previous-position decay, not a single circle following the cursor.",
      "Track pointer direction and speed to stretch the distortion along the movement vector.",
      "Sample at least three layers: broad blurred wake, mid ribbon, and sharp leading edge.",
      "Place the effect in the recorded stage only; do not leak it into preload/media phases unless the recording proves it.",
      "Validate by moving the pointer diagonally across large typography and comparing trail length, fade, and occlusion."
    ]));
  }

  if (hasRuntimeAnimationEvidence) {
    patterns.push(pattern("runtime-waapi-animation", 84, [
      `${runtimeAnimations.length} runtime animation samples`,
      `${unique(runtimeAnimations.flatMap((sample) => sample.properties)).slice(0, 6).join(", ") || "runtime properties"} animated`,
      `${unique(runtimeAnimations.map((sample) => sample.playState)).join("/") || "play states observed"}`
    ], [
      "Use document.getAnimations() evidence to reproduce active CSS/WAAPI timelines instead of relying only on computed final styles.",
      "Record target selector, keyframe count, timing, easing, playState, currentTime, and animated properties.",
      "When exporting a prototype, create a named timeline per animation group and preserve delays/staggers.",
      "Sample the animation at multiple moments during manual recording to infer entrance order and handoff timing."
    ]));
  }

  if (hasMutationStateEvidence) {
    patterns.push(pattern("dom-mutation-state", 82, [
      `${domMutationSamples.length} DOM mutation samples`,
      `${domMutationSamples.filter((sample) => sample.attributeName === "class").length} class mutations`,
      `${domMutationSamples.filter((sample) => sample.attributeName === "style").length} inline style mutations`
    ], [
      "Treat repeated class/style mutations as JS-driven state changes, not static CSS.",
      "Infer named states from class tokens such as show, hidden, active, join, finish, open, and inview.",
      "For reconstruction, implement an explicit state machine instead of copying one final DOM state.",
      "Record childList mutations when preloader/media items are inserted, removed, or reordered."
    ]));
  }

  if (hasCanvasBitmapEvidence) {
    patterns.push(pattern("canvas-bitmap-sequence", 80, [
      `${visualSurfaceSamples.length} visual surface samples`,
      `${visualSurfaceSamples.filter((sample) => sample.signal === "canvas-readable").length} readable canvas frames`,
      `${visualSurfaceSamples.filter((sample) => sample.signal === "canvas-active").length} active canvas/WebGL surfaces`
    ], [
      "Canvas/WebGL effects need surface-level evidence: canvas size, CSS size, readable/tainted status, and frame signature changes.",
      "Do not attempt to clone proprietary shader code; rebuild the visible behavior with original canvas/WebGL primitives.",
      "If frame signatures change during pointer movement, model the canvas as an interactive visual field.",
      "For WebGL-heavy pages, use Spector.js-style thinking: capture frame state/commands conceptually, then translate to reusable effect primitives."
    ]));
  }

  if (hasStyleKeyframes) {
    patterns.push(pattern("stylesheet-keyframes", 78, [
      `${runtimeAnimations.filter((sample) => sample.source === "css-animation").length} CSS animation samples`,
      `${Math.max(0, ...runtimeAnimations.map((sample) => sample.keyframeCount))} max keyframes observed`
    ], [
      "Preserve keyframe-driven animation names, durations, easing, iteration, and stagger order.",
      "Translate keyframes into reusable motion tokens or GSAP timeline segments.",
      "Avoid flattening keyframe effects into a single transition when the source has discrete phases."
    ]));
  }

  if (hasMediaLiquidInteraction) {
    patterns.push(pattern("media-liquid-distortion", 84, [
      `${timeline.pointerSamples.length} pointer samples`,
      `${mediaLiquidTargets.size} media targets hovered`,
      hasMediaLiquidState ? "image/media filter or clip changes observed" : "media hover path inferred from pointer movement",
      hasTransformChanges ? "transform changes across media frames" : "pointer-driven media state shift"
    ], [
      "Treat the media surface as a fluid lens: pointer position controls radius, direction, and strength of distortion.",
      "Keep the liquid effect local to the hovered image/card; do not turn the whole page into a follower animation.",
      "Use displacement, blur, mask, or layered highlights so the effect feels like refraction rather than a scale-up.",
      "If the source page stages the effect on dark typography or a hero block, keep that stage boundary explicit."
    ]));
  }

  if (hasCursorClass && uniquePointerTargets.size >= 2) {
    patterns.push(pattern("cursor-follower", 80, [
      `${uniquePointerTargets.size} hovered target areas`,
      "cursor/follower/magnetic class signal detected"
    ], [
      "Use a fixed pointer follower that lerps toward pointer coordinates.",
      "Switch cursor label/scale by target affordance such as work card, navigation, or CTA.",
      "Disable custom cursor on touch devices."
    ]));
  }

  if (mediaSelectors.size >= 4 || (mediaSelectors.size >= 2 && hasTransformChanges)) {
    patterns.push(pattern("media-sequence", mediaSelectors.size >= 4 ? 86 : 74, [
      `${mediaSelectors.size} media-like elements observed`,
      hasTransformChanges ? "media transforms changed across frames" : "stacked media sequence observed",
      metrics.mediaStateCount ? `${metrics.mediaStateCount} media/frame states sampled` : ""
    ], [
      "Model the media as an ordered queue with active index, not as independent decorative images.",
      "Capture load state separately from the first stable image state.",
      "Record cadence: first loader icon, image order, hold time, transition easing, and final stable frame.",
      "Use crossfade/clip/translate on a centered stack before handing off to the main layout."
    ]));
  }

  if (hasStagePhases) {
    patterns.push(pattern("stage-state-machine", 88, [
      `${timeline.phases?.length ?? 0} inferred phases`,
      hasLoadingSignal ? "loading/pre-entry signal detected" : "",
      hasLargeScroll ? "scroll-linked phase transition detected" : "",
      `${Math.round(metrics.changedFrameRatio * 100)}% changed-frame ratio`
    ], [
      "Implement preload, stable hero, dark typography, pointer-distortion, work grid, and detail surfaces as named states.",
      "Each state needs entry, active, exit, and reduced-motion behavior.",
      "Do not collapse loader, media queue, and scroll reveal into one generic fade.",
      "Expose the current phase to the visual layers so pointer effects only run in the correct phase.",
      "Verify phase screenshots before exporting the final skill."
    ]));
  }

  if (hasTypographyScale && metrics.darkFrameRatio > 0.12) {
    patterns.push(pattern("typography-phase", 83, [
      "large typography stage observed",
      `${Math.round(metrics.darkFrameRatio * 100)}% dark frames`,
      hasClip ? "clip/mask transition into typography stage" : ""
    ], [
      "Treat oversized type as layout architecture, not text decoration.",
      "Capture line breaks, scale, line-height, fixed anchors, blend mode, and scroll reveal order.",
      "If pointer distortion is present, define whether it crosses above the letters, behind them, or masks through them.",
      "Use actual words/content from the new product; reuse only the typographic rhythm and transition grammar."
    ]));
  }

  if (hasLargeScroll && (hasFixedOrSticky || changedFrameRatio > 0.2)) {
    patterns.push(pattern("scroll-pinned-stage", 84, [
      `${timeline.scrollSamples.length} scroll samples`,
      hasFixedOrSticky ? "sticky/pinned/stage signal detected" : "large frame changes during scroll",
      `max scrollY ${Math.max(0, ...timeline.scrollSamples.map((sample) => sample.y))}`
    ], [
      "Split scroll into named phases: preloader, pinned hero, media handoff, content reveal.",
      "Drive transforms and masks from scroll progress instead of one-off scroll listeners.",
      "Verify each phase at 0%, 25%, 50%, 75%, and 100% progress."
    ]));
  }

  if (hasOpacityChanges || hasTransformChanges) {
    patterns.push(pattern("element-reveal", 72, [
      hasTransformChanges ? "transform changes observed" : "opacity changes observed",
      `${timeline.frameSamples.length} frame samples`
    ], [
      "Use IntersectionObserver or a scroll timeline to stagger title, media, and copy independently.",
      "Keep reveal distances small unless the captured page uses large editorial movement.",
      "Do not replace sequenced entrance with a single global fade."
    ]));
  }

  if (hasClip) {
    patterns.push(pattern("clip-mask-reveal", 82, [
      "clip-path or mask-like state observed"
    ], [
      "Preserve mask/clip reveal as a first-class motion primitive.",
      "Prefer clip-path inset/polygon or CSS mask over opacity-only transitions.",
      "Pair mask reveals with strong typography or media handoff."
    ]));
  }

  if (hasCanvasOrSvg && changedFrameRatio > 0.1) {
    patterns.push(pattern("canvas-webgl-motion", 78, [
      "canvas/svg surface detected",
      `${Math.round(changedFrameRatio * 100)}% frames changed`
    ], [
      "Treat this as a generated visual system rather than ordinary DOM styling.",
      "Recreate with canvas/WebGL/SVG primitives and keep DOM text/layout separate.",
      "Expose reduced-motion fallback that freezes the visual layer."
    ]));
  }

  if (hasLoadingSignal) {
    patterns.push(pattern("loading-sequence", 76, [
      "preload/loading/intro signal observed",
      `${timeline.frameSamples.filter((frame) => frame.t < 1400 && frame.changedElements > 0).length} early changing frames`
    ], [
      "Represent loading as a separate intro sequence, then transition to the first stable layout state.",
      "If media changes during load, capture its queue order and cadence.",
      "Keep intro timing short enough to feel intentional, not blocking."
    ]));
  }

  if (hasDetailSignal) {
    patterns.push(pattern("stateful-detail-surface", 70, [
      "detail/dialog/drawer/panel signal observed"
    ], [
      "Implement detail panels as explicit open/closed states with focus handling.",
      "Reuse source card colors/media in the expanded surface.",
      "Animate with transform and opacity, not layout reflow."
    ]));
  }

  return mergePatterns(patterns);
}

function pattern(kind: InteractionPattern["kind"], confidence: number, evidence: string[], implementationNotes: string[]): InteractionPattern {
  return { kind, confidence, evidence, implementationNotes };
}

function inferDistortionStage(elements: FrameElementSample[], win: Window) {
  if (!elements.length) return "distortion stage unknown";
  const darkLayer = elements.some((element) => isDarkColor(element.backgroundColor) || isLightColor(element.color));
  const majorityDark = elements.filter((element) => element.rect.y < win.innerHeight && /canvas|water|distort|shader|webgl|gl/i.test(`${element.tagName} ${element.selector}`)).length > 0;
  const nearHero = elements.some((element) => element.rect.y < win.innerHeight * 0.8 && element.rect.height > win.innerHeight * 0.45);
  if (darkLayer && nearHero) return "distortion appears in dark typography/hero stage";
  if (majorityDark && nearHero) return "distortion appears in hero stage";
  if (nearHero) return "distortion appears near first viewport";
  return "distortion appears after scroll/content stage";
}

function inferDistortionLayerEvidence(elements: FrameElementSample[]) {
  const evidence: string[] = [];
  if (elements.some((element) => element.mixBlendMode && element.mixBlendMode !== "normal")) {
    evidence.push(`blend mode ${unique(elements.map((element) => element.mixBlendMode).filter((value) => value && value !== "normal")).join("/")}`);
  }
  if (elements.some((element) => element.filter && element.filter !== "none")) {
    evidence.push("filter/blur layer observed");
  }
  if (elements.some((element) => element.rect.width > 700 && element.rect.height > 360)) {
    evidence.push("full-bleed visual layer observed");
  }
  return evidence;
}

export function mergePatterns(patterns: InteractionPattern[]) {
  const seen = new Map<InteractionPattern["kind"], InteractionPattern>();
  for (const item of patterns) {
    const existing = seen.get(item.kind);
    if (!existing || item.confidence > existing.confidence) {
      seen.set(item.kind, {
        ...item,
        evidence: unique([...item.evidence, ...(existing?.evidence ?? [])]).slice(0, 5),
        implementationNotes: unique([...item.implementationNotes, ...(existing?.implementationNotes ?? [])]).slice(0, 5)
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

export function buildTimelineMetrics(timeline: InteractionTimeline, win: Window): TimelineMetrics {
  let pointerTravel = 0;
  for (let index = 1; index < timeline.pointerSamples.length; index += 1) {
    const previous = timeline.pointerSamples[index - 1];
    const current = timeline.pointerSamples[index];
    if (!previous || !current) continue;
    pointerTravel += Math.hypot(current.x - previous.x, current.y - previous.y);
  }

  const pointerSpeeds = timeline.pointerSamples.map((sample) => sample.speed);
  const frameClassifications = timeline.frameSamples.map((frame) => classifyFrameSurface(frame, win));
  const mediaStates = new Set(
    timeline.frameSamples.flatMap((frame) =>
      frame.elements
        .filter((element) => ["img", "video", "picture", "canvas"].includes(element.tagName) || /media|image|gallery|preload|loader/i.test(element.selector))
        .map((element) => frameSignature(element))
    )
  );
  const performanceEvents = timeline.performanceEvents ?? [];
  const layoutShiftScore = performanceEvents
    .filter((event) => event.type === "layout-shift")
    .reduce((total, event) => total + (event.value ?? 0), 0);

  return {
    maxPointerSpeed: Math.max(0, ...pointerSpeeds),
    averagePointerSpeed: pointerSpeeds.length ? Math.round(pointerSpeeds.reduce((total, speed) => total + speed, 0) / pointerSpeeds.length) : 0,
    pointerTravel: Math.round(pointerTravel),
    maxScrollY: Math.max(0, ...timeline.scrollSamples.map((sample) => sample.y), ...timeline.frameSamples.map((frame) => frame.scrollY)),
    changedFrameRatio: timeline.frameSamples.length ? roundRatio(timeline.frameSamples.filter((frame) => frame.changedElements >= 2).length / timeline.frameSamples.length) : 0,
    mediaStateCount: mediaStates.size,
    darkFrameRatio: frameClassifications.length ? roundRatio(frameClassifications.filter((surface) => surface === "dark").length / frameClassifications.length) : 0,
    lightFrameRatio: frameClassifications.length ? roundRatio(frameClassifications.filter((surface) => surface === "light").length / frameClassifications.length) : 0,
    runtimeAnimationCount: timeline.runtimeAnimations?.length ?? 0,
    mutationCount: timeline.domMutations?.length ?? 0,
    visualSurfaceStateCount: timeline.visualSurfaces?.length ?? 0,
    performanceEventCount: performanceEvents.length,
    layoutShiftScore: roundRatio(layoutShiftScore),
    longTaskCount: performanceEvents.filter((event) => event.type === "longtask").length,
    paintCount: performanceEvents.filter((event) => event.type === "paint").length
  };
}

export function inferTimelinePhases(timeline: InteractionTimeline, win: Window): TimelinePhase[] {
  if (!timeline.frameSamples.length) return [];
  const phaseMap = new Map<string, TimelinePhase>();
  for (const frame of timeline.frameSamples) {
    const surface = classifyFrameSurface(frame, win);
    const signals = inferFrameSignals(frame);
    const label = labelFramePhase(frame, surface, signals);
    const existing = phaseMap.get(label);
    const keySelectors = frame.elements
      .filter((element) => signals.some((signal) => signalMatchesElement(signal, element)) || ["canvas", "svg", "video", "img", "picture", "h1", "h2"].includes(element.tagName))
      .map((element) => element.selector)
      .slice(0, 5);
    if (existing) {
      existing.endMs = frame.t;
      existing.scrollRange.min = Math.min(existing.scrollRange.min, frame.scrollY);
      existing.scrollRange.max = Math.max(existing.scrollRange.max, frame.scrollY);
      existing.activeSignals = unique([...existing.activeSignals, ...signals]).slice(0, 8);
      existing.keySelectors = unique([...existing.keySelectors, ...keySelectors]).slice(0, 8);
    } else {
      phaseMap.set(label, {
        id: slugPhase(label),
        label,
        startMs: frame.t,
        endMs: frame.t,
        scrollRange: { min: frame.scrollY, max: frame.scrollY },
        dominantSurface: surface,
        activeSignals: signals.slice(0, 8),
        keySelectors
      });
    }
  }
  return Array.from(phaseMap.values()).sort((a, b) => a.startMs - b.startMs).slice(0, 8);
}

export function mergeTimelineMetrics(metrics: TimelineMetrics[], merged: InteractionTimeline, win: Window): TimelineMetrics | undefined {
  if (!metrics.length) return buildTimelineMetrics(merged, win);
  const averagePointerSpeed = Math.round(metrics.reduce((total, item) => total + item.averagePointerSpeed, 0) / metrics.length);
  return {
    maxPointerSpeed: Math.max(0, ...metrics.map((item) => item.maxPointerSpeed)),
    averagePointerSpeed,
    pointerTravel: metrics.reduce((total, item) => total + item.pointerTravel, 0),
    maxScrollY: Math.max(0, ...metrics.map((item) => item.maxScrollY)),
    changedFrameRatio: roundRatio(metrics.reduce((total, item) => total + item.changedFrameRatio, 0) / metrics.length),
    mediaStateCount: Math.max(0, ...metrics.map((item) => item.mediaStateCount)),
    darkFrameRatio: roundRatio(metrics.reduce((total, item) => total + item.darkFrameRatio, 0) / metrics.length),
    lightFrameRatio: roundRatio(metrics.reduce((total, item) => total + item.lightFrameRatio, 0) / metrics.length),
    runtimeAnimationCount: metrics.reduce((total, item) => total + (item.runtimeAnimationCount ?? 0), 0),
    mutationCount: metrics.reduce((total, item) => total + (item.mutationCount ?? 0), 0),
    visualSurfaceStateCount: metrics.reduce((total, item) => total + (item.visualSurfaceStateCount ?? 0), 0),
    performanceEventCount: metrics.reduce((total, item) => total + (item.performanceEventCount ?? 0), 0),
    layoutShiftScore: roundRatio(metrics.reduce((total, item) => total + (item.layoutShiftScore ?? 0), 0)),
    longTaskCount: metrics.reduce((total, item) => total + (item.longTaskCount ?? 0), 0),
    paintCount: metrics.reduce((total, item) => total + (item.paintCount ?? 0), 0)
  };
}

export function mergeTimelinePhases(phases: TimelinePhase[], merged: InteractionTimeline, win: Window): TimelinePhase[] | undefined {
  if (!phases.length) return inferTimelinePhases(merged, win);
  const seen = new Map<string, TimelinePhase>();
  for (const phase of phases) {
    const existing = seen.get(phase.id);
    if (!existing) {
      seen.set(phase.id, { ...phase, activeSignals: [...phase.activeSignals], keySelectors: [...phase.keySelectors] });
      continue;
    }
    existing.startMs = Math.min(existing.startMs, phase.startMs);
    existing.endMs = Math.max(existing.endMs, phase.endMs);
    existing.scrollRange.min = Math.min(existing.scrollRange.min, phase.scrollRange.min);
    existing.scrollRange.max = Math.max(existing.scrollRange.max, phase.scrollRange.max);
    existing.activeSignals = unique([...existing.activeSignals, ...phase.activeSignals]).slice(0, 8);
    existing.keySelectors = unique([...existing.keySelectors, ...phase.keySelectors]).slice(0, 8);
  }
  return Array.from(seen.values()).sort((a, b) => a.startMs - b.startMs).slice(0, 8);
}

export function inferPointPhase(x: number, y: number, doc: Document, win: Window) {
  const element = doc.elementFromPoint(x, y);
  const style = element instanceof Element ? win.getComputedStyle(element) : null;
  const signal = element instanceof Element ? [element.id, element.getAttribute("class"), element.tagName, cleanText(element.textContent ?? "").slice(0, 60)].filter(Boolean).join(" ") : "";
  const surface = style ? colorSurface(style.backgroundColor, style.color) : "unknown";
  if (/preload|loader|loading|intro|splash/i.test(signal)) return "preload/media-queue";
  if (/hero|headline|title|split|typography/i.test(signal) || /^H[1-3]$/.test(element?.tagName ?? "")) return surface === "dark" ? "dark-typography" : "light-hero";
  if (/work|project|card|case|scene|gallery/i.test(signal)) return "work-grid";
  if (surface === "dark") return "dark-stage";
  if (y < win.innerHeight * 0.9) return "hero-stage";
  return "content-stage";
}

function inferFrameSignals(frame: FrameSample) {
  const signals: string[] = [];
  if (frame.t < 1800) signals.push("early/loading window");
  if (frame.elements.some((element) => /preload|loader|loading|intro|splash/i.test(`${element.selector} ${element.textSample}`))) signals.push("preloader");
  if (frame.elements.some((element) => ["img", "video", "picture"].includes(element.tagName) || /media|image|gallery/i.test(element.selector))) signals.push("media sequence");
  if (frame.elements.some((element) => ["img", "video", "picture"].includes(element.tagName) && ((element.filter && element.filter !== "none") || (element.transform && element.transform !== "none") || (element.clipPath && element.clipPath !== "none") || (element.mixBlendMode && element.mixBlendMode !== "normal")))) signals.push("media liquid distortion");
  if (frame.elements.some((element) => /^h[1-3]$/.test(element.tagName) && element.rect.width > 360)) signals.push("large typography");
  if (frame.elements.some((element) => element.tagName === "canvas" || /canvas|webgl|shader|water|distort|ripple|fluid/i.test(element.selector))) signals.push("canvas/distortion layer");
  if (frame.elements.some((element) => element.clipPath && element.clipPath !== "none")) signals.push("clip/mask reveal");
  if (frame.elements.some((element) => ["fixed", "sticky"].includes(element.position ?? ""))) signals.push("fixed/sticky layer");
  if (frame.changedElements >= 3) signals.push("multi-element transition");
  return unique(signals);
}

function labelFramePhase(frame: FrameSample, surface: TimelinePhase["dominantSurface"], signals: string[]) {
  if (signals.includes("preloader") || (frame.t < 1800 && signals.includes("media sequence"))) return "preloader media queue";
  if (signals.includes("media liquid distortion")) return "media liquid hover stage";
  if (surface === "dark" && signals.includes("large typography")) return "dark typography distortion stage";
  if (signals.includes("canvas/distortion layer") && surface === "dark") return "dark pointer visual field";
  if (signals.includes("clip/mask reveal")) return "clip reveal handoff";
  if (signals.includes("large typography")) return "hero typography stage";
  if (signals.includes("media sequence")) return "media handoff stage";
  return surface === "dark" ? "dark content stage" : "light content stage";
}

function signalMatchesElement(signal: string, element: FrameElementSample) {
  if (signal.includes("media")) return ["img", "video", "picture"].includes(element.tagName) || /media|image|gallery/i.test(element.selector);
  if (signal.includes("typography")) return /^h[1-3]$/.test(element.tagName);
  if (signal.includes("canvas")) return element.tagName === "canvas" || /canvas|webgl|shader|water|distort|ripple|fluid/i.test(element.selector);
  if (signal.includes("clip")) return element.clipPath && element.clipPath !== "none";
  if (signal.includes("fixed")) return ["fixed", "sticky"].includes(element.position ?? "");
  return false;
}

function classifyFrameSurface(frame: FrameSample, win: Window): TimelinePhase["dominantSurface"] {
  const visible = frame.elements.filter((element) => element.rect.width > 1 && element.rect.height > 1);
  const areaTotals = visible.reduce(
    (total, element) => {
      const area = Math.min(element.rect.width, win.innerWidth) * Math.min(element.rect.height, win.innerHeight);
      const surface = colorSurface(element.backgroundColor, element.color);
      if (surface === "dark") total.dark += area;
      if (surface === "light") total.light += area;
      return total;
    },
    { dark: 0, light: 0 }
  );
  if (!areaTotals.dark && !areaTotals.light) return "unknown";
  if (areaTotals.dark > areaTotals.light * 1.4) return "dark";
  if (areaTotals.light > areaTotals.dark * 1.4) return "light";
  return "mixed";
}

function colorSurface(backgroundColor?: string, color?: string): TimelinePhase["dominantSurface"] {
  if (isDarkColor(backgroundColor)) return "dark";
  if (isLightColor(backgroundColor)) return "light";
  if (isLightColor(color)) return "dark";
  if (isDarkColor(color)) return "light";
  return "unknown";
}

function isDarkColor(value?: string) {
  const rgb = parseRgb(value);
  if (!rgb || rgb.alpha < 0.35) return false;
  return rgb.luma < 72;
}

function isLightColor(value?: string) {
  const rgb = parseRgb(value);
  if (!rgb || rgb.alpha < 0.35) return false;
  return rgb.luma > 185;
}

function parseRgb(value?: string) {
  if (!value || value === "transparent") return null;
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1]?.split(",").map((item) => item.trim()) ?? [];
  const [r = "", g = "", b = "", alpha = "1"] = parts;
  const red = Number.parseFloat(r);
  const green = Number.parseFloat(g);
  const blue = Number.parseFloat(b);
  const parsedAlpha = Number.parseFloat(alpha);
  if (![red, green, blue].every(Number.isFinite)) return null;
  return {
    alpha: Number.isFinite(parsedAlpha) ? parsedAlpha : 1,
    luma: 0.2126 * red + 0.7152 * green + 0.0722 * blue
  };
}

function roundRatio(value: number) {
  return Math.round(value * 100) / 100;
}

function slugPhase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function hasElementStateChanges(frames: FrameSample[], getValue: (element: FrameElementSample) => string) {
  const values = new Map<string, Set<string>>();
  for (const frame of frames) {
    for (const element of frame.elements) {
      if (!values.has(element.selector)) values.set(element.selector, new Set());
      values.get(element.selector)?.add(getValue(element));
    }
  }
  return Array.from(values.values()).some((set) => set.size >= 2 && !Array.from(set).every((value) => value === "none" || value === "1"));
}

function hasMediaSequenceEvidence(elements: FrameElementSample[]) {
  return elements.filter((element) => ["img", "video", "picture"].includes(element.tagName) || /media|image|gallery|preload/i.test(element.selector)).length >= 2;
}

export function hasTimelineSemanticEvidence(element: Element, win: Window) {
  const style = win.getComputedStyle(element);
  const signal = [element.id, element.getAttribute("class"), element.getAttribute("aria-label"), element.getAttribute("role")].filter(Boolean).join(" ");
  return (
    /(canvas|webgl|gl|shader|ripple|distort|water|fluid|wave|cursor|magnetic|preload|loader|hero|work|project|media|gallery|sticky|pin|mask|clip|reveal)/i.test(signal) ||
    style.position === "fixed" ||
    style.position === "sticky" ||
    (style.clipPath && style.clipPath !== "none") ||
    (style.transform && style.transform !== "none") ||
    (style.mixBlendMode && style.mixBlendMode !== "normal")
  );
}

function scoreTimelineElement(element: Element, win: Window) {
  const rect = element.getBoundingClientRect();
  const visibleArea = Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0));
  const tag = element.tagName.toLowerCase();
  const signal = [element.id, element.getAttribute("class"), element.getAttribute("role")].filter(Boolean).join(" ");
  const mediaBonus = ["canvas", "svg", "video", "img", "picture"].includes(tag) ? win.innerWidth * 160 : 0;
  const semanticBonus = /(ripple|distort|water|fluid|wave|cursor|preload|hero|work|project|media|gallery|sticky|pin|mask|clip|reveal)/i.test(signal) ? win.innerWidth * 120 : 0;
  return visibleArea + mediaBonus + semanticBonus;
}

function findClassSignal(doc: Document, pattern: RegExp) {
  const walker = doc.createTreeWalker(doc.documentElement, 1);
  let current: Node | null = doc.documentElement;
  let scanned = 0;
  while (current && scanned < CLASS_SIGNAL_SCAN_LIMIT) {
    if (current instanceof Element && !isCaptureNoiseElement(current)) {
      const signal = [current.id, current.getAttribute("class"), current.getAttribute("role"), current.getAttribute("aria-label")].filter(Boolean).join(" ");
      if (pattern.test(signal)) return true;
    }
    scanned += 1;
    current = walker.nextNode();
  }
  return false;
}

export function trim<T>(items: T[], max: number) {
  if (items.length > max) items.splice(0, items.length - max);
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}
