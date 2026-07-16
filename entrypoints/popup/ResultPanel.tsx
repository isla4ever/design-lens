import React, { useEffect, useState } from "react";
import { Archive, PanelRightOpen, RefreshCw, ScanSearch, Sparkles, Zap } from "lucide-react";
import { formatPatternName } from "../../src/generators/skill/skill-pattern-labels";
import type { DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import { formatSmartCaptureOutcome } from "../../src/smart-capture/presentation";
import { IntentBriefPanel } from "./IntentBriefPanel";
import type { PackKind } from "./types";

export function ResultPanel({ capture, locale, isBusy, hasAiKey, brief, lastPackKind, onGenerate, onSubmitBrief, onExportEvidence, onDownloadPack, onImproveCoverage, onOpenWorkspace }: {
  capture: DesignCapture;
  locale: Locale;
  isBusy: boolean;
  hasAiKey: boolean;
  brief: DesignBrief;
  lastPackKind: PackKind | null;
  onGenerate: () => void;
  onSubmitBrief: (brief: DesignBrief) => void | Promise<void>;
  onExportEvidence: () => void;
  onDownloadPack: () => void;
  onImproveCoverage: () => void;
  onOpenWorkspace: () => void;
}) {
  const [briefOpen, setBriefOpen] = useState(false);
  const [draftBrief, setDraftBrief] = useState<DesignBrief>(brief);
  const isRebuild = brief.mode === "rebuild";
  const taskCount = capture.smartCapture?.tasks.length ?? 0;
  const summary = summarizeResult(capture, locale);

  useEffect(() => {
    if (!hasAiKey && !isRebuild) setBriefOpen(false);
  }, [hasAiKey, isRebuild]);

  useEffect(() => setDraftBrief(brief), [brief]);

  function handleGenerateClick() {
    onGenerate();
    if ((hasAiKey || isRebuild) && !isBusy) setBriefOpen(true);
  }

  return (
    <section className="result-panel">
      <div className="result-brief">
        <strong><Zap aria-hidden="true" />{isRebuild ? (locale === "zh" ? "重建草稿" : "Rebuild draft") : (locale === "zh" ? "设计参考" : "Design reference")}</strong>
        <p>{summary}</p>
        {capture.smartCapture ? <span className={`compact-outcome ${capture.smartCapture.outcome}`}>{formatSmartCaptureOutcome(capture.smartCapture.outcome, locale)}{taskCount ? ` · ${locale === "zh" ? `${taskCount} 个补充任务` : `${taskCount} tasks`}` : ""}</span> : null}
      </div>

      <div className={lastPackKind ? "export-row completed" : isRebuild || hasAiKey ? "export-row single" : "export-row needs-key"}>
        <button className="ai-brief-action primary-pack" type="button" onClick={handleGenerateClick} disabled={isBusy}>
          {isBusy ? <RefreshCw aria-hidden="true" /> : isRebuild ? <Archive aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {isRebuild
            ? briefOpen ? (locale === "zh" ? "填写重建范围" : "Fill rebuild scope") : (locale === "zh" ? "生成重建草稿" : "Create rebuild draft")
            : hasAiKey ? briefOpen ? (locale === "zh" ? "填写要求" : "Fill brief") : (locale === "zh" ? "生成并打包" : "Generate pack") : (locale === "zh" ? "配置 Key" : "Configure key")}
        </button>
        {!isRebuild && !hasAiKey ? <button className="bundle-action evidence-only-action" type="button" onClick={onExportEvidence} disabled={isBusy}><Archive aria-hidden="true" />{locale === "zh" ? "导出基础资料包" : "Evidence-only pack"}</button> : null}
        {lastPackKind ? <button className="bundle-action" type="button" onClick={onDownloadPack} disabled={isBusy}><Archive aria-hidden="true" />{locale === "zh" ? "重新下载" : "Download again"}</button> : null}
      </div>

      <div className="result-secondary-actions">
        <button className="improve-coverage-action" type="button" onClick={onImproveCoverage} disabled={isBusy}><ScanSearch aria-hidden="true" />{locale === "zh" ? `补充覆盖${taskCount ? ` (${taskCount})` : ""}` : `Improve coverage${taskCount ? ` (${taskCount})` : ""}`}</button>
        <button className="open-workspace-action" type="button" onClick={onOpenWorkspace}><PanelRightOpen aria-hidden="true" />{locale === "zh" ? "打开工作区" : "Open workspace"}</button>
      </div>

      {briefOpen ? (
        <section className="inline-brief-panel">
          <div className="inline-brief-head"><div><strong>{isRebuild ? (locale === "zh" ? "重建范围" : "Rebuild scope") : (locale === "zh" ? "生成要求" : "Generation brief")}</strong></div></div>
          <IntentBriefPanel locale={locale} brief={draftBrief} disabled={isBusy} onChange={setDraftBrief} />
          <div className="inline-brief-actions">
            <button className="dialog-cancel" type="button" onClick={() => setBriefOpen(false)} disabled={isBusy}>{locale === "zh" ? "收起" : "Collapse"}</button>
            <button className="dialog-submit" type="button" onClick={() => onSubmitBrief(draftBrief)} disabled={isBusy || (isRebuild && !draftBrief.rebuild.authorizationConfirmed)}>{isBusy ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{isRebuild ? (locale === "zh" ? "导出重建草稿" : "Export rebuild draft") : (locale === "zh" ? "生成并打包" : "Generate pack")}</button>
          </div>
        </section>
      ) : null}
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
