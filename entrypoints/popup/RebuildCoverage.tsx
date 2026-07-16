import React from "react";
import { ScanSearch } from "lucide-react";
import { captureProjectFromDesignCapture } from "../../src/capture-v2/core/from-design-capture";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";

export function formatCoverageStatus(status: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    complete: ["完整", "Complete"],
    partial: ["部分", "Partial"],
    missing: ["缺失", "Missing"],
    "not-applicable": ["不适用", "Not applicable"],
    unauthorized: ["未授权", "Unauthorized"],
    failed: ["失败", "Failed"]
  };
  return labels[status]?.[locale === "zh" ? 0 : 1] ?? (locale === "zh" ? "未知" : "Unknown");
}

export function RebuildCoverage({ capture, locale }: { capture: DesignCapture; locale: Locale }) {
  const project = captureProjectFromDesignCapture(capture, "rebuild");
  const visibleAreas = new Set(["structure", "styles", "canvas", "interactions", "screenshots", "responsive"]);
  const items = project.coverage.items.filter((item) => visibleAreas.has(item.area));
  const gaps = items.filter((item) => item.status === "missing" || item.status === "partial").length;
  const baselineSceneCount = project.scenes.filter((scene) => scene.status === "captured" && scene.screenshotArtifactId).length;
  const motionCheckpointCount = project.motionCheckpoints?.filter((checkpoint) => checkpoint.status === "captured" && checkpoint.screenshotArtifactId).length ?? 0;
  const readableCanvasCount = project.canvasFrames?.filter((frame) => frame.status === "readable" && frame.artifactId).length ?? 0;
  const canvasGapCount = project.canvasFrames?.filter((frame) => frame.status !== "readable").length ?? 0;
  const areaLabels: Record<string, [string, string]> = {
    structure: ["结构", "Structure"],
    styles: ["样式", "Styles"],
    canvas: ["Canvas", "Canvas"],
    interactions: ["状态", "States"],
    screenshots: ["截图", "Screenshots"],
    responsive: ["响应式", "Responsive"]
  };
  return (
    <section className="rebuild-coverage" aria-label={locale === "zh" ? "重建证据覆盖" : "Rebuild evidence coverage"}>
      <div className="health-head">
        <strong>{locale === "zh" ? "重建证据覆盖" : "Rebuild coverage"}</strong>
        <span>{locale === "zh" ? `${gaps} 项缺口` : `${gaps} gaps`}</span>
      </div>
      <div className="coverage-list">
        {items.map((item) => (
          <div key={item.area} className={`coverage-item ${item.status}`} title={item.message}>
            <span>{areaLabels[item.area]?.[locale === "zh" ? 0 : 1] ?? item.area}</span>
            <strong>{formatCoverageStatus(item.status, locale)}</strong>
          </div>
        ))}
      </div>
      <div className={baselineSceneCount ? "verification-status ready" : "verification-status blocked"} role="status">
        <ScanSearch aria-hidden="true" />
        <div>
          <strong>{locale === "zh" ? "候选验收尚未运行" : "Candidate acceptance not run"}</strong>
          <span>{locale === "zh"
            ? baselineSceneCount ? `${baselineSceneCount} 个场景基准${motionCheckpointCount ? ` · ${motionCheckpointCount} 个动画进度帧` : ""}可用于导出后验收` : "需要先采集至少一个截图基准场景"
            : baselineSceneCount ? `${baselineSceneCount} scene baselines${motionCheckpointCount ? ` · ${motionCheckpointCount} motion frames` : ""} are ready for exported acceptance` : "Capture at least one screenshot baseline first"}</span>
        </div>
      </div>
      <div className={project.policy.captureCanvas ? readableCanvasCount ? "verification-status ready" : "verification-status blocked" : "verification-status"} role="status">
        <ScanSearch aria-hidden="true" />
        <div>
          <strong>{locale === "zh" ? "Canvas 证据" : "Canvas evidence"}</strong>
          <span>{locale === "zh"
            ? project.policy.captureCanvas ? `${readableCanvasCount} 个可读位图${canvasGapCount ? ` · ${canvasGapCount} 个不可读/受限` : ""}` : "未授权采集"
            : project.policy.captureCanvas ? `${readableCanvasCount} readable bitmap${canvasGapCount ? ` · ${canvasGapCount} unavailable/limited` : ""}` : "Capture not authorized"}</span>
        </div>
      </div>
    </section>
  );
}
