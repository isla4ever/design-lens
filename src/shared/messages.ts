import type { DesignCapture } from "./schema";
import type { Locale } from "./i18n";
import type { ThemeMode } from "./theme-storage";
import type { CaptureMode, RebuildBrief } from "./design-brief";
import type { RebuildArtifactReference } from "../capture-v2/core/rebuild-evidence";
import type { DeepCollectorEvidence } from "../capture-v2/core/rebuild-evidence";
import type { SmartCaptureStatus } from "../smart-capture/types";
import type { WorkspaceCaptureRecord } from "../storage/capture-project-store";
import type { ImportedRecorderFlowMatch, ImportedRecorderFlowPlan } from "../capture-v2/core/imported-recorder-flow";

export type GuidedCaptureTask = {
  kind: "record-interactions" | "capture-responsive" | "capture-state";
  trigger?: "initial" | "scroll" | "hover" | "click" | "wait";
  state?: "scroll" | "hover" | "focus" | "open";
  viewport?: "desktop" | "mobile";
  selector?: string;
  targetScrollY?: number;
};

export type CaptureRequest =
  | { type: "DESIGN_LENS_CAPTURE_PAGE" }
  | { type: "DESIGN_LENS_PICK_ELEMENT" }
  | { type: "DESIGN_LENS_CAPTURE_HOVER" }
  | { type: "DESIGN_LENS_RECORD_START"; locale?: Locale; mode?: CaptureMode; rebuild?: RebuildBrief }
  | { type: "DESIGN_LENS_RECORD_STOP"; locale?: Locale }
  | { type: "DESIGN_LENS_RECORD_STATUS"; locale?: Locale }
  | { type: "DESIGN_LENS_SMART_CAPTURE_START"; locale?: Locale; mode?: CaptureMode; rebuild?: RebuildBrief }
  | { type: "DESIGN_LENS_TOGGLE_OVERLAY"; locale?: Locale }
  | { type: "DESIGN_LENS_OPEN_AND_SCAN"; locale?: Locale; scanMode?: ScanMode }
  | { type: "DESIGN_LENS_OPEN_RECORDER"; locale?: Locale; mode?: CaptureMode; rebuild?: RebuildBrief; guidedTask?: GuidedCaptureTask }
  | { type: "DESIGN_LENS_OPEN_AND_PICK"; locale?: Locale; recorderTarget?: { workspaceRecordId: string; sceneId: string } }
  | { type: "DESIGN_LENS_SET_THEME"; theme: ThemeMode }
  | { type: "DESIGN_LENS_SET_CAPTURE_PRIVACY_MASK"; enabled: boolean }
  | { type: "DESIGN_LENS_SET_LOCALE"; locale: Locale };

export type ScanMode = "instant" | "recorded";

export type CaptureResponse =
  | {
      ok: true;
      capture: DesignCapture;
      isRecording?: boolean;
      smartCapture?: SmartCaptureStatus;
      selectedSelector?: string;
    }
  | {
      ok: false;
      error: string;
    };

export type ContentScriptResponse = CaptureResponse | { ok: true };

export type ArtifactStorageRequest =
  | {
      type: "DESIGN_LENS_CAPTURE_VISIBLE_TAB";
      storageProjectId: string;
      artifactId: string;
      name: string;
      createdAt: string;
    }
  | {
      type: "DESIGN_LENS_STORE_RRWEB_ARTIFACT";
      storageProjectId: string;
      artifactId: string;
      name: string;
      content: string;
      createdAt: string;
    };

export type ArtifactStorageResponse =
  | { ok: true; artifact: RebuildArtifactReference }
  | { ok: false; error: string };

export type DeepCaptureRequest = {
  type: "DESIGN_LENS_COLLECT_DEEP_EVIDENCE";
  storageProjectId: string;
  sceneId: string;
  phase: "recording-start" | "recording-stop";
  viewports: Array<{ id: "desktop" | "mobile"; width: number; height: number; devicePixelRatio: number }>;
  states: Array<"scroll" | "hover" | "focus">;
  captureCanvas: boolean;
  stateTargets: Array<{ state: "hover" | "focus"; nodeId: string; selector: string }>;
  nodes: Array<{ nodeId: string; selector: string }>;
  createdAt: string;
};

export type DeepCaptureResponse =
  | { ok: true; available: false }
  | { ok: true; available: true; evidence: DeepCollectorEvidence }
  | { ok: false; error: string };

export type WorkspaceRequest =
  | { type: "DESIGN_LENS_STORE_WORKSPACE_CAPTURE"; capture: DesignCapture }
  | { type: "DESIGN_LENS_GET_WORKSPACE_CAPTURES"; tabId?: number }
  | { type: "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW"; id: string; flow: ImportedRecorderFlowPlan | null }
  | { type: "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW_MATCH"; id: string; match: ImportedRecorderFlowMatch | null }
  | { type: "DESIGN_LENS_RESOLVE_RECORDER_TARGET"; id: string; sceneId: string; selector: string }
  | { type: "DESIGN_LENS_DELETE_WORKSPACE_CAPTURE"; id: string };

export type WorkspaceResponse =
  | { ok: true; records: WorkspaceCaptureRecord[] }
  | { ok: true; record: WorkspaceCaptureRecord }
  | { ok: true }
  | { ok: false; error: string };
