import type { RebuildArtifactReference, RebuildSceneEvidence } from "../core/rebuild-evidence";

type SceneWindow = {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
  scrollTo: (x: number, y: number) => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
};

type SceneDocument = {
  documentElement: HTMLElement;
  body: HTMLElement | null;
  fonts?: { ready: Promise<unknown> };
};

export type ScreenshotCaptureRequest = {
  storageProjectId: string;
  artifactId: string;
  name: string;
  createdAt: string;
};

export type SceneScreenshotResult = {
  scenes: RebuildSceneEvidence[];
  artifacts: RebuildArtifactReference[];
  documentWidth: number;
  documentHeight: number;
  maxCapturedScrollY: number;
  truncated: boolean;
};

type CollectOptions = {
  win: SceneWindow;
  doc: SceneDocument;
  recordingId: string;
  storageProjectId: string;
  phase: RebuildSceneEvidence["phase"];
  captureVisibleTab: (request: ScreenshotCaptureRequest) => Promise<RebuildArtifactReference>;
  setCaptureUiHidden?: (hidden: boolean) => void;
  eventCount?: () => number;
  positions?: number[];
  maxSegments?: number;
  settle?: () => Promise<void>;
  signal?: AbortSignal;
  captureTimeoutMs?: number;
  maxDurationMs?: number;
};

const DEFAULT_MAX_SEGMENTS = 5;
const DEFAULT_CAPTURE_TIMEOUT_MS = 4000;
const DEFAULT_MAX_DURATION_MS = 10_000;

export async function collectSceneScreenshots(options: CollectOptions): Promise<SceneScreenshotResult> {
  const { win, doc } = options;
  const original = { x: win.scrollX, y: win.scrollY };
  const rootBehavior = doc.documentElement.style.scrollBehavior;
  const bodyBehavior = doc.body?.style.scrollBehavior;
  const startedAt = Date.now();
  const dimensions = getDocumentDimensions(doc, win);
  const maxScrollY = Math.max(0, dimensions.height - win.innerHeight);
  const requestedPositions = options.positions ?? buildScrollCapturePositions(maxScrollY, win.innerHeight, options.maxSegments ?? DEFAULT_MAX_SEGMENTS);
  const positions = Array.from(new Set(requestedPositions.map((value) => clamp(Math.round(value), 0, maxScrollY))));
  let truncated = options.positions === undefined && buildRequiredSegmentCount(maxScrollY, win.innerHeight) > positions.length;
  const scenes: RebuildSceneEvidence[] = [];
  const artifacts: RebuildArtifactReference[] = [];

  doc.documentElement.style.scrollBehavior = "auto";
  if (doc.body) doc.body.style.scrollBehavior = "auto";
  options.setCaptureUiHidden?.(true);

  try {
    await Promise.race([doc.fonts?.ready ?? Promise.resolve(), delay(1200)]);
    for (let index = 0; index < positions.length; index += 1) {
      if (options.signal?.aborted || Date.now() - startedAt >= (options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS)) {
        truncated = true;
        break;
      }
      const y = positions[index] ?? 0;
      win.scrollTo(0, y);
      await withTimeout(options.settle?.() ?? settleViewport(win), 1500, "Viewport settling timed out");
      const actualY = Math.round(win.scrollY);
      const createdAt = new Date().toISOString();
      const sceneId = `scene-${options.recordingId}-${options.phase}-${index + 1}`;
      const artifactId = `screenshot-${options.phase}-${index + 1}`;
      const eventEnd = Math.max(0, (options.eventCount?.() ?? 0) - 1);
      const scene: RebuildSceneEvidence = {
        id: sceneId,
        name: options.phase === "recording-start" ? "Observed state at recording start" : `Current viewport baseline segment ${index + 1}`,
        phase: options.phase,
        viewport: { width: win.innerWidth, height: win.innerHeight, devicePixelRatio: win.devicePixelRatio },
        scroll: { x: Math.round(win.scrollX), y: actualY },
        ...(eventEnd > 0 ? { rrwebEventRange: { start: 0, end: eventEnd } } : {}),
        status: "failed"
      };
      let stopAfterScene = false;
      try {
        const artifact = await withTimeout(options.captureVisibleTab({
          storageProjectId: options.storageProjectId,
          artifactId,
          name: `screenshots/${options.phase}-${String(index + 1).padStart(2, "0")}-${actualY}.png`,
          createdAt
        }), options.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS, "Visible-tab screenshot timed out", options.signal);
        artifacts.push(artifact);
        scene.screenshotArtifactId = artifact.id;
        scene.capturedAt = artifact.createdAt;
        scene.status = "captured";
      } catch (error) {
        scene.error = error instanceof Error ? error.message : String(error);
        stopAfterScene = isCaptureCircuitBreaker(error);
        if (stopAfterScene) truncated = true;
      }
      scenes.push(scene);
      if (stopAfterScene) break;
    }
  } finally {
    try {
      win.scrollTo(original.x, original.y);
      await withTimeout(options.settle?.() ?? settleViewport(win), 1500, "Final viewport settling timed out");
    } finally {
      doc.documentElement.style.scrollBehavior = rootBehavior;
      if (doc.body) doc.body.style.scrollBehavior = bodyBehavior ?? "";
      options.setCaptureUiHidden?.(false);
    }
  }

  return {
    scenes,
    artifacts,
    documentWidth: dimensions.width,
    documentHeight: dimensions.height,
    maxCapturedScrollY: Math.max(0, ...scenes.filter((scene) => scene.status === "captured").map((scene) => scene.scroll.y)),
    truncated
  };
}

export function buildScrollCapturePositions(maxScrollY: number, viewportHeight: number, maxSegments = DEFAULT_MAX_SEGMENTS) {
  if (maxScrollY <= 0 || viewportHeight <= 0) return [0];
  const required = buildRequiredSegmentCount(maxScrollY, viewportHeight);
  const positions = Array.from({ length: required }, (_, index) => Math.min(index * viewportHeight, maxScrollY));
  if (positions.at(-1) !== maxScrollY) positions.push(maxScrollY);
  if (positions.length <= maxSegments) return positions;
  if (maxSegments <= 1) return [0];
  const sampled = Array.from({ length: maxSegments }, (_, index) => Math.round((maxScrollY * index) / (maxSegments - 1)));
  return Array.from(new Set(sampled));
}

function buildRequiredSegmentCount(maxScrollY: number, viewportHeight: number) {
  return Math.max(1, Math.ceil(maxScrollY / Math.max(1, viewportHeight)) + 1);
}

function getDocumentDimensions(doc: SceneDocument, win: SceneWindow) {
  const root = doc.documentElement;
  const body = doc.body;
  return {
    width: Math.max(win.innerWidth, root.scrollWidth, root.offsetWidth, root.clientWidth, body?.scrollWidth ?? 0, body?.offsetWidth ?? 0, body?.clientWidth ?? 0),
    height: Math.max(win.innerHeight, root.scrollHeight, root.offsetHeight, root.clientHeight, body?.scrollHeight ?? 0, body?.offsetHeight ?? 0, body?.clientHeight ?? 0)
  };
}

async function settleViewport(win: SceneWindow) {
  await new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
  await delay(240);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new DOMException("Capture aborted", "AbortError")));
    const timer = setTimeout(() => finish(() => reject(new DOMException(message, "TimeoutError"))), timeoutMs);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

function isCaptureCircuitBreaker(error: unknown) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
