import type { CaptureMode, RebuildBrief } from "../shared/design-brief";
import type { DesignCapture } from "../shared/schema";
import { CaptureBudgetGuard } from "./budget-guard";
import { buildCandidateIndex } from "./candidate-index";
import { planSupplementalTasks } from "./coverage-planner";
import type { SmartCaptureBudgetSummary, SmartCapturePhase, SmartCapturePreflight, SmartCaptureReport, SmartCaptureSafetyLevel, SmartCaptureStatus } from "./types";

const TOTAL_BUDGET_MS = 15_000;
const STABLE_QUIET_MS = 300;
const STABLE_MAX_WAIT_MS = 1_500;
const REFERENCE_PASSIVE_MS = 3_000;
const REBUILD_PASSIVE_MS = 3_500;
const DEGRADED_PASSIVE_MS = 1_200;
const LARGE_DOM_NODES = 20_000;
const EXTREME_DOM_NODES = 50_000;
const FINALIZE_GRACE_MS = 2_500;

export type SmartCaptureOptions = {
  doc: Document;
  win: Window;
  mode: CaptureMode;
  rebuild?: RebuildBrief;
  signal: AbortSignal;
  startRecording: (context: SmartCaptureExecutionContext) => Promise<void>;
  finishRecording: (context: SmartCaptureExecutionContext) => Promise<DesignCapture>;
  onStatus?: (status: SmartCaptureStatus) => void;
  budgetMs?: number;
  finalizeGraceMs?: number;
};

export type SmartCaptureExecutionContext = {
  signal: AbortSignal;
  deadline: number;
  safetyLevel: SmartCaptureSafetyLevel;
  reason?: "deadline" | "safety-stop" | "user-stop";
};

export async function runSmartCapture(options: SmartCaptureOptions): Promise<DesignCapture> {
  const { doc, win, mode, rebuild, signal, startRecording, finishRecording, onStatus } = options;
  const totalBudgetMs = options.budgetMs ?? TOTAL_BUDGET_MS;
  const finalizeGraceMs = options.finalizeGraceMs ?? FINALIZE_GRACE_MS;
  const startedAt = new Date();
  const startedAtMs = win.performance.now();
  const deadline = startedAtMs + totalBudgetMs;
  const captureController = new AbortController();
  const executionContext: SmartCaptureExecutionContext = {
    signal: captureController.signal,
    deadline,
    safetyLevel: "normal"
  };
  const stopCapture = (reason: NonNullable<SmartCaptureExecutionContext["reason"]>) => {
    if (captureController.signal.aborted) return;
    executionContext.reason = reason;
    captureController.abort(reason);
  };
  const guard = new CaptureBudgetGuard(doc, win, (level) => {
    executionContext.safetyLevel = level;
    if (level === "stopped") stopCapture("safety-stop");
  });
  let passiveObservationMs = 0;
  let recordingAttempted = false;
  let capture: DesignCapture | null = null;
  let preflight: SmartCapturePreflight | null = null;
  let budget: SmartCaptureBudgetSummary | null = null;
  let phase: SmartCapturePhase = "preflight";

  const publish = (nextPhase: SmartCapturePhase) => {
    phase = nextPhase;
    onStatus?.({ phase, mode, startedAt: startedAt.toISOString(), degraded: guard.isDegraded() });
  };

  const onExternalAbort = () => stopCapture("user-stop");
  signal.addEventListener("abort", onExternalAbort, { once: true });
  if (signal.aborted) onExternalAbort();
  const deadlineTimer = win.setTimeout(() => {
    stopCapture("deadline");
    guard.markDegraded("deadline-exceeded", "stopped");
  }, totalBudgetMs);

  guard.start();
  try {
    publish("preflight");
    preflight = await buildCandidateIndex(doc, win, captureController.signal);
    if (preflight.domNodes > LARGE_DOM_NODES) guard.markDegraded("large-dom", "reduced");
    if (preflight.domNodes > EXTREME_DOM_NODES) guard.markDegraded("extreme-dom-snapshot-only", "snapshot-only");
    try {
      if (!captureController.signal.aborted && win.performance.now() < deadline && guard.getSafetyLevel() !== "snapshot-only") {
        publish("stabilizing");
        const stable = await waitForDomQuiet(doc, win, captureController.signal, Math.min(STABLE_MAX_WAIT_MS, deadline - win.performance.now()));
        if (!stable) guard.markDegraded("unstable-dom");
      }

      publish("snapshot");
      recordingAttempted = true;
      await raceCaptureStage(startRecording(executionContext), captureController.signal, "Smart Capture snapshot timed out.");

      if (!captureController.signal.aborted && win.performance.now() < deadline && guard.getSafetyLevel() !== "snapshot-only") {
        publish("observing");
        const passiveTarget = guard.isDegraded()
          ? DEGRADED_PASSIVE_MS
          : mode === "rebuild" ? REBUILD_PASSIVE_MS : REFERENCE_PASSIVE_MS;
        passiveObservationMs = await waitForVisibleDuration(
          doc,
          win,
          captureController.signal,
          passiveTarget,
          deadline,
          () => guard.getSafetyLevel() !== "snapshot-only" && guard.getSafetyLevel() !== "stopped"
        );
      }
    } catch (error) {
      if (!captureController.signal.aborted) guard.markDegraded(`capture-error:${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (recordingAttempted) {
        publish("finalizing");
        if (win.performance.now() >= deadline && !captureController.signal.aborted) {
          stopCapture("deadline");
          guard.markDegraded("deadline-exceeded", "stopped");
        }
        capture = await withTimeout(
          finishRecording(executionContext),
          win,
          finalizeGraceMs,
          "Smart Capture cleanup did not finish within the safety window."
        );
      }
    }
  } finally {
    budget = guard.stop();
    win.clearTimeout(deadlineTimer);
    signal.removeEventListener("abort", onExternalAbort);
  }

  if (!capture || !preflight || !budget) throw new Error("Smart Capture could not create a page snapshot.");
  const outcome: SmartCaptureReport["outcome"] = executionContext.reason === "user-stop" ? "cancelled" : budget.degraded ? "degraded" : "complete";
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

function raceCaptureStage<T>(promise: Promise<T>, signal: AbortSignal, message: string) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new DOMException(message, "AbortError")));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
    if (signal.aborted) onAbort();
  });
}

function withTimeout<T>(promise: Promise<T>, win: Window, durationMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      callback();
    };
    const timer = win.setTimeout(() => finish(() => reject(new DOMException(message, "TimeoutError"))), durationMs);
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
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

async function waitForVisibleDuration(doc: Document, win: Window, signal: AbortSignal, targetMs: number, deadline: number, shouldContinue: () => boolean) {
  let visibleMs = 0;
  let previous = win.performance.now();
  while (!signal.aborted && shouldContinue() && visibleMs < targetMs && win.performance.now() < deadline) {
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
