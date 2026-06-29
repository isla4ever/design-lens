import type { DesignCapture, InteractionTimeline, RuntimeAnimationSample, VisualSurfaceSample } from "../shared/schema";

export type EvidenceEventKind =
  | "meta"
  | "snapshot-summary"
  | "implementation"
  | "pointer"
  | "scroll"
  | "mutation"
  | "animation"
  | "visual-surface"
  | "performance";

export type EvidenceEvent = {
  kind: EvidenceEventKind;
  t: number;
  summary: string;
  selector?: string;
  data?: Record<string, number | string | boolean>;
};

export type EvidenceGap = {
  severity: "info" | "warning";
  area: "loading" | "pointer" | "scroll" | "animation" | "surface" | "component";
  message: string;
};

export type PrototypeRecipe = {
  scope: "page" | "component";
  recommendedTemplate: "page-stage" | "component-module";
  states: string[];
  motionHooks: string[];
  acceptanceChecks: string[];
};

export type EvidencePack = {
  version: 1;
  source: {
    title: string;
    url: string;
    scope: "page" | "component";
    capturedAt: string;
    viewport: string;
  };
  counts: {
    tokens: number;
    components: number;
    motion: number;
    interactions: number;
    replayEvents: number;
    patterns: number;
  };
  replayEvents: EvidenceEvent[];
  gaps: EvidenceGap[];
  prototypeRecipe: PrototypeRecipe;
};

export function buildEvidencePack(capture: DesignCapture): EvidencePack {
  const timeline = capture.interactionTimeline;
  const replayEvents = buildReplayEvents(capture);
  const scope = capture.scope ?? "page";
  return {
    version: 1,
    source: {
      title: capture.page.title,
      url: capture.page.url,
      scope,
      capturedAt: capture.page.capturedAt,
      viewport: `${capture.viewport.width}x${capture.viewport.height}@${capture.viewport.devicePixelRatio}`
    },
    counts: {
      tokens:
        capture.tokens.colors.length +
        capture.tokens.backgrounds.length +
        capture.tokens.spacing.length +
        capture.tokens.radii.length +
        capture.tokens.shadows.length +
        capture.tokens.typography.length,
      components: capture.components.length,
      motion: capture.motion.length,
      interactions: capture.interactions.length,
      replayEvents: replayEvents.length,
      patterns: timeline?.patterns.length ?? 0
    },
    replayEvents,
    gaps: inferEvidenceGaps(capture, timeline),
    prototypeRecipe: buildPrototypeRecipe(capture)
  };
}

export function buildReplayEvents(capture: DesignCapture): EvidenceEvent[] {
  const timeline = capture.interactionTimeline;
  const events: EvidenceEvent[] = [
    {
      kind: "meta",
      t: 0,
      summary: `${capture.page.title || "Untitled"} ${capture.viewport.width}x${capture.viewport.height}`,
      data: {
        scope: capture.scope ?? "page",
        componentCount: capture.components.length,
        motionCount: capture.motion.length
      }
    },
    {
      kind: "snapshot-summary",
      t: 0,
      summary: `${capture.layoutProfile.composition}; ${capture.layoutProfile.density} density`,
      data: {
        layoutRules: capture.layout.length,
        evidenceItems: capture.evidence.length
      }
    }
  ];

  const trace = capture.implementationTrace;
  if (trace) {
    events.push(
      {
        kind: "implementation",
        t: 0,
        summary: `assets ${trace.assets.length}; frameworks ${trace.frameworkSignals.join(", ") || "unknown"}; libraries ${trace.librarySignals.join(", ") || "unknown"}`,
        data: {
          assets: trace.assets.length,
          frameworks: trace.frameworkSignals.length,
          libraries: trace.librarySignals.length,
          sourceMapHints: trace.sourceMapHints.length
        }
      },
      ...trace.assets.slice(0, 14).map((asset): EvidenceEvent => ({
        kind: "implementation",
        t: 0,
        summary: `${asset.kind} ${asset.label} ${asset.signals.join("+")}`,
        data: {
          thirdParty: asset.origin === "third-party" || asset.origin === "cdn",
          signalCount: asset.signals.length
        }
      }))
    );
  }

  if (!timeline) return events;

  events.push(
    ...timeline.pointerSamples.slice(0, 36).map((sample): EvidenceEvent => ({
      kind: "pointer",
      t: sample.t,
      selector: sample.targetSelector,
      summary: `${sample.type ?? "move"} ${sample.x},${sample.y} speed ${sample.speed}px/s phase ${sample.phase ?? "unknown"}`,
      data: {
        x: sample.x,
        y: sample.y,
        speed: sample.speed,
        directionDeg: sample.directionDeg ?? 0
      }
    })),
    ...timeline.scrollSamples.slice(0, 24).map((sample): EvidenceEvent => ({
      kind: "scroll",
      t: sample.t,
      summary: `scroll ${sample.y}px velocity ${sample.velocity}px/s`,
      data: { x: sample.x, y: sample.y, deltaY: sample.deltaY, velocity: sample.velocity }
    })),
    ...(timeline.domMutations ?? []).slice(0, 28).map((sample): EvidenceEvent => ({
      kind: "mutation",
      t: sample.t,
      selector: sample.selector,
      summary: `${sample.type} ${sample.attributeName ?? "nodes"} ${sample.className ?? ""}`.trim(),
      data: {
        addedNodes: sample.addedNodes ?? 0,
        removedNodes: sample.removedNodes ?? 0
      }
    })),
    ...(timeline.runtimeAnimations ?? []).slice(0, 28).map(animationEvent),
    ...(timeline.visualSurfaces ?? []).slice(0, 24).map(surfaceEvent),
    ...(timeline.performanceEvents ?? []).slice(0, 18).map((sample): EvidenceEvent => ({
      kind: "performance",
      t: sample.t,
      summary: `${sample.type} ${sample.name} ${sample.duration}ms`,
      data: {
        startTime: sample.startTime,
        duration: sample.duration,
        value: sample.value ?? 0
      }
    }))
  );

  return events.sort((a, b) => a.t - b.t).slice(0, 120);
}

