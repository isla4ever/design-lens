import { withLocalizedAnalysis } from "../analyzer/core/analysis";
import { messages, type Locale } from "../shared/i18n";
import type { DesignCapture } from "../shared/schema";
import type { ThemeMode } from "../shared/theme-storage";

type OverlayVariant = "status" | "capture" | "recorder" | "recording";

type CaptureMarkupOptions = {
  capture: DesignCapture;
  locale: Locale;
};

export function buildOverlayMarkup(theme: ThemeMode, content: string, variant: OverlayVariant = "status") {
  return `
    <style>
      :host { all: initial; color-scheme: ${theme === "light" ? "light" : "dark"}; }
      * { box-sizing: border-box; }
      .panel {
        align-items: center;
        background:
          linear-gradient(135deg, ${theme === "light" ? "rgba(255,255,255,.92)" : "rgba(19,24,22,.92)"}, ${theme === "light" ? "rgba(246,239,224,.86)" : "rgba(9,13,12,.9)"}),
          repeating-linear-gradient(90deg, ${theme === "light" ? "rgba(16,24,20,.05)" : "rgba(255,255,255,.035)"} 0 1px, transparent 1px 16px);
        border: 1px solid ${theme === "light" ? "rgba(17,23,19,.16)" : "rgba(255,249,236,.18)"};
        border-radius: 14px;
        box-shadow: ${theme === "light" ? "0 20px 56px rgba(26,28,23,.16)" : "0 22px 64px rgba(0,0,0,.38)"};
        color: ${theme === "light" ? "#111713" : "#fff9ec"};
        display: inline-grid;
        gap: 10px;
        grid-template-columns: auto minmax(150px, 1fr) auto;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        max-width: min(380px, calc(100vw - 36px));
        min-height: 52px;
        overflow: hidden;
        padding: 8px 9px;
        pointer-events: auto;
        transition: opacity 180ms ease, transform 180ms ease, border-color 180ms ease;
        width: max-content;
      }
      .panel:not(.is-capture) {
        border-radius: 999px;
        grid-template-columns: auto minmax(132px, 1fr) auto;
      }
      .panel.is-leaving {
        opacity: 0;
        transform: translateY(8px) scale(.98);
      }
      .panel.is-capture {
        align-items: stretch;
        grid-template-columns: minmax(0, 1fr);
        max-width: min(390px, calc(100vw - 36px));
        width: min(390px, calc(100vw - 36px));
      }
      button {
        background: ${theme === "light" ? "#151a16" : "#f1c468"};
        border: 1px solid ${theme === "light" ? "#151a16" : "#f1c468"};
        border-radius: 10px;
        color: ${theme === "light" ? "#fffaf2" : "#111713"};
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 850;
        min-height: 32px;
        padding: 7px 10px;
        white-space: nowrap;
      }
      button:hover,
      button:focus-visible {
        filter: brightness(1.05);
        outline: none;
      }
      .record-action {
        border-radius: 999px;
        box-shadow: none;
        min-width: 96px;
        transition: filter 180ms ease, transform 180ms ease, box-shadow 180ms ease;
      }
      .record-action:hover,
      .record-action:focus-visible {
        transform: translateY(-1px);
      }
      .record-action.is-start {
        background: #d7ff67;
        border-color: rgba(215,255,103,.84);
        box-shadow: 0 0 0 5px rgba(215,255,103,.12);
        color: #111713;
      }
      .record-action.is-stop {
        background: #ff745f;
        border-color: rgba(255,116,95,.86);
        box-shadow: 0 0 0 5px rgba(255,116,95,.15);
        color: #160807;
      }
      .icon-close {
        align-self: start;
        background: ${theme === "light" ? "rgba(17,23,19,.08)" : "rgba(255,255,255,.08)"};
        border-color: ${theme === "light" ? "rgba(17,23,19,.12)" : "rgba(255,255,255,.13)"};
        border-radius: 999px;
        color: ${theme === "light" ? "#27312b" : "#fff9ec"};
        font-size: 16px;
        font-weight: 800;
        height: 26px;
        line-height: 1;
        min-height: 26px;
        padding: 0;
        width: 26px;
      }
      .status-copy {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .status-copy strong {
        color: ${theme === "light" ? "#111713" : "#fff9ec"};
        display: block;
        font-size: 12px;
        font-weight: 900;
        line-height: 1.2;
        max-width: 230px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .status-copy span {
        color: ${theme === "light" ? "#59655d" : "#b9c5bd"};
        display: block;
        font-size: 11px;
        line-height: 1.3;
        max-width: 230px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pulse-dot,
      .mini-dot {
        animation: designLensPulse 900ms ease-in-out infinite;
        background: ${theme === "light" ? "#d44f37" : "#f1c468"};
        border-radius: 999px;
        box-shadow: 0 0 0 6px ${theme === "light" ? "rgba(212,79,55,.12)" : "rgba(241,196,104,.14)"};
        height: 8px;
        margin-left: 2px;
        width: 8px;
      }
      .pulse-dot.is-error {
        background: #ff745f;
        box-shadow: 0 0 0 6px rgba(255,116,95,.16);
      }
      .pulse-dot.is-ready {
        background: #d7ff67;
        box-shadow: 0 0 0 6px rgba(215,255,103,.14);
      }
      .pulse-dot.is-recording {
        background: #ff745f;
        box-shadow: 0 0 0 6px rgba(255,116,95,.17);
      }
      .mini-dot.is-done {
        animation: none;
        background: #34d399;
        box-shadow: 0 0 0 6px rgba(52,211,153,.14);
      }
      .capture-card {
        display: grid;
        gap: 10px;
        min-width: 0;
      }
      .capture-head {
        align-items: start;
        display: grid;
        gap: 10px;
        grid-template-columns: auto minmax(0, 1fr) auto;
      }
      .capture-head strong {
        color: ${theme === "light" ? "#111713" : "#fff9ec"};
        display: block;
        font-size: 13px;
        font-weight: 950;
        line-height: 1.2;
        margin-bottom: 4px;
      }
      .capture-head span {
        color: ${theme === "light" ? "#59655d" : "#b9c5bd"};
        display: block;
        font-size: 11px;
        line-height: 1.42;
      }
      .capture-metrics,
      .capture-cues {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .capture-metrics span,
      .capture-cues span {
        border: 1px solid ${theme === "light" ? "rgba(17,23,19,.13)" : "rgba(255,249,236,.14)"};
        border-radius: 999px;
        color: ${theme === "light" ? "#26302a" : "#f4f1e9"};
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        max-width: 100%;
        overflow-wrap: anywhere;
        padding: 6px 8px;
      }
      .capture-cues span {
        background: ${theme === "light" ? "rgba(122,160,22,.11)" : "rgba(215,255,103,.1)"};
        border-color: ${theme === "light" ? "rgba(122,160,22,.22)" : "rgba(215,255,103,.22)"};
      }
      .scan-orbit {
        border: 2px solid ${theme === "light" ? "rgba(17,23,19,.12)" : "rgba(255,249,236,.16)"};
        border-left-color: #f1c468;
        border-radius: 999px;
        height: 18px;
        width: 18px;
        animation: designLensOrbit 720ms linear infinite;
      }
      @keyframes designLensPulse {
        0%, 100% { transform: scale(.86); opacity: .72; }
        50% { transform: scale(1.12); opacity: 1; }
      }
      @keyframes designLensOrbit {
        to { transform: rotate(360deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        .scan-orbit,
        .mini-dot,
        .pulse-dot {
          animation: none;
        }
        .panel {
          transition: none;
        }
      }
      @media (max-width: 520px) {
        .panel {
          grid-template-columns: auto minmax(120px, 1fr);
          width: min(360px, calc(100vw - 36px));
        }
        .panel:not(.is-capture) {
          border-radius: 14px;
        }
        button {
          grid-column: 1 / -1;
          width: 100%;
        }
      }
    </style>
    <section class="panel ${variant === "capture" ? "is-capture" : ""} ${variant === "recording" ? "is-recording-panel" : ""} ${variant === "recorder" ? "is-recorder-panel" : ""}" role="status" aria-label="Design Lens" aria-live="polite">
      ${content}
    </section>
  `;
}

