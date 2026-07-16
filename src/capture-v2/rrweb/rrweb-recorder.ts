import { RrwebEventBuffer, type RrwebEvent, type RrwebEventSnapshot } from "./rrweb-event-buffer";

export type RebuildEventRecorder = {
  eventCount: () => number;
  stop: () => RrwebEventSnapshot;
};

const DEFAULT_MAX_DOM_NODES = 20_000;

export async function startRebuildEventRecorder(maxEvents = 2500, maxMutations = 10_000): Promise<RebuildEventRecorder> {
  const domNodeCount = document.getElementsByTagName("*").length;
  if (domNodeCount > DEFAULT_MAX_DOM_NODES) {
    throw new Error(`rrweb skipped because the page has ${domNodeCount} DOM nodes; safety limit is ${DEFAULT_MAX_DOM_NODES}`);
  }
  const { record } = await import("rrweb");
  const buffer = new RrwebEventBuffer(maxEvents, maxMutations);
  let recorderStop: (() => void) | undefined;
  let stopped = false;
  let stopQueued = false;
  const stopUnderlyingRecorder = () => {
    if (stopped) return;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    recorderStop?.();
    stopped = true;
  };
  const onVisibilityChange = () => {
    if (document.hidden) requestStop();
  };
  const requestStop = () => {
    if (stopped || stopQueued) return;
    stopQueued = true;
    queueMicrotask(() => {
      if (stopped) return;
      stopUnderlyingRecorder();
    });
  };
  recorderStop = record<RrwebEvent>({
    emit(event) {
      if (!buffer.push(event)) requestStop();
    },
    maskAllInputs: true,
    recordCanvas: false,
    recordCrossOriginIframes: false,
    collectFonts: false,
    inlineImages: false,
    inlineStylesheet: false,
    slimDOMOptions: true,
    blockSelector: "#design-lens-overlay-root,[data-design-lens-block],canvas,video,audio",
    sampling: {
      mousemove: 100,
      mousemoveCallback: 500,
      scroll: 150,
      media: 800,
      input: "last"
    }
  });

  if (!recorderStop) throw new Error("rrweb recorder could not start on this page");
  document.addEventListener("visibilitychange", onVisibilityChange);
  if (stopQueued && !stopped) {
    stopUnderlyingRecorder();
  }
  let stoppedSnapshot: RrwebEventSnapshot | null = null;
  return {
    eventCount: () => buffer.length,
    stop() {
      if (stoppedSnapshot) return stoppedSnapshot;
      stopUnderlyingRecorder();
      stoppedSnapshot = buffer.snapshot();
      return stoppedSnapshot;
    }
  };
}
