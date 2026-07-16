export type RebuildArtifactReference = {
  id: string;
  kind: "screenshot" | "rrweb" | "dom-snapshot" | "style" | "canvas-frame";
  name: string;
  mediaType: string;
  size: number;
  createdAt: string;
};

export type CanvasFrameEvidence = {
  id: string;
  sceneId: string;
  selector: string;
  index: number;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  status: "readable" | "tainted" | "unavailable" | "skipped" | "requires-companion";
  artifactId?: string;
  scale?: number;
  context?: "2d" | "webgl" | "unknown";
  capturedAt?: string;
  error?: string;
};

export type DeepMatchedRule = {
  selector: string;
  declarations: Record<string, string>;
  origin?: string;
  styleSheetId?: string;
  sourceUrl?: string;
};

export type DeepStyleEvidence = {
  nodeId: string;
  selector: string;
  sceneId?: string;
  pseudoStates?: string[];
  backendNodeId?: number;
  tagName?: string;
  computed: Record<string, string>;
  cssVariables: Record<string, string>;
  matchedRules: DeepMatchedRule[];
  rect?: { x: number; y: number; width: number; height: number };
};

export type DeepAnimationEvidence = {
  id: string;
  sceneId?: string;
  nodeId?: string;
  selector?: string;
  backendNodeId?: number;
  name: string;
  type: string;
  playState: string;
  durationMs: number;
  delayMs: number;
  easing: string;
  iterationCount?: number;
  keyframes?: Array<Record<string, string | number>>;
};

export type MotionCheckpointEvidence = {
  id: string;
  sceneId: string;
  progress: number;
  animations: Array<{
    animationId: string;
    name: string;
    nodeId?: string;
    selector?: string;
    durationMs: number;
    currentTimeMs: number;
  }>;
  maskNodeIds: string[];
  screenshotArtifactId?: string;
  capturedAt?: string;
  status: "captured" | "failed" | "not-applicable";
  error?: string;
};

export type DeepCollectorEvidence = {
  version: 1;
  protocolVersion: "1.3";
  sceneId: string;
  capturedAt: string;
  requestedNodeCount: number;
  capturedNodeCount: number;
  artifacts: RebuildArtifactReference[];
  scenes: RebuildSceneEvidence[];
  styles: DeepStyleEvidence[];
  animations: DeepAnimationEvidence[];
  canvasFrames?: CanvasFrameEvidence[];
  motionCheckpoints?: MotionCheckpointEvidence[];
  page: {
    frameId?: string;
    loaderId?: string;
    layoutViewport?: { pageX: number; pageY: number; clientWidth: number; clientHeight: number };
    contentSize?: { x: number; y: number; width: number; height: number };
  };
  errors: string[];
};

export type RebuildSceneEvidence = {
  id: string;
  name: string;
  phase: "recording-start" | "page-baseline" | "responsive-initial" | "responsive-scroll" | "forced-hover" | "forced-focus" | "observed-hover" | "observed-focus" | "observed-open";
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  scroll: { x: number; y: number };
  selector?: string;
  screenshotArtifactId?: string;
  domSnapshotArtifactId?: string;
  rrwebEventRange?: { start: number; end: number };
  capturedAt?: string;
  status: "captured" | "failed" | "not-applicable";
  error?: string;
};

export type RebuildEvidence = {
  version: 1;
  recordingId: string;
  storageProjectId: string;
  privacy: {
    maskAllInputs: true;
    recordCanvas: boolean;
    recordCrossOriginIframes: false;
  };
  rrweb?: {
    artifact: RebuildArtifactReference;
    eventCount: number;
    truncated: boolean;
    startedAt: string;
    endedAt: string;
  };
  deepCollector?: DeepCollectorEvidence;
  deepCollectors?: DeepCollectorEvidence[];
  request: {
    viewports: Array<"desktop" | "mobile">;
    states: Array<"initial" | "scroll" | "hover" | "focus" | "open">;
  };
  scenes: RebuildSceneEvidence[];
  artifacts: RebuildArtifactReference[];
  canvasFrames?: CanvasFrameEvidence[];
  document: {
    width: number;
    height: number;
    maxCapturedScrollY: number;
    truncated: boolean;
  };
  errors: string[];
};
