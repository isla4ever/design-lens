import React from "react";
import { RefreshCw } from "lucide-react";
import type { CaptureMode } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";

export function EmptyState({ locale, mode }: { locale: Locale; mode: CaptureMode }) {
  return (
    <section className="empty-state">
      <strong>{locale === "zh" ? "等待采集" : "Ready to capture"}</strong>
      <p>{locale === "zh" ? mode === "rebuild" ? "输出可追溯的重建草稿，并明确标记证据缺口。" : "提取可复用的视觉、布局、动效与交互规律。" : mode === "rebuild" ? "Produce a traceable rebuild draft with explicit evidence gaps." : "Extract reusable visual, layout, motion, and interaction patterns."}</p>
    </section>
  );
}

export function BusyOverlay({ locale, mode }: { locale: Locale; mode: CaptureMode }) {
  return (
    <div className="busy-lock" role="status" aria-live="assertive">
      <div className="busy-card">
        <RefreshCw aria-hidden="true" />
        <strong>{locale === "zh" ? mode === "rebuild" ? "正在生成重建草稿" : "正在生成资料包" : mode === "rebuild" ? "Generating rebuild draft" : "Generating pack"}</strong>
        <span>{locale === "zh" ? mode === "rebuild" ? "正在整理完整证据、场景计划和验收规则。" : "AI 分析、Prompt 编译和 ZIP 打包进行中，请稍候。" : mode === "rebuild" ? "Preparing complete evidence, scene plans, and acceptance rules." : "AI analysis, prompt compiling, and ZIP packaging are in progress."}</span>
      </div>
    </div>
  );
}
