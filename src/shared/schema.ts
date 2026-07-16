import type { RebuildEvidence } from "../capture-v2/core/rebuild-evidence";
import type { SmartCaptureReport } from "../smart-capture/types";

export type PageMeta = {
  title: string;
  url: string;
  capturedAt: string;
};

export type ViewportInfo = {
  width: number;
  height: number;
  devicePixelRatio: number;
};

export type TokenValue = {
  value: string;
  count: number;
  sampleSelectors: string[];
};

export type TypographyToken = {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  count: number;
  sampleSelectors: string[];
};

export type DesignTokens = {
  cssVariables: TokenValue[];
  colors: TokenValue[];
  backgrounds: TokenValue[];
  spacing: TokenValue[];
  radii: TokenValue[];
  shadows: TokenValue[];
  typography: TypographyToken[];
};

export type LayoutSpec = {
  display: string;
  position: string;
  width: number;
  height: number;
  gap: string;
  gridTemplateColumns: string;
  flexDirection: string;
  alignItems: string;
  justifyContent: string;
};

export type MotionSpec = {
  id: string;
  selector: string;
  type: "transition" | "animation" | "web-animation" | "state-machine";
  name: string;
  durationMs: number;
  delayMs: number;
  easing: string;
  properties: string[];
};

export type InteractionSpec = {
  id: string;
  selector: string;
  trigger: "click" | "hover" | "focus" | "input" | "navigation" | "unknown";
  affordance: string;
  cursor: string;
  role: string;
  stateSignals: string[];
  transitionProperties: string[];
};

export type LayoutProfile = {
  density: "compact" | "balanced" | "open";
  composition: string;
  dominantDisplays: string[];
  dominantGaps: string[];
  alignment: string[];
  structure: string[];
  cadence: string[];
  emphasis: string[];
};

export type ComponentSpec = {
  id: string;
  name: string;
  selector: string;
  tagName: string;
  confidence: number;
  textSample: string;
  layout: LayoutSpec;
  visual: {
    color: string;
    backgroundColor: string;
    font: string;
    borderRadius: string;
    boxShadow: string;
    border: string;
  };
};

export type CaptureEvidence = {
  selector: string;
  reason: string;
  properties: Record<string, string>;
};

export type DesignAnalysis = {
  character: string;
  tags: string[];
  recommendations: string[];
};

export type PointerSample = {
  t: number;
  type?: "move" | "down" | "up" | "enter" | "leave" | undefined;
  x: number;
  y: number;
  targetSelector: string;
  speed: number;
  phase?: string | undefined;
  directionDeg?: number | undefined;
  pressure?: number | undefined;
  buttons?: number | undefined;
};

export type FocusSample = {
  t: number;
  type: "in" | "out";
  targetSelector: string;
};

export type ScrollSample = {
  t: number;
  x: number;
  y: number;
  deltaY: number;
  velocity: number;
};

export type FrameElementSample = {
  selector: string;
  tagName: string;
  textSample: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  opacity: string;
  transform: string;
  clipPath: string;
  filter: string;
  mixBlendMode: string;
  position?: string | undefined;
  backgroundColor?: string | undefined;
  color?: string | undefined;
  zIndex?: string | undefined;
};

export type FrameSample = {
  t: number;
  scrollY: number;
  changedElements: number;
  elements: FrameElementSample[];
};

export type RuntimeAnimationSample = {
  t: number;
  selector: string;
  name: string;
  source: "css-animation" | "css-transition" | "web-animation" | "unknown";
  playState: string;
  currentTimeMs: number;
  durationMs: number;
  delayMs: number;
  easing: string;
  iterationCount: string;
  properties: string[];
  keyframeCount: number;
  fill?: string | undefined;
  direction?: string | undefined;
  playbackRate?: number | undefined;
  keyframes?: Array<Record<string, string | number>> | undefined;
};

export type DomMutationSample = {
  t: number;
  selector: string;
  type: "attributes" | "childList" | "characterData";
  attributeName?: string | undefined;
  className?: string | undefined;
  styleText?: string | undefined;
  addedNodes?: number | undefined;
  removedNodes?: number | undefined;
};

