import type { SmartCapturePreflight } from "./types";

const MAX_SCANNED_NODES = 8_000;
const SLICE_BUDGET_MS = 6;
const INTERACTIVE_SELECTOR = "a[href],button,input,textarea,select,summary,[role],[tabindex]";
const SEMANTIC_SELECTOR = "main,section,article,header,footer,nav,form,h1,h2,h3,img,video,svg";

export async function buildCandidateIndex(doc: Document, win: Window, signal?: AbortSignal): Promise<SmartCapturePreflight> {
  const root = doc.documentElement;
  const domNodes = root?.getElementsByTagName("*").length ?? 0;
  if (!root) return emptyPreflight(win, domNodes);
  const scanLimit = domNodes > 50_000 ? 1_000 : domNodes > 20_000 ? 4_000 : MAX_SCANNED_NODES;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let current: Node | null = root;
  let scannedNodes = 0;
  let interactiveCandidates = 0;
  let semanticCandidates = 0;
  let canvasElements = 0;
  let iframeElements = 0;
  let sliceStartedAt = win.performance.now();

  while (current && scannedNodes < scanLimit && !signal?.aborted) {
    if (current instanceof Element) {
      if (current.matches(INTERACTIVE_SELECTOR)) interactiveCandidates += 1;
      if (current.matches(SEMANTIC_SELECTOR)) semanticCandidates += 1;
      if (current instanceof HTMLCanvasElement) canvasElements += 1;
      if (current instanceof HTMLIFrameElement) iframeElements += 1;
    }
    scannedNodes += 1;
    current = walker.nextNode();
    if (scannedNodes % 64 === 0 && win.performance.now() - sliceStartedAt >= SLICE_BUDGET_MS) {
      await yieldToBrowser(win, signal);
      sliceStartedAt = win.performance.now();
    }
  }

  return {
    domNodes,
    scannedNodes,
    truncated: Boolean(current) || domNodes > scannedNodes,
    interactiveCandidates,
    semanticCandidates,
    canvasElements,
    iframeElements,
    animatedElements: safelyCountAnimations(doc),
    documentHeight: Math.max(win.innerHeight, root.scrollHeight, doc.body?.scrollHeight ?? 0),
    viewportHeight: win.innerHeight
  };
}

function emptyPreflight(win: Window, domNodes: number): SmartCapturePreflight {
  return {
    domNodes,
    scannedNodes: 0,
    truncated: false,
    interactiveCandidates: 0,
    semanticCandidates: 0,
    canvasElements: 0,
    iframeElements: 0,
    animatedElements: 0,
    documentHeight: win.innerHeight,
    viewportHeight: win.innerHeight
  };
}

function safelyCountAnimations(doc: Document) {
  try {
    return Math.min(250, doc.getAnimations().length);
  } catch {
    return 0;
  }
}

function yieldToBrowser(win: Window, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const idleWindow = win as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(resolve, { timeout: 50 });
      return;
    }
    win.setTimeout(resolve, 0);
  });
}
