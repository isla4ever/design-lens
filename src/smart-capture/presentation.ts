import type { Locale } from "../shared/i18n";
import type { SmartCaptureReport, SmartCaptureTask } from "./types";

export function formatSmartCaptureOutcome(outcome: SmartCaptureReport["outcome"], locale: Locale) {
  const labels = {
    complete: ["完整完成", "Complete"],
    degraded: ["安全降级", "Reduced safely"],
    cancelled: ["用户停止", "Stopped"]
  } as const;
  return labels[outcome][locale === "zh" ? 0 : 1];
}

export function formatSmartCaptureTask(task: SmartCaptureTask, locale: Locale) {
  const zh = locale === "zh";
  if (task.source === "recorder-flow") return formatRecorderTask(task, zh);
  const copy: Record<SmartCaptureTask["kind"], { title: [string, string]; hint: [string, string] }> = {
    "record-interactions": {
      title: [task.state === "scroll" ? "补录页面滚动" : "补录关键交互", task.state === "scroll" ? "Capture page scroll" : "Capture key interactions"],
      hint: ["使用补充覆盖完成页面未自然出现的状态。", "Use guided coverage for states that did not appear naturally."]
    },
    "capture-component": {
      title: ["选取核心组件", "Pick a key component"],
      hint: ["单独采集结果中缺少的核心区域。", "Capture a key region that is underrepresented in the result."]
    },
    "capture-responsive": {
      title: [`补充${task.viewport === "mobile" ? "移动端" : "桌面端"}基线`, `Add ${task.viewport ?? "responsive"} baseline`],
      hint: ["该目标视口还没有可验收截图。", "The requested viewport has no acceptance baseline yet."]
    },
    "capture-state": {
      title: [`补采${formatStateLabel(task.state, true)}状态`, `Capture ${formatStateLabel(task.state, false)} state`],
      hint: ["该请求状态仍是证据缺口。", "This requested state remains an evidence gap."]
    },
    "authorize-canvas": {
      title: ["确认 Canvas 证据", "Confirm Canvas evidence"],
      hint: ["检测到 Canvas；仅在拥有权限时于重建范围中开启。", "Canvas was detected; enable it in rebuild scope only when authorized."]
    }
  };
  const value = copy[task.kind];
  return { title: value.title[zh ? 0 : 1], hint: value.hint[zh ? 0 : 1] };
}

function formatRecorderTask(task: SmartCaptureTask, zh: boolean) {
  const viewport = task.viewport === "mobile" ? (zh ? "移动端" : "Mobile") : (zh ? "桌面端" : "Desktop");
  if (task.kind === "capture-responsive") {
    return zh
      ? { title: `补采${viewport}基线`, hint: "Recorder 计划中的该视口还没有截图证据。" }
      : { title: `Capture ${viewport.toLowerCase()} baseline`, hint: "This Recorder viewport still has no screenshot evidence." };
  }
  if (task.kind === "capture-component") {
    return zh
      ? { title: "定位悬停目标", hint: "Recorder 未保留可用选择器，请先在页面中确认目标。" }
      : { title: "Locate hover target", hint: "Recorder kept no usable selector; confirm the target on the page first." };
  }
  if (task.kind === "record-interactions") {
    return zh
      ? { title: "补录关键交互", hint: "Recorder 未保留可用目标，请在引导采集中手动完成该状态。" }
      : { title: "Capture key interaction", hint: "Recorder kept no usable target; complete the state in guided coverage." };
  }
  const state = task.state === "scroll" ? (zh ? "滚动" : "scroll") : task.state === "hover" ? (zh ? "悬停" : "hover") : (zh ? "打开" : "open");
  return zh
    ? { title: `补采${state}状态`, hint: `${viewport} Recorder 场景仍缺少对应截图。` }
    : { title: `Capture ${state} state`, hint: `The ${viewport.toLowerCase()} Recorder scene still needs a matching screenshot.` };
}

function formatStateLabel(state: SmartCaptureTask["state"], zh: boolean) {
  const labels = {
    scroll: ["滚动", "scroll"],
    hover: ["悬停", "hover"],
    focus: ["聚焦", "focus"],
    open: ["打开", "open"]
  } as const;
  return state ? labels[state][zh ? 0 : 1] : (zh ? "交互" : "interaction");
}

export function formatSmartCaptureDuration(durationMs: number) {
  return durationMs >= 1_000 ? `${(durationMs / 1_000).toFixed(1)}s` : `${Math.round(durationMs)}ms`;
}
