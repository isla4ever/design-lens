import type { DesignCapture, InteractionSpec, MotionSpec, RuntimeAnimationSample } from "../../shared/schema";
import {
  CAPTURE_PROJECT_VERSION,
  parseCaptureProject,
  type AnimationEvidenceV2,
  type CaptureProjectV2,
  type InteractionGraphV2,
  type StyleEvidenceV2
} from "./capture-project";

export function captureProjectFromDesignCapture(capture: DesignCapture, mode: CaptureProjectV2["mode"] = "reference"): CaptureProjectV2 {
  const projectId = buildProjectId(capture);
  const fallbackSceneId = `scene-${capture.viewport.width}x${capture.viewport.height}-initial`;
  const scenes = buildScenes(capture, fallbackSceneId);
  const sceneId = scenes[0]?.id ?? fallbackSceneId;
  const captureJson = JSON.stringify(capture, null, 2);
  const styles = buildStyles(capture, sceneId);
  const animations = buildAnimations(capture, sceneId);
  const motionCheckpoints = buildMotionCheckpoints(capture);
  const canvasFrames = buildCanvasFrames(capture);
  const interactions = buildInteractionGraph(capture.interactions);
  const project: CaptureProjectV2 = {
    version: CAPTURE_PROJECT_VERSION,
    id: projectId,
    mode,
    source: {
      title: capture.page.title,
      url: capture.page.url,
      scope: capture.scope ?? "page",
      capturedAt: capture.page.capturedAt
    },
    policy: {
      assetMode: "manifest-only",
      captureCanvas: capture.rebuildEvidence?.privacy.recordCanvas ?? false,
      maskInputs: true,
      includeText: true,
      blockSelectors: ["#design-lens-overlay-root", "#design-lens-capture-privacy-mask", "input[type='password']"]
    },
    capabilities: {
      content: true,
      rrweb: Boolean(capture.rebuildEvidence?.rrweb),
      cdp: getDeepCollectors(capture).length > 0,
      screenshots: Boolean(capture.rebuildEvidence?.scenes.some((scene) => scene.status === "captured" && scene.screenshotArtifactId)),
      multiViewport: new Set(capture.rebuildEvidence?.scenes.map((scene) => `${scene.viewport.width}x${scene.viewport.height}`) ?? []).size > 1,
      matchedStyles: getDeepCollectors(capture).some((collector) => collector.styles.some((style) => style.matchedRules.length)),
      animationTimeline: animations.length > 0,
      canvas: Boolean(canvasFrames.length || capture.interactionTimeline?.visualSurfaces?.some((surface) => surface.tagName === "canvas"))
    },
    scenes,
    nodes: buildNodes(capture, sceneId),
    styles,
    assets: (capture.implementationTrace?.assets ?? []).map((asset, index) => ({
      id: `asset-${index + 1}-${shortHash(asset.url ?? asset.label)}`,
      kind: asset.kind,
      label: asset.label,
      ...(asset.url ? { url: asset.url } : {}),
      origin: asset.origin,
      signals: asset.signals,
      bundled: false
    })),
    interactions,
    animations,
    motionCheckpoints,
    ...(canvasFrames.length ? { canvasFrames } : {}),
    artifacts: {
      "capture-v1": {
        id: "capture-v1",
        kind: "capture",
        name: "capture-v1.json",
        mediaType: "application/json",
        size: new TextEncoder().encode(captureJson).byteLength,
        createdAt: capture.page.capturedAt
      },
      ...Object.fromEntries((capture.rebuildEvidence?.artifacts ?? []).map((artifact) => [artifact.id, {
        id: artifact.id,
        kind: artifact.kind,
        name: artifact.name,
        mediaType: artifact.mediaType,
        size: artifact.size,
        createdAt: artifact.createdAt
      }]))
    },
    coverage: buildCoverage(capture, styles, animations),
    createdAt: capture.page.capturedAt,
    updatedAt: capture.page.capturedAt
  };

  return parseCaptureProject(project);
}

