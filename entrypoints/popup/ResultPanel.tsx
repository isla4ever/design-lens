import React, { useEffect, useState } from "react";
import { Archive, KeyRound, PackageCheck, RefreshCw, Sparkles, Zap } from "lucide-react";
import type { AiProviderProfile } from "../../src/shared/ai-settings";
import type { DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";
import { messages } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import { formatPatternName } from "../../src/generators/skill/skill-pattern-labels";
import { evidenceScore, formatAiModelLabel } from "./popup-utils";
import type { PackKind } from "./types";
import { IntentBriefPanel } from "./IntentBriefPanel";

export function ResultPanel({
  capture,
  locale,
  isBusy,
  hasAiKey,
  aiProfile,
  brief,
  lastPackKind,
  onGenerate,
  onSubmitBrief,
  onExportEvidence,
  onDownloadPack
}: {
  capture: DesignCapture;
  locale: Locale;
  isBusy: boolean;
  hasAiKey: boolean;
  aiProfile: AiProviderProfile;
  brief: DesignBrief;
  lastPackKind: PackKind | null;
  onGenerate: () => void;
  onSubmitBrief: (brief: DesignBrief) => void | Promise<void>;
  onExportEvidence: () => void;
  onDownloadPack: () => void;
}) {
  const [briefOpen, setBriefOpen] = useState(false);
  const [draftBrief, setDraftBrief] = useState<DesignBrief>(brief);
  const timeline = capture.interactionTimeline;
  const primaryPatterns = timeline?.patterns.slice(0, 4) ?? [];
  const chips = [
    ...capture.layoutProfile.structure.slice(0, 2),
    ...capture.layoutProfile.cadence.slice(0, 2),
    ...primaryPatterns.map((pattern) => formatPatternName(pattern.kind, locale))
  ].filter(Boolean).slice(0, 6);
  const t = messages[locale];
  const summary = summarizeResult(capture, locale);
  const aiModelLabel = formatAiModelLabel(aiProfile);

  useEffect(() => {
    if (!hasAiKey) setBriefOpen(false);
  }, [hasAiKey]);

  useEffect(() => {
    setDraftBrief(brief);
  }, [brief]);

  function handleGenerateClick() {
    onGenerate();
    if (hasAiKey && !isBusy) setBriefOpen(true);
  }

  return (
    <section className="result-panel">
      <div className="result-brief">
        <strong><Zap aria-hidden="true" />{locale === "zh" ? "设计参考" : "Design reference"}</strong>
        <p>{summary}</p>
      </div>

      <div className="signal-grid compact">
        <Signal value={capture.components.length} label={t.components} />
        <Signal value={capture.motion.length} label={t.motion} />
        <Signal value={capture.interactions.length} label={locale === "zh" ? "交互" : "Actions"} />
        <Signal value={capture.implementationTrace?.librarySignals.length ?? 0} label={locale === "zh" ? "库线索" : "Libraries"} />
      </div>

      <EvidenceHealth capture={capture} locale={locale} />

      <div className="chips" aria-label={locale === "zh" ? "核心线索" : "Core cues"}>
        {chips.length ? chips.map((chip) => <span key={chip}>{chip}</span>) : <span>{locale === "zh" ? "等待更多录制状态" : "Awaiting richer recording"}</span>}
      </div>

      <div className="ready-note">
        <PackageCheck aria-hidden="true" />
        <p>
          {locale === "zh"
            ? hasAiKey ? "Token、Skill、实现链路和证据摘要已准备就绪。只差一步：让 AI 把它们压缩成你的目标网站实施 Prompt，并一起打包下载。" : "Token、Skill、实现链路和证据摘要已准备就绪。配置 API Key 后可生成 AI Prompt；也可以先导出不含 Prompt 的基础资料包。"
            : hasAiKey ? "Tokens, Skill, implementation trace, and evidence are ready. One step left: let AI turn them into a target-site prompt and download the full pack." : "Tokens, Skill, implementation trace, and evidence are ready. Add an API key for AI prompt generation, or export an evidence-only pack."}
        </p>
      </div>

      {!hasAiKey ? (
        <div className="api-key-nudge" role="note">
          <KeyRound aria-hidden="true" />
          <span>{locale === "zh" ? "未配置 API Key：不会生成 Prompt，避免导出内容名不副实。" : "No API key configured: prompt generation is disabled to keep exports honest."}</span>
        </div>
      ) : null}

      <div className={hasAiKey ? "model-status ready" : "model-status missing"} title={aiModelLabel}>
        <KeyRound aria-hidden="true" />
        <span>{locale === "zh" ? "当前模型" : "Current model"}</span>
        <strong>{aiModelLabel}</strong>
        <em>{hasAiKey ? (locale === "zh" ? "已配置" : "Ready") : (locale === "zh" ? "待配置" : "Needs key")}</em>
      </div>

      <div className={lastPackKind ? "export-row completed" : hasAiKey ? "export-row single" : "export-row needs-key"}>
        <button className="ai-brief-action primary-pack" type="button" onClick={handleGenerateClick} disabled={isBusy}>
          {isBusy ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {hasAiKey ? (briefOpen ? (locale === "zh" ? "填写要求" : "Fill brief") : (locale === "zh" ? "生成并打包" : "Generate pack")) : (locale === "zh" ? "配置 Key" : "Configure key")}
        </button>
        {!hasAiKey ? (
          <button className="bundle-action evidence-only-action" type="button" onClick={onExportEvidence} disabled={isBusy}>
            <Archive aria-hidden="true" />
            {locale === "zh" ? "导出基础资料包" : "Evidence-only pack"}
          </button>
        ) : null}
        {lastPackKind ? (
          <button className="bundle-action" type="button" onClick={onDownloadPack} disabled={isBusy}>
            <Archive aria-hidden="true" />
            {locale === "zh" ? `重新下载${lastPackKind === "ai-prompt" ? " Prompt 包" : "基础包"}` : `Download ${lastPackKind === "ai-prompt" ? "prompt pack" : "evidence pack"}`}
          </button>
        ) : null}
      </div>
      {briefOpen ? (
        <section className="inline-brief-panel">
          <div className="inline-brief-head">
            <div>
              <strong>{locale === "zh" ? "生成要求" : "Generation brief"}</strong>
              <span>{locale === "zh" ? "补充你想做的网站类型和借鉴重点，生成后会自动打包下载。" : "Describe the target site and borrowing focus. The pack downloads automatically after generation."}</span>
            </div>
          </div>
          <IntentBriefPanel locale={locale} brief={draftBrief} disabled={isBusy} onChange={setDraftBrief} />
          <div className="inline-brief-actions">
            <button className="dialog-cancel" type="button" onClick={() => setBriefOpen(false)} disabled={isBusy}>
              {locale === "zh" ? "收起" : "Collapse"}
            </button>
            <button className="dialog-submit" type="button" onClick={() => onSubmitBrief(draftBrief)} disabled={isBusy}>
              {isBusy ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              {locale === "zh" ? "生成并打包" : "Generate pack"}
            </button>
          </div>
        </section>
      ) : null}
      <p className="export-note">
        {hasAiKey
          ? (locale === "zh"
            ? "Prompt 包包含 README、skill、evidence、ai prompt 四类核心文件。"
            : "Prompt pack contains README, skill, evidence, and AI prompt files.")
          : (locale === "zh"
            ? "基础包只包含 README、skill、evidence，文件名标记 evidence-only。"
            : "Evidence-only pack contains README, skill, and evidence; filename is marked evidence-only.")}
      </p>
    </section>
  );
}

function EvidenceHealth({ capture, locale }: { capture: DesignCapture; locale: Locale }) {
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
      <div className="health-head">
        <strong>{label}</strong>
        <span>{score}%</span>
      </div>
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

function Signal({ value, label }: { value: number; label: string }) {
  return (
    <div className="signal">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function summarizeResult(capture: DesignCapture, locale: Locale) {
  const structure = capture.layoutProfile.structure[0] ?? capture.layoutProfile.cadence[0] ?? "";
  const pattern = capture.interactionTimeline?.patterns[0]?.kind;
  const motion = capture.motion[0]?.properties.join("+") || capture.motion[0]?.name || "";
  if (locale === "zh") {
    return [
      structure ? `结构：${structure}` : "",
      motion ? `动效：${motion}` : "",
      pattern ? `模式：${formatPatternName(pattern, locale)}` : ""
    ].filter(Boolean).join("；") || "已提取当前范围的布局、样式、动效和交互线索。";
  }
  return [
    structure ? `Structure: ${structure}` : "",
    motion ? `Motion: ${motion}` : "",
    pattern ? `Pattern: ${formatPatternName(pattern, locale)}` : ""
  ].filter(Boolean).join("; ") || "Extracted layout, style, motion, and interaction cues for the current scope.";
}