export function buildIdleMarkup(locale: Locale) {
  const t = messages[locale];
  return `
    <div class="status-copy">
      <strong>${t.appName}</strong>
      <span>${locale === "zh" ? "请在插件面板中开始录制或选取组件。" : "Use the popup to record or pick a component."}</span>
    </div>
  `;
}

export function buildRecorderMarkup(locale: Locale, isRecording: boolean) {
  const t = messages[locale];
  return `
    <span class="pulse-dot ${isRecording ? "is-recording" : "is-ready"}"></span>
    <div class="status-copy">
      <strong>${isRecording ? t.recordingActive : t.recorderTitle}</strong>
      <span>${isRecording ? (locale === "zh" ? "浏览、悬停、滚动；完成后点结束。" : "Browse, hover, scroll; finish when ready.") : (locale === "zh" ? "点击开始后再记录页面状态。" : "Click start when you are ready to record states.")}</span>
    </div>
    ${isRecording ? `<button class="record-action is-stop" data-action="record-stop">${t.stopRecording}</button>` : `<button class="record-action is-start" data-action="record-start">${t.startRecording}</button>`}
  `;
}

export function buildLoadingMarkup(locale: Locale, action: "scan" | "pick", scanMode: "instant" | "recorded" = "instant") {
  const t = messages[locale];
  const isPick = action === "pick";
  return isPick
    ? `<span class="pulse-dot"></span><div class="status-copy"><strong>${t.runningPick}</strong><span>${locale === "zh" ? "左键选中组件范围，再确认采集。" : "Left-click a component scope, then confirm capture."}</span></div>`
    : `<span class="scan-orbit" aria-hidden="true"></span><div class="status-copy"><strong>${t.runningScan}</strong><span>${scanMode === "instant" ? t.exportHint : t.scanTiming}</span></div>`;
}