function animationEvent(sample: RuntimeAnimationSample): EvidenceEvent {
  return {
    kind: "animation",
    t: sample.t,
    selector: sample.selector,
    summary: `${sample.source} ${sample.name} ${sample.durationMs}ms ${sample.easing} ${sample.properties.join("+") || "state"}`,
    data: {
      currentTimeMs: sample.currentTimeMs,
      durationMs: sample.durationMs,
      keyframeCount: sample.keyframeCount,
      playbackRate: sample.playbackRate ?? 1
    }
  };
}

function surfaceEvent(sample: VisualSurfaceSample): EvidenceEvent {
  return {
    kind: "visual-surface",
    t: sample.t,
    selector: sample.selector,
    summary: `${sample.signal} ${sample.tagName} ${sample.cssWidth}x${sample.cssHeight}`,
    data: {
      width: sample.width,
      height: sample.height,
      cssWidth: sample.cssWidth,
      cssHeight: sample.cssHeight,
      hasFrameSignature: Boolean(sample.frameSignature)
    }
  };
}

function inferEvidenceGaps(capture: DesignCapture, timeline?: InteractionTimeline): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  if (!timeline) {
    return [
      { severity: "warning", area: "pointer", message: "No manual recording timeline. Record pointer movement, hover, scroll, and loading states before relying on motion guidance." },
      { severity: "warning", area: "animation", message: "Only static CSS evidence is available; runtime animation order and state changes are unknown." }
    ];
  }
  if (timeline.durationMs < 2500) gaps.push({ severity: "warning", area: "loading", message: "Recording is short; intro/loading and delayed reveals may be under-sampled." });
  if (timeline.pointerSamples.length < 10) gaps.push({ severity: "warning", area: "pointer", message: "Pointer path evidence is weak; hover distortion, cursor fields, and media refraction may be missed." });
  if (timeline.scrollSamples.length < 2 && capture.scope !== "component") gaps.push({ severity: "info", area: "scroll", message: "No meaningful scroll timeline; page-level pinned or reveal effects may need another pass." });
  if ((timeline.runtimeAnimations?.length ?? 0) < 1 && capture.motion.length < 1) gaps.push({ severity: "info", area: "animation", message: "No runtime animation evidence; generated motion should stay conservative." });
  if ((timeline.visualSurfaces?.length ?? 0) < 1) gaps.push({ severity: "info", area: "surface", message: "No canvas/video/image/svg surface evidence; visual effects may need manual description or CDP companion capture." });
  if (!capture.implementationTrace?.assets.length) gaps.push({ severity: "info", area: "component", message: "No implementation trace assets captured; framework/library/source-map hints may need a fresh page recording." });
  if (capture.scope === "component" && capture.components.length < 1) gaps.push({ severity: "warning", area: "component", message: "Selected component root did not yield a stable component model; pick a larger module boundary." });
  return gaps;
}

function buildPrototypeRecipe(capture: DesignCapture): PrototypeRecipe {
  const timeline = capture.interactionTimeline;
  const patternKinds = timeline?.patterns.map((pattern) => pattern.kind) ?? [];
  const hasLoading = patternKinds.includes("loading-sequence") || patternKinds.includes("media-sequence");
  const hasPointer = patternKinds.includes("pointer-distortion") || patternKinds.includes("pointer-trail-field");
  const hasMedia = patternKinds.includes("media-liquid-distortion") || patternKinds.includes("canvas-bitmap-sequence") || patternKinds.includes("canvas-webgl-motion");
  const hasState = patternKinds.includes("dom-mutation-state") || patternKinds.includes("stage-state-machine") || capture.interactions.length > 0;
  const scope = capture.scope ?? "page";
  return {
    scope,
    recommendedTemplate: scope === "component" ? "component-module" : "page-stage",
    states: [
      hasLoading ? "loading/intro" : "",
      "stable",
      hasPointer ? "pointer-field" : "",
      hasMedia ? "media-hover" : "",
      hasState ? "open/active" : ""
    ].filter(Boolean),
    motionHooks: [
      hasLoading ? "intro timeline" : "",
      hasPointer ? "pointer x/y/speed/direction decay" : "",
      hasMedia ? "localized visual displacement layer" : "",
      patternKinds.includes("scroll-pinned-stage") ? "scroll progress" : "",
      capture.motion.length ? "CSS/WAAPI timing preservation" : ""
    ].filter(Boolean),
    acceptanceChecks: [
      "Static layout matches captured density, alignment, and hierarchy.",
      "Motion uses captured duration/easing/order instead of generic fade-ins.",
      "Interactive states are scoped to the captured component or page stage.",
      "Prototype remains original: no source imagery, copy, brand, or code."
    ]
  };
}
