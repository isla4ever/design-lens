import React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { Locale } from "../../src/shared/i18n";

export function EmptyState({ locale }: { locale: Locale }) {
  return (
    <section className="empty-state">
      <div className="empty-icon"><Sparkles aria-hidden="true" /></div>
      <p>{locale === "zh" ? "一次录制即可沉淀风格感知、动效证据与可导出的设计资料。" : "One recording produces style perception, motion evidence, and reusable exports."}</p>
      <div className="hint-rail" aria-hidden="true">
        <span>{locale === "zh" ? "滚动" : "Scroll"}</span>
        <span>{locale === "zh" ? "悬停" : "Hover"}</span>
        <span>{locale === "zh" ? "触发" : "Trigger"}</span>
      </div>
    </section>
  );
}

export function BusyOverlay({ locale }: { locale: Locale }) {
  return (
    <div className="busy-lock" role="status" aria-live="assertive">
      <div className="busy-card">
        <RefreshCw aria-hidden="true" />
        <strong>{locale === "zh" ? "正在生成资料包" : "Generating pack"}</strong>
        <span>{locale === "zh" ? "AI 分析、Prompt 编译和 ZIP 打包进行中，请稍候。" : "AI analysis, prompt compiling, and ZIP packaging are in progress."}</span>
      </div>
    </div>
  );
}