export function buildErrorMarkup(locale: Locale, error: string) {
  return `
    <span class="pulse-dot is-error"></span>
    <div class="status-copy">
      <strong>${locale === "zh" ? "采集失败" : "Capture failed"}</strong>
      <span>${escapeHtml(error)}</span>
    </div>
  `;
}

export function buildCaptureCardMarkup({ capture, locale }: CaptureMarkupOptions) {
  const localized = withLocalizedAnalysis(capture, locale);
  const patterns = localized.interactionTimeline?.patterns.slice(0, 3).map((pattern) => pattern.kind.replace(/-/g, " ")) ?? [];
  const structure = localized.layoutProfile.structure.slice(0, 3);
  const motion = localized.motion.slice(0, 2).map((item) => item.properties.join("+") || item.name).filter(Boolean);
  const cues = mergeStrings([...structure, ...patterns, ...motion]).slice(0, 5);
  const title = localized.scope === "component" ? (locale === "zh" ? "组件已采集" : "Component captured") : (locale === "zh" ? "页面已采集" : "Page captured");
  const description = summarizeCapture(localized, locale);

  return `
    <div class="capture-card">
      <div class="capture-head">
        <span class="mini-dot is-done"></span>
        <div>
          <strong>${title}</strong>
          <span>${escapeHtml(description)}</span>
        </div>
        <button class="icon-close" type="button" data-action="close" aria-label="${locale === "zh" ? "关闭" : "Close"}">×</button>
      </div>
      <div class="capture-metrics" aria-label="${locale === "zh" ? "采集指标" : "Capture metrics"}">
        <span>${localized.components.length} ${locale === "zh" ? "组件" : "components"}</span>
        <span>${localized.motion.length} ${locale === "zh" ? "动效" : "motions"}</span>
        <span>${localized.interactions.length} ${locale === "zh" ? "交互" : "interactions"}</span>
      </div>
      <div class="capture-cues">
        ${cues.length ? cues.map((cue) => `<span>${escapeHtml(cue)}</span>`).join("") : `<span>${locale === "zh" ? "继续录制可获得更多状态" : "Record more states for richer evidence"}</span>`}
      </div>
    </div>
  `;
}

function summarizeCapture(capture: DesignCapture, locale: Locale) {
  const hasTimeline = Boolean(capture.interactionTimeline?.patterns.length);
  const mainStructure = capture.layoutProfile.structure[0] ?? capture.layoutProfile.cadence[0] ?? "";
  const motion = capture.motion[0]?.properties.join("+") || capture.motion[0]?.name || "";
  const interaction = capture.interactions[0]?.trigger ?? "";

  if (locale === "zh") {
    const parts = [
      mainStructure ? `结构偏 ${mainStructure}` : "",
      motion ? `动效关注 ${motion}` : "",
      interaction ? `交互含 ${interaction}` : "",
      hasTimeline ? "已包含时间线证据" : ""
    ].filter(Boolean);
    return parts.join("；") || "已提取该范围内的布局、样式和可见交互线索。";
  }

  const parts = [
    mainStructure ? `Structure: ${mainStructure}` : "",
    motion ? `Motion: ${motion}` : "",
    interaction ? `Interaction: ${interaction}` : "",
    hasTimeline ? "timeline evidence included" : ""
  ].filter(Boolean);
  return parts.join("; ") || "Layout, style, and visible interaction cues were extracted for this scope.";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return replacements[char] ?? char;
  });
}

function mergeStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, 8);
}
