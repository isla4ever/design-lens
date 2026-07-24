import type { DesignCapture } from "../shared/schema";
import type { SmartCaptureTask } from "./types";

export type CaptureReadiness = "reference-ready" | "rebuild-ready" | "needs-capture";

export function getCaptureReadiness(capture: DesignCapture, tasks: SmartCaptureTask[] = capture.smartCapture?.tasks ?? []): CaptureReadiness {
  const isRebuild = capture.smartCapture?.mode === "rebuild" || Boolean(capture.rebuildEvidence);
  const safetyLevel = capture.smartCapture?.budget.safetyLevel;
  const wasStopped = capture.smartCapture?.outcome === "cancelled" || safetyLevel === "snapshot-only" || safetyLevel === "stopped";
  const hasBlockingTask = tasks.some((task) => task.priority === "high");
  const hasDesignSignals = capture.components.length > 0
    || capture.layout.length > 0
    || capture.tokens.colors.length > 0
    || capture.tokens.typography.length > 0;

  if (wasStopped || hasBlockingTask || !hasDesignSignals) return "needs-capture";
  if (!isRebuild) return "reference-ready";

  const hasScreenshot = capture.rebuildEvidence?.scenes.some((scene) => scene.status === "captured" && Boolean(scene.screenshotArtifactId)) ?? false;
  const hasGeometry = capture.components.some((component) => component.layout.width > 0 && component.layout.height > 0);
  return hasScreenshot && hasGeometry ? "rebuild-ready" : "needs-capture";
}

export function formatCaptureReadiness(readiness: CaptureReadiness, locale: "zh" | "en") {
  const zh = locale === "zh";
  if (readiness === "reference-ready") {
    return {
      title: zh ? "可直接参照" : "Ready to reference",
      description: zh ? "结构与设计语言已足够，可直接导出。" : "Structure and design language are ready to export."
    };
  }
  if (readiness === "rebuild-ready") {
    return {
      title: zh ? "可进入重建" : "Ready to rebuild",
      description: zh ? "已有截图、几何和关键状态证据。" : "Screenshots, geometry, and key state evidence are available."
    };
  }
  return {
    title: zh ? "需要补采" : "Needs capture",
    description: zh ? "仍有关键证据缺口，先完成下一项补采任务。" : "A key evidence gap remains. Complete the next capture task."
  };
}