function buildNodes(capture: DesignCapture, sceneId: string): CaptureProjectV2["nodes"] {
  const deepStyles = getDeepCollectors(capture).flatMap((collector) => collector.styles.map((style) => ({ ...style, sceneId: style.sceneId ?? collector.sceneId })));
  const deepByNodeId = new Map<string, typeof deepStyles>();
  for (const style of deepStyles) deepByNodeId.set(style.nodeId, [...(deepByNodeId.get(style.nodeId) ?? []), style]);
  return Object.fromEntries(capture.components.map((component) => {
    const deep = deepByNodeId.get(component.id) ?? [];
    const representative = deep[0];
    const rectByScene = Object.fromEntries(deep.flatMap((style) => style.rect && style.sceneId ? [[style.sceneId, style.rect]] : []));
    return [component.id, {
      id: component.id,
      sceneIds: Array.from(new Set([sceneId, ...deep.flatMap((style) => style.sceneId ? [style.sceneId] : [])])),
      ...(representative?.backendNodeId ? { backendNodeId: representative.backendNodeId } : {}),
      selector: component.selector,
      tagName: representative?.tagName ?? component.tagName,
      textSample: component.textSample,
      rectByScene,
      matchConfidence: component.confidence / 100
    }];
  }));
}

function buildScenes(capture: DesignCapture, fallbackSceneId: string): CaptureProjectV2["scenes"] {
  const rebuildScenes = capture.rebuildEvidence?.scenes;
  if (rebuildScenes?.length) {
    const motionCheckpoints = buildMotionCheckpoints(capture);
    return rebuildScenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      viewport: {
        width: scene.viewport.width,
        height: scene.viewport.height,
        deviceScaleFactor: scene.viewport.devicePixelRatio
      },
      triggers: scene.phase === "recording-start" || scene.phase === "responsive-initial"
        ? [{ kind: "initial" as const }]
        : scene.phase === "forced-hover" || scene.phase === "observed-hover"
          ? [{ kind: "hover" as const, ...(scene.selector ? { selector: scene.selector } : {}) }]
          : scene.phase === "forced-focus" || scene.phase === "observed-focus"
            ? [{ kind: "focus" as const, ...(scene.selector ? { selector: scene.selector } : {}) }]
            : scene.phase === "observed-open"
              ? [{ kind: "open" as const, ...(scene.selector ? { selector: scene.selector } : {}) }]
              : [{ kind: "scroll" as const, value: scene.scroll.y }],
      scroll: scene.scroll,
      capture: {
        fullPage: false,
        maskNodeIds: Array.from(new Set(motionCheckpoints.filter((checkpoint) => checkpoint.sceneId === scene.id).flatMap((checkpoint) => [
          ...checkpoint.maskNodeIds,
          ...checkpoint.animations.flatMap((animation) => animation.nodeId ? [animation.nodeId] : [])
        ])))
      },
      ...(scene.screenshotArtifactId ? { screenshotArtifactId: scene.screenshotArtifactId } : {}),
      ...(scene.domSnapshotArtifactId ? { domSnapshotArtifactId: scene.domSnapshotArtifactId } : {}),
      ...(scene.rrwebEventRange ? { rrwebEventRange: scene.rrwebEventRange } : {}),
      ...(scene.capturedAt ? { capturedAt: scene.capturedAt } : {}),
      status: scene.status
    }));
  }
  return [{
    id: fallbackSceneId,
    name: "Initial captured viewport",
    viewport: {
      width: capture.viewport.width,
      height: capture.viewport.height,
      deviceScaleFactor: capture.viewport.devicePixelRatio
    },
    triggers: [{ kind: "initial" }],
    scroll: { x: 0, y: capture.interactionTimeline?.frameSamples[0]?.scrollY ?? 0 },
    capture: { fullPage: false, maskNodeIds: [] },
    capturedAt: capture.page.capturedAt,
    status: "captured"
  }];
}

function buildStyles(capture: DesignCapture, sceneId: string) {
  const styles = Object.fromEntries(capture.components.map((component): [string, StyleEvidenceV2] => {
    const id = `style-${component.id}-${sceneId}`;
    return [id, {
      id,
      nodeId: component.id,
      sceneId,
      computed: {
        color: component.visual.color,
        "background-color": component.visual.backgroundColor,
        font: component.visual.font,
        "border-radius": component.visual.borderRadius,
        "box-shadow": component.visual.boxShadow,
        border: component.visual.border,
        display: component.layout.display,
        position: component.layout.position,
        gap: component.layout.gap,
        "grid-template-columns": component.layout.gridTemplateColumns,
        "flex-direction": component.layout.flexDirection,
        "align-items": component.layout.alignItems,
        "justify-content": component.layout.justifyContent
      },
      matchedRules: [],
      cssVariables: {},
      pseudoStates: [],
      source: "legacy"
    }];
  }));
  const deepCollectors = getDeepCollectors(capture);
  if (!deepCollectors.length) return styles;
  for (const collector of deepCollectors) for (const evidence of collector.styles) {
    const evidenceSceneId = evidence.sceneId ?? collector.sceneId;
    const id = `style-${evidence.nodeId}-${evidenceSceneId}`;
    styles[id] = {
      id,
      nodeId: evidence.nodeId,
      sceneId: evidenceSceneId,
      computed: evidence.computed,
      matchedRules: evidence.matchedRules,
      cssVariables: evidence.cssVariables,
      pseudoStates: evidence.pseudoStates ?? [],
      source: "cdp"
    };
  }
  return styles;
}

