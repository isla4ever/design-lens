import type { CaptureMode, RebuildBrief } from "../shared/design-brief";
import type { DesignCapture } from "../shared/schema";
import { CaptureBudgetGuard } from "./budget-guard";
import { buildCandidateIndex } from "./candidate-index";
import { planSupplementalTasks } from "./coverage-planner";
import type { SmartCaptureBudgetSummary, SmartCapturePhase, SmartCapturePreflight, SmartCaptureReport, SmartCaptureStatus } from "./types";

const TOTAL_BUDGET_MS = 15_000;
const STABLE_QUIET_MS = 300;
const STABLE_MAX_WAIT_MS = 1_500;
const REFERENCE_PASSIVE_MS = 3_000;
const REBUILD_PASSIVE_MS = 3_500;
const DEGRADED_PASSIVE_MS = 1_200;
const LARGE_DOM_NODES = 20_000;
const EXTREME_DOM_NODES = 50_000;

export type SmartCaptureOptions = {
  doc: Document;
  win: Window;
  mode: CaptureMode;
  rebuild?: RebuildBrief;
  signal: AbortSignal;
  startRecording: () => Promise<void>;
  finishRecording: () => Promise<DesignCapture>;
  onStatus?: (status: SmartCaptureStatus) => void;
};

export async function runSmartCapture(options: SmartCaptureOptions): Promise<DesignCapture> {
  const { doc, win, mode, rebuild, signal, startRecording, finishRecording, onStatus } = options;
  const startedAt = new Date();
  const startedAtMs = win.performance.now();
  const deadline = startedAtMs + TOTAL_BUDGET_MS;
  const guard = new CaptureBudgetGuard(doc, win);
  let passiveObservationMs = 0;
  let recordingStarted = false;
  let capture: DesignCapture | null = null;
  let preflight: SmartCapturePreflight | null = null;
  let budget: SmartCaptureBudgetSummary | null = null;
  let phase: SmartCapturePhase = "preflight";

  const publish = (nextPhase: SmartCapturePhase) => {
    phase = nextPhase;
    onStatus?.({ phase, mode, startedAt: startedAt.toISOString(), degraded: guard.isDegraded() });
  };

  guard.start();
  try {
    publish("preflight");
    preflight = await buildCandidateIndex(doc, win, signal);
    if (preflight.domNodes > LARGE_DOM_NODES) guard.markDegraded("large-dom");
    if (preflight.domNodes > EXTREME_DOM_NODES) guard.markDegraded("extreme-dom-snapshot-only");
    try {
      if (!signal.aborted && win.performance.now() < deadline && preflight.domNodes <= EXTREME_DOM_NODES) {
        publish("stabilizing");
        const stable = await waitForDomQuiet(doc, win, signal, Math.min(STABLE_MAX_WAIT_MS, deadline - win.performance.now()));
        if (!stable) guard.markDegraded("unstable-dom");
      }

      if (signal.aborted) throw new Error("Smart Capture was cancelled before snapshot capture.");
      publish("snapshot");
      await startRecording();
      recordingStarted = true;

      if (!signal.aborted && win.performance.now() < deadline && preflight.domNodes <= EXTREME_DOM_NODES) {
        publish("observing");
        const passiveTarget = guard.isDegraded()
          ? DEGRADED_PASSIVE_MS
          : mode === "rebuild" ? REBUILD_PASSIVE_MS : REFERENCE_PASSIVE_MS;
        passiveObservationMs = await waitForVisibleDuration(doc, win, signal, passiveTarget, deadline);
      }
    } catch (error) {
      if (!signal.aborted) guard.markDegraded(`capture-error:${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (recordingStarted) {
        publish("finalizing");
        capture = await finishRecording();
      }
    }
  } finally {
    budget = guard.stop();
  }

  if (!capture || !preflight || !budget) throw new Error("Smart Capture could not create a page snapshot.");
  const outcome: SmartCaptureReport["outcome"] = signal.aborted ? "cancelled" : budget.degraded ? "degraded" : "complete";
  capture.smartCapture = {
    version: 1,
    mode,
    outcome,
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Math.round(win.performance.now() - startedAtMs),
    passiveObservationMs: Math.round(passiveObservationMs),
    preflight,
    budget,
    tasks: planSupplementalTasks(capture, preflight, mode === "rebuild" ? rebuild : undefined)
  };
  publish(outcome === "cancelled" ? "cancelled" : outcome === "degraded" ? "degraded" : "complete");
  return capture;
}

export function waitForDomQuiet(doc: Document, win: Window, signal: AbortSignal, maxWaitMs = STABLE_MAX_WAIT_MS) {
  if (signal.aborted || maxWaitMs <= 0) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const startedAt = win.performance.now();
    let lastMutationAt = startedAt;
    let settled = false;
    const observer = new MutationObserver(() => { lastMutationAt = win.performance.now(); });
    const finish = (stable: boolean) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      win.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(stable);
    };
    const tick = () => {
      const now = win.performance.now();
      if (now - lastMutationAt >= STABLE_QUIET_MS) return finish(true);
      if (now - startedAt >= maxWaitMs) return finish(false);
      timer = win.setTimeout(tick, Math.min(50, maxWaitMs));
    };
    const onAbort = () => finish(false);
    let timer = win.setTimeout(tick, Math.min(STABLE_QUIET_MS, maxWaitMs));
    observer.observe(doc.documentElement, { attributes: true, childList: true, subtree: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForVisibleDuration(doc: Document, win: Window, signal: AbortSignal, targetMs: number, deadline: number) {
  let visibleMs = 0;
  let previous = win.performance.now();
  while (!signal.aborted && visibleMs < targetMs && win.performance.now() < deadline) {
    await delay(win, Math.min(100, targetMs - visibleMs, Math.max(1, deadline - win.performance.now())), signal);
    const now = win.performance.now();
    if (!doc.hidden) visibleMs += now - previous;
    previous = now;
  }
  return Math.min(targetMs, visibleMs);
}

function delay(win: Window, durationMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = win.setTimeout(done, durationMs);
    function done() {
      win.clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
