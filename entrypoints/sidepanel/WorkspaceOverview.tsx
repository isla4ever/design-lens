import React from "react";
import { Archive, Crosshair, RefreshCw, ScanSearch, Settings2, Square } from "lucide-react";
import { formatSmartCaptureOutcome, formatSmartCaptureTask } from "../../src/smart-capture/presentation";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import type { SmartCaptureTask } from "../../src/smart-capture/types";

export function WorkspaceOverview({ capture, tasks, recorderGapCount, locale, isBusy, isRecording, hasAiKey, isCurrentResult, onCapture, onStop, onImprove, onExport, onOpenSettings, onShowCurrent }: {
  capture: DesignCapture | null;
  tasks: SmartCaptureTask[];
  recorderGapCount: number;
  locale: Locale;
  isBusy: boolean;
  isRecording: boolean;
  hasAiKey: boolean;
  isCurrentResult: boolean;
  onCapture: () => void;
  onStop: () => void;
  onImprove: () => void;
  onExport: () => void;
  onOpenSettings: () => void;
  onShowCurrent: () => void;
}) {
  const zh = locale === "zh";
  if (!capture) {
    return (
      <section className="workspace-empty" aria-labelledby="workspace-empty-title">
        <ScanSearch aria-hidden="true" />
        <h2 id="workspace-empty-title">{zh ? "当前标签页尚未捕获" : "No capture for this tab"}</h2>
        <button className="workspace-primary" type="button" onClick={onCapture} disabled={isBusy}>
          <ScanSearch aria-hidden="true" />{zh ? "智能捕获" : "Smart Capture"}
        </button>
      </section>
    );
  }

  const isRebuild = capture.smartCapture?.mode === "rebuild" || Boolean(capture.rebuildEvidence);
  const nextTaskNeedsTarget = tasks[0]?.source === "recorder-flow" && tasks[0].kind === "capture-component";
  return (
    <div className="overview-layout">
      <section className="result-summary" aria-labelledby="workspace-result-title">
        <div className="result-summary-head">
          <div>
            <span>{isRebuild ? (zh ? "重建草稿" : "Rebuild draft") : (zh ? "设计参照" : "Design reference")}</span>
            <h2 id="workspace-result-title">{capture.page.title}</h2>
          </div>
          {capture.smartCapture ? <strong className={`outcome ${capture.smartCapture.outcome}`}>{formatSmartCaptureOutcome(capture.smartCapture.outcome, locale)}</strong> : null}
        </div>
        <div className="workspace-metrics" aria-label={zh ? "捕获指标" : "Capture metrics"}>
          <Metric value={capture.components.length} label={zh ? "组件" : "Components"} />
          <Metric value={capture.motion.length} label={zh ? "动效" : "Motion"} />
          <Metric value={capture.interactions.length} label={zh ? "交互" : "Actions"} />
          <Metric value={tasks.length} label={zh ? "任务" : "Tasks"} />
        </div>
        <div className="workspace-action-grid">
          <button className="workspace-primary" type="button" onClick={onExport} disabled={isBusy}>
            {isBusy ? <RefreshCw aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {isRebuild ? (zh ? "导出重建草稿" : "Export rebuild draft") : hasAiKey ? (zh ? "生成 Prompt 包" : "Generate prompt pack") : (zh ? "导出基础资料包" : "Export evidence pack")}
          </button>
          {isCurrentResult && isRecording ? (
            <button className="workspace-stop" type="button" onClick={onStop} disabled={isBusy}><Square aria-hidden="true" />{zh ? "停止捕获" : "Stop capture"}</button>
          ) : isCurrentResult ? (
            <button className="workspace-secondary" type="button" onClick={onCapture} disabled={isBusy}><ScanSearch aria-hidden="true" />{zh ? "重新捕获" : "Recapture"}</button>
          ) : null}
          {isCurrentResult ? <button className="workspace-secondary" type="button" onClick={onImprove} disabled={isBusy || isRecording}>{nextTaskNeedsTarget ? <Crosshair aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}{nextTaskNeedsTarget ? (zh ? "定位首个缺口目标" : "Locate next gap target") : recorderGapCount ? (zh ? `补采 ${recorderGapCount} 个关键缺口` : `Capture ${recorderGapCount} key ${recorderGapCount === 1 ? "gap" : "gaps"}`) : (zh ? "补充覆盖" : "Improve coverage")}</button> : null}
        </div>
        {!isCurrentResult ? <div className="historical-context"><span>{zh ? "这是历史结果，仅支持查看和导出。" : "This is a historical result and is read-only."}</span><button type="button" onClick={onShowCurrent}>{zh ? "返回当前标签页" : "Show current tab"}</button></div> : null}
        {!isRebuild && !hasAiKey ? <button className="inline-command" type="button" onClick={onOpenSettings}><Settings2 aria-hidden="true" />{zh ? "配置 AI 后生成 Prompt" : "Configure AI for prompt generation"}</button> : null}
      </section>

      <section className="task-section" aria-labelledby="coverage-task-title">
        <div className="section-heading">
          <div><span>{zh ? "下一步" : "Next"}</span><h2 id="coverage-task-title">{zh ? "补充任务" : "Coverage tasks"}</h2></div>
          <strong>{tasks.length}</strong>
        </div>
        {tasks.length ? (
          <div className="workspace-task-list">
            {tasks.map((task) => {
              const copy = formatSmartCaptureTask(task, locale);
              return <div className={`workspace-task ${task.priority}`} key={task.id}><strong>{copy.title}</strong><span>{copy.hint}</span></div>;
            })}
          </div>
        ) : <p className="quiet-state">{zh ? "没有关键补充任务" : "No critical follow-up tasks"}</p>}
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}
