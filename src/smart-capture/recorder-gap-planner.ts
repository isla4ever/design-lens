import type { ImportedRecorderFlowMatch, ImportedRecorderFlowPlan, ImportedRecorderFlowScene } from "../capture-v2/core/imported-recorder-flow";
import type { SmartCaptureTask } from "./types";

export type RecorderGapBreakdown = {
  total: number;
  needsTarget: number;
  needsViewportBaseline: number;
  needsStateScreenshot: number;
};

export function planRecorderSupplementalTasks(flow: ImportedRecorderFlowPlan, match: ImportedRecorderFlowMatch): SmartCaptureTask[] {
  if (match.flowId !== flow.id) return [];
  const matches = new Map(match.scenes.map((scene) => [scene.sceneId, scene]));
  const tasks = flow.scenes.flatMap((scene) => {
    const result = matches.get(scene.id);
    if (!result || result.status === "matched") return [];
    return [sceneTask(scene, result.status)];
  });
  return mergeSupplementalTasks(tasks);
}

export function getRecorderGapBreakdown(flow: ImportedRecorderFlowPlan, match: ImportedRecorderFlowMatch): RecorderGapBreakdown {
  const matches = new Map(match.flowId === flow.id ? match.scenes.map((scene) => [scene.sceneId, scene]) : []);
  return flow.scenes.reduce<RecorderGapBreakdown>((summary, scene) => {
    const result = matches.get(scene.id);
    if (result?.status === "matched") return summary;
    summary.total += 1;
    if (!scene.trigger.selector && (scene.trigger.kind === "hover" || scene.trigger.kind === "click" || scene.trigger.kind === "wait")) {
      summary.needsTarget += 1;
    } else if (scene.trigger.kind === "initial") {
      summary.needsViewportBaseline += 1;
    } else {
      summary.needsStateScreenshot += 1;
    }
    return summary;
  }, { total: 0, needsTarget: 0, needsViewportBaseline: 0, needsStateScreenshot: 0 });
}

export function mergeSupplementalTasks(tasks: SmartCaptureTask[]): SmartCaptureTask[] {
  const merged = new Map<string, SmartCaptureTask>();
  const ordered = [...tasks].sort((left, right) => Number(right.source === "recorder-flow") - Number(left.source === "recorder-flow"));
  ordered.forEach((task) => {
    if (isGenericTaskCoveredByRecorder(task, merged.values())) return;
    const key = taskKey(task);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, task);
      return;
    }
    const sceneIds = new Set([...(existing.sourceSceneIds ?? []), ...(task.sourceSceneIds ?? [])]);
    merged.set(key, {
      ...existing,
      priority: priorityScore(task.priority) > priorityScore(existing.priority) ? task.priority : existing.priority,
      ...(sceneIds.size ? { sourceSceneIds: Array.from(sceneIds) } : {})
    });
  });
  return Array.from(merged.values())
    .sort((left, right) => priorityScore(right.priority) - priorityScore(left.priority))
    .slice(0, 3);
}

function isGenericTaskCoveredByRecorder(task: SmartCaptureTask, existingTasks: Iterable<SmartCaptureTask>) {
  if (task.source === "recorder-flow" || task.selector || task.viewport) return false;
  return Array.from(existingTasks).some((existing) => existing.source === "recorder-flow"
    && existing.kind === task.kind
    && existing.state === task.state);
}

function sceneTask(scene: ImportedRecorderFlowScene, status: "partial" | "missing"): SmartCaptureTask {
  const priority: SmartCaptureTask["priority"] = status === "missing" ? "high" : "medium";
  const viewport: NonNullable<SmartCaptureTask["viewport"]> = scene.viewport.width < 768 ? "mobile" : "desktop";
  const selector = scene.trigger.selector;
  const common = {
    id: `recorder-${scene.id}`,
    priority,
    source: "recorder-flow" as const,
    trigger: scene.trigger.kind,
    viewport,
    ...(selector ? { selector } : {}),
    ...(scene.trigger.kind === "scroll" && scene.trigger.value !== undefined ? { targetScrollY: scene.trigger.value } : {}),
    sourceSceneIds: [scene.id],
    reason: status === "missing"
      ? "The imported Recorder scene has no corresponding screenshot evidence."
      : "The imported Recorder scene has an interaction clue but no corresponding screenshot evidence."
  };

  if (scene.trigger.kind === "initial") return { ...common, kind: "capture-responsive" };
  if (scene.trigger.kind === "scroll") return { ...common, kind: "capture-state", state: "scroll" };
  if (scene.trigger.kind === "hover" && selector) return { ...common, kind: "capture-state", state: "hover" };
  if ((scene.trigger.kind === "click" || scene.trigger.kind === "wait") && selector) return { ...common, kind: "capture-state", state: "open" };
  if (scene.trigger.kind === "hover") return { ...common, kind: "capture-component" };
  return { ...common, kind: "record-interactions" };
}

function taskKey(task: SmartCaptureTask) {
  return [task.kind, task.viewport ?? "", task.trigger ?? task.state ?? "", normalizeSelector(task.selector)].join(":");
}

function normalizeSelector(selector: string | undefined) {
  return selector?.replace(/\s+/g, " ").trim() ?? "";
}

function priorityScore(priority: SmartCaptureTask["priority"]) {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}
