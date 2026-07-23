import React from "react";
import { Archive, MousePointerClick, PanelRightOpen, RefreshCw, Settings2, Sparkles, Zap } from "lucide-react";
import { formatPatternName } from "../../src/generators/skill/skill-pattern-labels";
import type { DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import { formatSmartCaptureOutcome } from "../../src/smart-capture/presentation";
import type { PackKind } from "./types";

export function ResultPanel({ capture, locale, isBusy, hasAiKey, brief, lastPackKind, onGenerate, onExportEvidence, onDownloadPack, onImproveCoverage, onOpenWorkspace }: {
  capture: DesignCapture;
  locale: Locale;
  isBusy: boolean;
  hasAiKey: boolean;
  brief: DesignBrief;
  lastPackKind: PackKind | null;
  onGenerate: () => void;
  onExportEvidence: () => void;
  onDownloadPack: () => void;
  onImproveCoverage: () => void;
  onOpenWorkspace: () => void;
}) {
  const isRebuild = brief.mode === "rebuild";
  const needsRebuildAuthorization = isRebuild && !brief.rebuild.authorizationConfirmed;
  const taskCount = capture.smartCapture?.tasks.length ?? 0;
  const summary = summarizeResult(capture, locale);

  return (
    <section className="result-panel">
      <div className="result-brief">
        <div className="result-brief-head">
          <strong><Zap aria-hidden="true" />{isRebuild ? (locale === "zh" ? "重建草稿" : "Rebuild draft") : (locale === "zh" ? "设计参照" : "Reference")}</strong>
          {capture.smartCapture ? <span className={`compact-outcome ${capture.smartCapture.outcome}`}>{formatSmartCaptureOutcome(capture.smartCapture.outcome, locale)}{taskCount ? ` · ${taskCount}` : ""}</span> : null}
        </div>
        <p>{summary}</p>
      </div>

      <div className={lastPackKind ? "export-row completed" : isRebuild || hasAiKey ? "export-row single" : "export-row needs-key"}>
        <button className="ai-brief-action primary-pack" type="button" onClick={onGenerate} disabled={isBusy}>
          {isBusy ? <RefreshCw aria-hidden="true" /> : needsRebuildAuthorization ? <Settings2 aria-hidden="true" /> : isRebuild ? <Archive aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          <span>{isRebuild
            ? needsRebuildAuthorization ? (locale === "zh" ? "确认重建范围" : "Confirm rebuild scope") : (locale === "zh" ? "导出重建草稿" : "Export rebuild draft")
            : hasAiKey ? (locale === "zh" ? "生成 Prompt 包" : "Generate prompt pack") : (locale === "zh" ? "配置 AI" : "Configure AI")}</span>
        </button>
        {!isRebuild && !hasAiKey ? <button className="bundle-action evidence-only-action" type="button" onClick={onExportEvidence} disabled={isBusy}><Archive aria-hidden="true" /><span>{locale === "zh" ? "导出资料包" : "Export evidence"}</span></button> : null}
        {lastPackKind ? <button className="bundle-action" type="button" onClick={onDownloadPack} disabled={isBusy}><Archive aria-hidden="true" /><span>{locale === "zh" ? "重新下载" : "Download again"}</span></button> : null}
      </div>

      <div className="result-secondary-actions">
        <button className="improve-coverage-action" type="button" onClick={onImproveCoverage} disabled={isBusy}><MousePointerClick aria-hidden="true" /><span>{locale === "zh" ? `手动补采${taskCount ? ` (${taskCount})` : ""}` : `Manual capture${taskCount ? ` (${taskCount})` : ""}`}</span></button>
        <button className="open-workspace-action" type="button" onClick={onOpenWorkspace}><PanelRightOpen aria-hidden="true" /><span>{locale === "zh" ? "工作区" : "Workspace"}</span></button>
      </div>
    </section>
  );
}

function summarizeResult(capture: DesignCapture, locale: Locale) {
  const structure = capture.layoutProfile.structure[0] ?? capture.layoutProfile.cadence[0] ?? "";
  const pattern = capture.interactionTimeline?.patterns[0]?.kind;
  const motion = capture.motion[0]?.properties.join("+") || capture.motion[0]?.name || "";
  if (locale === "zh") return [structure ? `结构：${structure}` : "", motion ? `动效：${motion}` : "", pattern ? `模式：${formatPatternName(pattern, locale)}` : ""].filter(Boolean).join("；") || "已提取当前范围的布局、样式、动效和交互线索。";
  return [structure ? `Structure: ${structure}` : "", motion ? `Motion: ${motion}` : "", pattern ? `Pattern: ${formatPatternName(pattern, locale)}` : ""].filter(Boolean).join("; ") || "Extracted layout, style, motion, and interaction cues for the current scope.";
}
