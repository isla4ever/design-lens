import type { RebuildBrief } from "../shared/design-brief";
import type { DesignCapture } from "../shared/schema";
import type { RebuildSceneEvidence } from "../capture-v2/core/rebuild-evidence";
import type { SmartCapturePreflight, SmartCaptureTask } from "./types";

export function planSupplementalTasks(capture: DesignCapture, preflight: SmartCapturePreflight, rebuild?: RebuildBrief): SmartCaptureTask[] {
  const tasks: SmartCaptureTask[] = [];
  const timeline = capture.interactionTimeline;
  const hasInteractionEvidence = Boolean(
    timeline?.pointerSamples.length
    || timeline?.scrollSamples.length
    || timeline?.focusSamples?.length
    || timeline?.patterns.length
  );

  if (!hasInteractionEvidence && preflight.interactiveCandidates > 0) {
    tasks.push(task("record-interactions", "high", "Interactive elements were detected, but passive capture did not observe a meaningful state change."));
  }
  if (capture.components.length < 3 && preflight.semanticCandidates > capture.components.length) {
    tasks.push(task("capture-component", "medium", "The page contains more semantic regions than the current component evidence represents."));
  }

  if (rebuild) {
    const scenes = capture.rebuildEvidence?.scenes ?? [];
    const capturedStates = new Set(scenes.filter((scene) => scene.status === "captured").map((scene) => sceneState(scene.phase)));
    const capturedViewports = new Set(scenes.filter((scene) => scene.status === "captured").map((scene) => scene.viewport.width <= 600 ? "mobile" : "desktop"));
    const missingViewport = rebuild.viewports.find((viewport) => !capturedViewports.has(viewport));
    if (missingViewport) {
      tasks.push({
        ...task("capture-responsive", "high", `The requested ${missingViewport} viewport has no captured screenshot baseline.`),
        viewport: missingViewport
      });
    }
    const missingState = rebuild.states
      .filter((state): state is Exclude<typeof state, "initial"> => state !== "initial")
      .find((state) => !capturedStates.has(state));
    if (missingState) {
      tasks.push({
        ...task("capture-state", "high", `The requested ${missingState} state has no captured baseline.`),
        state: missingState
      });
    }
    if (preflight.canvasElements > 0 && !rebuild.captureCanvas) {
      tasks.push(task("authorize-canvas", "low", "Canvas elements were detected, but bitmap evidence was not authorized."));
    }
  } else if (preflight.documentHeight > preflight.viewportHeight * 1.5 && !(timeline?.scrollSamples.length)) {
    tasks.push({
      ...task("record-interactions", "medium", "The page extends beyond the viewport, but no scroll evidence was observed."),
      state: "scroll"
    });
  }

  return dedupeTasks(tasks).sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority)).slice(0, 3);
}

function task(kind: SmartCaptureTask["kind"], priority: SmartCaptureTask["priority"], reason: string): SmartCaptureTask {
  return { id: `smart-${kind}`, kind, priority, reason };
}

function dedupeTasks(tasks: SmartCaptureTask[]) {
  const seen = new Set<string>();
  return tasks.filter((item) => {
    const key = `${item.kind}:${item.state ?? ""}:${item.viewport ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function priorityScore(priority: SmartCaptureTask["priority"]) {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function sceneState(phase: RebuildSceneEvidence["phase"]) {
  if (phase === "responsive-scroll" || phase === "page-baseline") return "scroll";
  if (phase === "forced-hover" || phase === "observed-hover") return "hover";
  if (phase === "forced-focus" || phase === "observed-focus") return "focus";
  if (phase === "observed-open") return "open";
  return "initial";
}
