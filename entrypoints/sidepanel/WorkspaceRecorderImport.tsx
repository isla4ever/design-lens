import React from "react";
import { FileJson2, Trash2, Upload } from "lucide-react";
import type { ImportedRecorderFlowMatch, ImportedRecorderFlowPlan, ImportedRecorderWarning } from "../../src/capture-v2/core/imported-recorder-flow";
import type { Locale } from "../../src/shared/i18n";
import { getRecorderGapBreakdown } from "../../src/smart-capture/recorder-gap-planner";

export function WorkspaceRecorderImport({ flow, match, locale, disabled, onImport, onClear }: {
  flow: ImportedRecorderFlowPlan | undefined;
  locale: Locale;
  disabled: boolean;
  onImport: (file: File) => void;
  match: ImportedRecorderFlowMatch | undefined;
  onClear: () => void;
}) {
  const zh = locale === "zh";
  const gaps = flow && match ? getRecorderGapBreakdown(flow, match) : null;
  return (
    <section className="recorder-import" aria-labelledby="recorder-import-title">
      <div className="recorder-import-head">
        <span id="recorder-import-title">{zh ? "导入 DevTools Recorder JSON" : "Import DevTools Recorder JSON"}</span>
        <label className={disabled ? "recorder-file-button disabled" : "recorder-file-button"}>
          <Upload aria-hidden="true" />{flow ? (zh ? "替换" : "Replace") : (zh ? "导入" : "Import")}
          <input
            type="file"
            accept="application/json,.json"
            disabled={disabled}
            onClick={(event) => { event.currentTarget.value = ""; }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onImport(file);
            }}
          />
        </label>
      </div>

      {flow ? (
        <div className="recorder-flow-summary">
          <div className="recorder-flow-title"><FileJson2 aria-hidden="true" /><div><strong>{flow.title}</strong><span>{formatImportedAt(flow.importedAt, locale)}</span></div></div>
          <dl className="recorder-flow-metrics">
            <Metric label={zh ? "步骤" : "Steps"} value={flow.totalStepCount} />
            <Metric label={zh ? "场景计划" : "Scenes"} value={flow.scenes.length} />
            <Metric label={zh ? "已脱敏" : "Redacted"} value={flow.redactedStepCount} />
            <Metric label={zh ? "已忽略" : "Omitted"} value={flow.ignoredStepCount} />
          </dl>
          {match ? <div className="recorder-match-summary" role="status"><strong>{zh ? "证据匹配" : "Evidence match"}</strong><span>{zh ? `${match.counts.matched} 已匹配 · ${match.counts.partial} 部分 · ${match.counts.missing} 缺口` : `${match.counts.matched} matched · ${match.counts.partial} partial · ${match.counts.missing} missing`}</span></div> : null}
          {gaps ? <p className={gaps.total ? "recorder-gap-note" : "recorder-gap-note complete"}>{formatGapBreakdown(gaps, locale)}</p> : null}
          {flow.warnings.length ? <ul className="recorder-warnings">{flow.warnings.map((warning) => <li key={warning}>{formatWarning(warning, locale)}</li>)}</ul> : null}
          <button className="recorder-clear" type="button" onClick={onClear} disabled={disabled}><Trash2 aria-hidden="true" />{zh ? "移除流程" : "Remove flow"}</button>
        </div>
      ) : <p className="route-empty">{zh ? "导入后只生成脱敏的场景计划，不会在当前页面自动点击、输入或跳转。" : "Import creates a redacted scene plan only. It never clicks, types, or navigates the current page."}</p>}
    </section>
  );
}

function formatGapBreakdown(gaps: ReturnType<typeof getRecorderGapBreakdown>, locale: Locale) {
  const zh = locale === "zh";
  if (!gaps.total) return zh ? "所有导入场景均有对应截图证据。" : "Every imported scene has matching screenshot evidence.";
  const reasons = [
    gaps.needsTarget ? (zh ? `${gaps.needsTarget} 个目标需定位` : `${gaps.needsTarget} ${gaps.needsTarget === 1 ? "target needs" : "targets need"} locating`) : "",
    gaps.needsViewportBaseline ? (zh ? `${gaps.needsViewportBaseline} 个视口缺基线` : `${gaps.needsViewportBaseline} viewport ${gaps.needsViewportBaseline === 1 ? "baseline is" : "baselines are"} missing`) : "",
    gaps.needsStateScreenshot ? (zh ? `${gaps.needsStateScreenshot} 个状态缺截图` : `${gaps.needsStateScreenshot} state ${gaps.needsStateScreenshot === 1 ? "screenshot is" : "screenshots are"} missing`) : ""
  ].filter(Boolean);
  return `${zh ? "待补齐：" : "To resolve: "}${reasons.join(zh ? " · " : "; ")}`;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatImportedAt(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatWarning(warning: ImportedRecorderWarning, locale: Locale) {
  const labels: Record<ImportedRecorderWarning, [string, string]> = {
    "multiple-origins": ["包含多个来源，导航必须由用户确认。", "Multiple origins found; navigation requires user confirmation."],
    "non-css-selectors-omitted": ["非 CSS 选择器已省略，部分场景需要人工定位。", "Non-CSS selectors were omitted; some scenes need manual targeting."],
    "scene-limit-reached": ["场景已达到导入上限，后续步骤未展开。", "The scene import limit was reached; later steps were not expanded."],
    "sensitive-input-redacted": ["输入值已脱敏，不会写入工作区或导出包。", "Input values were redacted from the workspace and export."],
    "unsafe-steps-omitted": ["脚本、关闭或不安全步骤已省略。", "Script, close, or unsafe steps were omitted."]
  };
  return labels[warning][locale === "zh" ? 0 : 1];
}
