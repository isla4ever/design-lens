import React from "react";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import { evidenceScore } from "./popup-utils";

export function EvidenceHealth({ capture, locale }: { capture: DesignCapture; locale: Locale }) {
  const timeline = capture.interactionTimeline;
  const metrics = timeline?.metrics;
  const trace = capture.implementationTrace;
  const score = evidenceScore(capture);
  const level = score >= 72 ? "strong" : score >= 42 ? "ok" : "weak";
  const label = locale === "zh"
    ? level === "strong" ? "证据充足" : level === "ok" ? "证据可用" : "建议补录"
    : level === "strong" ? "Strong evidence" : level === "ok" ? "Usable evidence" : "Re-record suggested";
  const hint = locale === "zh"
    ? level === "strong" ? "可直接导出给 AI 或开发使用。" : level === "ok" ? "可用，但多录几次 hover/scroll 会更稳。" : "建议录制滚动、悬停、点击和加载完成态。"
    : level === "strong" ? "Ready for AI or implementation handoff." : level === "ok" ? "Usable; more hover/scroll passes improve quality." : "Record scroll, hover, click, and loaded states.";

  return (
    <div className={`evidence-health ${level}`}>
      <div className="health-head"><strong>{label}</strong><span>{score}%</span></div>
      <div className="health-bar" aria-hidden="true"><span style={{ width: `${score}%` }} /></div>
      <p>{hint}</p>
      <div className="timeline-meta">
        <span>{locale === "zh" ? `指针 ${timeline?.pointerSamples.length ?? 0}` : `Pointer ${timeline?.pointerSamples.length ?? 0}`}</span>
        <span>{locale === "zh" ? `滚动 ${timeline?.scrollSamples.length ?? 0}` : `Scroll ${timeline?.scrollSamples.length ?? 0}`}</span>
        <span>{locale === "zh" ? `动画 ${metrics?.runtimeAnimationCount ?? 0}` : `Animations ${metrics?.runtimeAnimationCount ?? 0}`}</span>
        <span>{locale === "zh" ? `实现 ${trace?.assets.length ?? 0}` : `Trace ${trace?.assets.length ?? 0}`}</span>
      </div>
    </div>
  );
}
