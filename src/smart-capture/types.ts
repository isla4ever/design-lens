import type { CaptureMode } from "../shared/design-brief";

export type SmartCapturePhase =
  | "idle"
  | "preflight"
  | "stabilizing"
  | "snapshot"
  | "observing"
  | "finalizing"
  | "complete"
  | "degraded"
  | "cancelled"
  | "error";

export type SmartCaptureTaskKind =
  | "record-interactions"
  | "capture-component"
  | "capture-responsive"
  | "capture-state"
  | "authorize-canvas";

export type SmartCaptureTask = {
  id: string;
  kind: SmartCaptureTaskKind;
  priority: "high" | "medium" | "low";
  source?: "smart-capture" | "recorder-flow";
  trigger?: "initial" | "scroll" | "hover" | "click" | "wait";
  state?: "scroll" | "hover" | "focus" | "open";
  viewport?: "desktop" | "mobile";
  selector?: string;
  targetScrollY?: number;
  sourceSceneIds?: string[];
  reason: string;
};

export type SmartCapturePreflight = {
  domNodes: number;
  scannedNodes: number;
  truncated: boolean;
  interactiveCandidates: number;
  semanticCandidates: number;
  canvasElements: number;
  iframeElements: number;
  animatedElements: number;
  documentHeight: number;
  viewportHeight: number;
};

export type SmartCaptureBudgetSummary = {
  degraded: boolean;
  reasons: string[];
  longTaskCount: number;
  maxLongTaskMs: number;
  mutationCount: number;
  mutationStorm: boolean;
};

export type SmartCaptureReport = {
  version: 1;
  mode: CaptureMode;
  outcome: "complete" | "degraded" | "cancelled";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  passiveObservationMs: number;
  preflight: SmartCapturePreflight;
  budget: SmartCaptureBudgetSummary;
  tasks: SmartCaptureTask[];
};

export type SmartCaptureStatus = {
  phase: SmartCapturePhase;
  mode: CaptureMode;
  startedAt: string;
  degraded: boolean;
};