export type VisualSurfaceSample = {
  t: number;
  selector: string;
  tagName: string;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  signal: "canvas-readable" | "canvas-tainted" | "canvas-active" | "video-active" | "image-media" | "svg-surface";
  frameSignature?: string | undefined;
};

export type PerformanceTimelineSample = {
  t: number;
  type: "paint" | "layout-shift" | "longtask" | "measure" | "mark" | "event" | "resource";
  name: string;
  startTime: number;
  duration: number;
  value?: number | undefined;
  selector?: string | undefined;
};

export type ImplementationAsset = {
  kind: "script" | "stylesheet" | "inline-style" | "inline-script" | "resource";
  url?: string | undefined;
  label: string;
  origin: "same-origin" | "cdn" | "third-party" | "inline" | "unknown";
  loading?: string[] | undefined;
  signals: string[];
};

export type ImplementationTrace = {
  assets: ImplementationAsset[];
  frameworkSignals: string[];
  librarySignals: string[];
  sourceMapHints: string[];
  eventModelHints: string[];
  styleRuntimeHints: string[];
  networkHints: string[];
};

export type InteractionPattern = {
  kind:
    | "pointer-distortion"
    | "cursor-follower"
    | "media-sequence"
    | "media-liquid-distortion"
    | "stage-state-machine"
    | "typography-phase"
    | "pointer-trail-field"
    | "runtime-waapi-animation"
    | "dom-mutation-state"
    | "canvas-bitmap-sequence"
    | "stylesheet-keyframes"
    | "scroll-pinned-stage"
    | "element-reveal"
    | "clip-mask-reveal"
    | "canvas-webgl-motion"
    | "loading-sequence"
    | "stateful-detail-surface";
  confidence: number;
  evidence: string[];
  implementationNotes: string[];
};

export type TimelinePhase = {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  scrollRange: {
    min: number;
    max: number;
  };
  dominantSurface: "light" | "dark" | "mixed" | "unknown";
  activeSignals: string[];
  keySelectors: string[];
};

export type TimelineMetrics = {
  maxPointerSpeed: number;
  averagePointerSpeed: number;
  pointerTravel: number;
  maxScrollY: number;
  changedFrameRatio: number;
  mediaStateCount: number;
  darkFrameRatio: number;
  lightFrameRatio: number;
  runtimeAnimationCount?: number | undefined;
  mutationCount?: number | undefined;
  visualSurfaceStateCount?: number | undefined;
  performanceEventCount?: number | undefined;
  layoutShiftScore?: number | undefined;
  longTaskCount?: number | undefined;
  paintCount?: number | undefined;
};

export type InteractionTimeline = {
  durationMs: number;
  pointerSamples: PointerSample[];
  focusSamples?: FocusSample[] | undefined;
  scrollSamples: ScrollSample[];
  frameSamples: FrameSample[];
  runtimeAnimations?: RuntimeAnimationSample[] | undefined;
  domMutations?: DomMutationSample[] | undefined;
  visualSurfaces?: VisualSurfaceSample[] | undefined;
  performanceEvents?: PerformanceTimelineSample[] | undefined;
  patterns: InteractionPattern[];
  phases?: TimelinePhase[] | undefined;
  metrics?: TimelineMetrics | undefined;
};

export type DesignCapture = {
  scope?: "page" | "component";
  page: PageMeta;
  viewport: ViewportInfo;
  tokens: DesignTokens;
  layout: LayoutSpec[];
  layoutProfile: LayoutProfile;
  components: ComponentSpec[];
  motion: MotionSpec[];
  interactions: InteractionSpec[];
  evidence: CaptureEvidence[];
  implementationTrace?: ImplementationTrace | undefined;
  interactionTimeline?: InteractionTimeline | undefined;
  rebuildEvidence?: RebuildEvidence | undefined;
  smartCapture?: SmartCaptureReport | undefined;
  analysis: DesignAnalysis;
};