function buildAnimations(capture: DesignCapture, sceneId: string): AnimationEvidenceV2[] {
  const staticAnimations = capture.motion.map((motion, index) => motionToAnimation(motion, sceneId, index));
  const runtimeAnimations = (capture.interactionTimeline?.runtimeAnimations ?? []).map((animation, index) => runtimeToAnimation(animation, sceneId, index));
  const deepAnimations = getDeepCollectors(capture).flatMap((collector) => collector.animations.map((animation): AnimationEvidenceV2 => ({
    id: `cdp-${animation.id}-${shortHash(animation.sceneId ?? collector.sceneId)}`,
    ...(animation.nodeId ? { nodeId: animation.nodeId } : {}),
    ...(animation.selector ? { selector: animation.selector } : {}),
    sceneId: animation.sceneId ?? collector.sceneId,
    name: animation.name,
    source: `cdp-${animation.type}`,
    durationMs: animation.durationMs,
    delayMs: animation.delayMs,
    easing: animation.easing,
    properties: [],
    ...(animation.keyframes ? { keyframes: animation.keyframes } : {})
  })));
  const seen = new Set<string>();
  return [...staticAnimations, ...runtimeAnimations, ...deepAnimations].filter((animation) => {
    const key = `${animation.sceneId}|${animation.selector}|${animation.name}|${animation.durationMs}|${animation.properties.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMotionCheckpoints(capture: DesignCapture): NonNullable<CaptureProjectV2["motionCheckpoints"]> {
  const seen = new Set<string>();
  return getDeepCollectors(capture).flatMap((collector) => collector.motionCheckpoints ?? []).filter((checkpoint) => {
    if (seen.has(checkpoint.id)) return false;
    seen.add(checkpoint.id);
    return true;
  });
}

function buildCanvasFrames(capture: DesignCapture): NonNullable<CaptureProjectV2["canvasFrames"]> {
  const seen = new Set<string>();
  return getDeepCollectors(capture).flatMap((collector) => collector.canvasFrames ?? []).filter((frame) => {
    if (seen.has(frame.id)) return false;
    seen.add(frame.id);
    return true;
  });
}

function motionToAnimation(motion: MotionSpec, sceneId: string, index: number): AnimationEvidenceV2 {
  return {
    id: `motion-${index + 1}-${shortHash(`${motion.selector}-${motion.name}`)}`,
    selector: motion.selector,
    sceneId,
    name: motion.name,
    source: motion.type,
    durationMs: motion.durationMs,
    delayMs: motion.delayMs,
    easing: motion.easing,
    properties: motion.properties
  };
}

function runtimeToAnimation(animation: RuntimeAnimationSample, sceneId: string, index: number): AnimationEvidenceV2 {
  return {
    id: `runtime-${index + 1}-${shortHash(`${animation.selector}-${animation.name}`)}`,
    selector: animation.selector,
    sceneId,
    name: animation.name,
    source: animation.source,
    durationMs: animation.durationMs,
    delayMs: animation.delayMs,
    easing: animation.easing,
    properties: animation.properties,
    ...(animation.keyframes ? { keyframes: animation.keyframes } : {})
  };
}

function buildInteractionGraph(interactions: InteractionSpec[]): InteractionGraphV2 {
  const states: InteractionGraphV2["states"] = [{ id: "stable", label: "Stable captured state" }];
  const transitions: InteractionGraphV2["transitions"] = [];
  for (const interaction of interactions) {
    const stateId = `state-${interaction.id}`;
    states.push({ id: stateId, label: `${interaction.trigger} ${interaction.affordance}` });
    transitions.push({
      id: `transition-${interaction.id}`,
      from: "stable",
      to: stateId,
      trigger: interaction.trigger,
      evidenceIds: [interaction.id],
      source: "inferred"
    });
  }
  return { states, transitions };
}

function buildCoverage(capture: DesignCapture, styles: Record<string, StyleEvidenceV2>, animations: AnimationEvidenceV2[]): CaptureProjectV2["coverage"] {
  const rebuild = capture.rebuildEvidence;
  const deepCollectors = getDeepCollectors(capture);
  const baselineCollectors = deepCollectors.filter((collector) => collector.scenes?.some((scene) => scene.phase === "responsive-initial"));
  const domSnapshotArtifacts = baselineCollectors.flatMap((collector) => collector.artifacts.filter((artifact) => artifact.kind === "dom-snapshot"));
  const domSnapshotArtifact = domSnapshotArtifacts[0];
  const requestedViewports = rebuild?.request?.viewports ?? [];
  const capturedResponsiveScenes = rebuild?.scenes.filter((scene) => scene.phase === "responsive-initial" && scene.status === "captured" && scene.screenshotArtifactId) ?? [];
  const capturedViewportKinds = new Set(capturedResponsiveScenes.map((scene) => scene.viewport.width < 768 ? "mobile" : "desktop"));
  const responsiveComplete = Boolean(requestedViewports.length) && requestedViewports.every((viewport) => capturedViewportKinds.has(viewport));
  const requestedStates = rebuild?.request?.states.filter((state) => state !== "initial") ?? [];
  const stateScenes = rebuild?.scenes.filter((scene) => (scene.status === "captured" && scene.screenshotArtifactId) || scene.status === "not-applicable") ?? [];
  const requestedStatePairs = requestedViewports.flatMap((viewport) => requestedStates.map((state) => ({ viewport, state })));
  const stateCoverageComplete = Boolean(requestedStatePairs.length) && requestedStatePairs.every(({ viewport, state }) => stateScenes.some((scene) => {
    const sceneViewport = scene.viewport.width < 768 ? "mobile" : "desktop";
    if (sceneViewport !== viewport) return false;
    if (state === "scroll") return (scene.phase === "page-baseline" && scene.scroll.y > 0) || scene.phase === "responsive-scroll";
    if (state === "hover") return scene.phase === "forced-hover" || scene.phase === "observed-hover";
    if (state === "focus") return scene.phase === "forced-focus" || scene.phase === "observed-focus";
    return scene.phase === "observed-open";
  }));
  const domSnapshotsComplete = responsiveComplete && domSnapshotArtifacts.length >= requestedViewports.length;
  const deepStylesComplete = Boolean(baselineCollectors.length)
    && responsiveComplete
    && baselineCollectors.every((collector) => {
      const initialScenes = (collector.scenes ?? []).filter((scene) => scene.phase === "responsive-initial" && scene.status === "captured");
      return Boolean(collector.requestedNodeCount) && Boolean(initialScenes.length) && initialScenes.every((scene) => {
        const sceneStyles = collector.styles.filter((style) => (style.sceneId ?? collector.sceneId) === scene.id);
        return new Set(sceneStyles.map((style) => style.nodeId)).size === collector.requestedNodeCount
          && sceneStyles.every((style) => style.matchedRules.length);
      });
    });
  const screenshotScenes = rebuild?.scenes.filter((scene) => scene.screenshotArtifactId) ?? [];
  const motionCheckpoints = buildMotionCheckpoints(capture).filter((checkpoint) => checkpoint.status === "captured" && checkpoint.screenshotArtifactId);
  const canvasFrames = buildCanvasFrames(capture);
  const readableCanvasFrames = canvasFrames.filter((frame) => frame.status === "readable" && frame.artifactId);
  const unavailableCanvasFrames = canvasFrames.filter((frame) => frame.status !== "readable");
  const baselineScenes = rebuild?.scenes.filter((scene) => scene.phase === "page-baseline") ?? [];
  const screenshotsComplete = Boolean(baselineScenes.length) && baselineScenes.every((scene) => scene.status === "captured" && scene.screenshotArtifactId) && !rebuild?.document.truncated;
  const screenshotStatus = screenshotsComplete ? "complete" : screenshotScenes.length ? "partial" : "missing";
  const items: CaptureProjectV2["coverage"]["items"] = [
    {
      area: "structure",
      status: domSnapshotsComplete ? "complete" : domSnapshotArtifact || capture.components.length ? "partial" : "missing",
      evidenceIds: [...capture.components.map((component) => component.id), ...domSnapshotArtifacts.map((artifact) => artifact.id)],
      message: domSnapshotsComplete ? "Privacy-sanitized DOMSnapshots with layout and paint-order evidence are available for every requested initial viewport." : domSnapshotArtifact ? "DOMSnapshot structure exists for some requested viewports; responsive structure gaps remain." : capture.components.length ? "Visible component structure is available; full DOM structure is not captured." : "No component structure was captured."
    },
    {
      area: "styles",
      status: deepStylesComplete ? "complete" : Object.keys(styles).length ? "partial" : "missing",
      evidenceIds: Object.keys(styles),
      message: deepStylesComplete ? "Computed styles and matched CSS rule provenance are available for every requested component and initial viewport." : deepCollectors.some((collector) => collector.styles.length) ? "Deep styles were captured for some requested components or states; unmatched selectors and viewports remain gaps." : Object.keys(styles).length ? "Computed component styles are available without matched CSS rule provenance." : "No stable component styles were captured."
    },
    {
      area: "assets",
      status: capture.implementationTrace?.assets.length ? "partial" : "missing",
      evidenceIds: [],
      message: capture.implementationTrace?.assets.length ? "Asset manifest hints are available; asset files are not bundled." : "No asset manifest was captured."
    },
    {
      area: "canvas",
      status: !rebuild?.privacy.recordCanvas ? "not-applicable" : readableCanvasFrames.length && !unavailableCanvasFrames.length ? "complete" : canvasFrames.length ? "partial" : "missing",
      evidenceIds: [...readableCanvasFrames.map((frame) => frame.artifactId).filter((id): id is string => Boolean(id)), ...canvasFrames.map((frame) => frame.id)],
      message: !rebuild?.privacy.recordCanvas
        ? "Canvas bitmap evidence was not authorized."
        : readableCanvasFrames.length
          ? `${readableCanvasFrames.length} bounded Canvas PNG frame(s) are available${unavailableCanvasFrames.length ? `; ${unavailableCanvasFrames.length} surface(s) remain unreadable or capped.` : "."}`
          : "Canvas evidence was authorized, but no readable bounded frame was captured."
    },
    {
      area: "interactions",
      status: stateCoverageComplete ? "complete" : capture.interactionTimeline || rebuild?.rrweb || stateScenes.length ? "partial" : "missing",
      evidenceIds: [...capture.interactions.map((interaction) => interaction.id), ...(rebuild?.rrweb ? [rebuild.rrweb.artifact.id] : []), ...stateScenes.filter((scene) => scene.status === "captured").map((scene) => scene.id)],
      message: stateCoverageComplete
        ? "Every requested viewport/state pair has an explicit captured scene."
        : rebuild?.rrweb
        ? "Privacy-masked replay events and a summarized timeline are available; some requested states still lack explicit scenes."
        : capture.interactionTimeline ? "A summarized interaction timeline is available; replay-grade events are not captured." : "No interaction timeline was captured."
    },
    {
      area: "animations",
      status: motionCheckpoints.length ? "complete" : animations.length ? "partial" : "missing",
      evidenceIds: [...animations.map((animation) => animation.id), ...motionCheckpoints.map((checkpoint) => checkpoint.screenshotArtifactId).filter((id): id is string => Boolean(id))],
      message: motionCheckpoints.length
        ? `${motionCheckpoints.length} normalized motion checkpoint baselines are available.`
        : animations.length ? "Animation timing exists, but no safely seekable checkpoint frames were captured." : "No animation evidence was captured."
    },
    {
      area: "screenshots",
      status: screenshotStatus,
      evidenceIds: screenshotScenes.map((scene) => scene.screenshotArtifactId).filter((id): id is string => Boolean(id)),
      message: screenshotsComplete
        ? "The full page was captured as PNG segments at the current browser viewport."
        : screenshotScenes.length ? "Some current-viewport PNG baselines exist; failed or capped page segments remain gaps." : "No screenshot baseline exists in the capture."
    },
    {
      area: "responsive",
      status: responsiveComplete ? "complete" : capturedResponsiveScenes.length ? "partial" : "missing",
      evidenceIds: capturedResponsiveScenes.map((scene) => scene.screenshotArtifactId).filter((id): id is string => Boolean(id)),
      message: responsiveComplete ? "Every requested initial viewport has a CDP screenshot baseline." : capturedResponsiveScenes.length ? "Only some requested viewport baselines were captured." : "No responsive viewport baseline was captured."
    }
  ];
  const gaps = items.filter((item) => item.status === "missing" || item.status === "partial").map((item) => item.message);
  return { readiness: capture.components.length || Object.keys(styles).length ? "usable" : "draft", items, gaps };
}

function getDeepCollectors(capture: DesignCapture) {
  const collectors = capture.rebuildEvidence?.deepCollectors;
  if (collectors?.length) return collectors;
  return capture.rebuildEvidence?.deepCollector ? [capture.rebuildEvidence.deepCollector] : [];
}

function buildProjectId(capture: DesignCapture) {
  return `capture-${shortHash(`${capture.page.url}|${capture.page.capturedAt}`)}`;
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
