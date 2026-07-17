import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Crosshair, Languages, MoonStar, PanelRightOpen, RefreshCw, ScanSearch, ShieldCheck, SunMedium, X } from "lucide-react";
import { buildAiAnalysisPayload, buildAiPrompt } from "../../src/ai/context";
import { generateAiDesignAnalysis } from "../../src/ai/openai";
import { withLocalizedAnalysis } from "../../src/analyzer/core/analysis";
import { createDefaultAiSettingsState, getActiveAiProfile, getAiSettingsState, type AiSettingsState } from "../../src/shared/ai-settings";
import { DEFAULT_DESIGN_BRIEF, getStoredDesignBrief, normalizeDesignBrief, setStoredDesignBrief, type CaptureMode, type DesignBrief } from "../../src/shared/design-brief";
import { DEFAULT_LOCALE, messages, type Locale } from "../../src/shared/i18n";
import { getStoredLocale, setStoredLocale } from "../../src/shared/locale-storage";
import type { CaptureResponse } from "../../src/shared/messages";
import { ensureDesignLensPageBridge } from "../../src/shared/page-bridge";
import type { DesignCapture } from "../../src/shared/schema";
import type { SmartCapturePhase } from "../../src/smart-capture/types";
import { SIDE_PANEL_VIEW_KEY, type SidePanelView } from "../../src/shared/side-panel";
import { getStoredTheme, resolveSystemTheme, setStoredTheme, type ThemeMode } from "../../src/shared/theme-storage";
import { createZipBlob } from "../../src/shared/zip";
import { buildAiPromptPackFiles, buildEvidenceOnlyPackFiles, buildFailedAiBrief, buildPackFilename, buildRebuildDraftPackFiles, loadRebuildArtifactFiles } from "./pack-builder";
import { captureHost, downloadBlob, hasSignals } from "./popup-utils";
import { CaptureModeSelector } from "./CaptureModeSelector";
import { ResultPanel } from "./ResultPanel";
import { BusyOverlay, EmptyState } from "./StatusPanels";
import type { PackDownload, Status } from "./types";
import "./style.css";

function Popup() {
  const manifest = browser.runtime.getManifest?.();
  const isCollectorBuild = manifest?.permissions?.includes("debugger") ?? false;
  const [status, setStatus] = useState<Status>("idle");
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [theme, setTheme] = useState<ThemeMode>(resolveSystemTheme());
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [aiSettingsState, setLocalAiSettingsState] = useState<AiSettingsState>(createDefaultAiSettingsState());
  const [designBrief, setDesignBrief] = useState<DesignBrief>(DEFAULT_DESIGN_BRIEF);
  const [capture, setCapture] = useState<DesignCapture | null>(null);
  const [lastPack, setLastPack] = useState<PackDownload | null>(null);
  const [pendingRebuildAction, setPendingRebuildAction] = useState<"smart" | "manual" | "pick" | null>(null);
  const [message, setMessage] = useState(messages[DEFAULT_LOCALE].openHint);
  const t = messages[locale];

  const localizedCapture = useMemo(() => (capture ? withLocalizedAnalysis(capture, locale) : null), [capture, locale]);
  const themeLabel = useMemo(() => (theme === "light" ? t.darkTheme : t.lightTheme), [theme, t.darkTheme, t.lightTheme]);
  const activeAiProfile = useMemo(() => getActiveAiProfile(aiSettingsState), [aiSettingsState]);
  const isBusy = status === "loading" || status === "generating";
  const hasAiKey = Boolean(activeAiProfile.apiKey.trim());

  useEffect(() => {
    getStoredLocale().then((storedLocale) => {
      setLocale(storedLocale);
      setMessage(messages[storedLocale].openHint);
      void refreshRecordingStatus(storedLocale);
    });
    getStoredTheme().then(setTheme);
    getAiSettingsState().then(setLocalAiSettingsState);
    getStoredDesignBrief().then(setDesignBrief);

    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => getStoredTheme().then(setTheme);
    systemThemeQuery.addEventListener("change", onChange);
    return () => systemThemeQuery.removeEventListener("change", onChange);
  }, []);

  async function changeLocale(nextLocale: Locale) {
    if (isBusy) return;
    setLocale(nextLocale);
    setMessage(status === "recording" ? messages[nextLocale].recordingActive : messages[nextLocale].openHint);
    setLanguageMenuOpen(false);
    await setStoredLocale(nextLocale);
    await syncActiveTab({ type: "DESIGN_LENS_SET_LOCALE", locale: nextLocale });
  }

  async function toggleTheme() {
    if (isBusy) return;
    const nextTheme: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    await setStoredTheme(nextTheme);
    await syncActiveTab({ type: "DESIGN_LENS_SET_THEME", theme: nextTheme });
  }

  async function changeCaptureMode(mode: CaptureMode) {
    if (isBusy || status === "recording" || mode === designBrief.mode) return;
    const nextBrief = normalizeDesignBrief({ ...designBrief, mode });
    setDesignBrief(nextBrief);
    setLastPack(null);
    setPendingRebuildAction(null);
    await setStoredDesignBrief(nextBrief);
    setMessage(locale === "zh"
      ? mode === "reference" ? "已切换为设计参照模式。" : "已切换为高保真重建模式；当前采集将先生成重建草稿。"
      : mode === "reference" ? "Switched to Reference mode." : "Switched to Rebuild mode. Current capture will produce a rebuild draft.");
  }

  async function toggleSmartCapture(captureBrief = designBrief) {
    if (isBusy) return;
    setStatus("loading");
    setMessage(status === "recording" ? (locale === "zh" ? "正在停止并整理已采集证据..." : "Stopping and preserving captured evidence...") : t.opening);
    try {
      const tabId = await ensureContentScript();
      if (!tabId) throw new Error(t.normalPageOnly);
      const response = await browser.tabs.sendMessage(tabId, status === "recording"
        ? { type: "DESIGN_LENS_RECORD_STOP", locale }
        : { type: "DESIGN_LENS_SMART_CAPTURE_START", locale, mode: captureBrief.mode, rebuild: captureBrief.mode === "rebuild" ? captureBrief.rebuild : undefined }) as CaptureResponse;
      if (!response.ok) throw new Error(response.error);
      setStatus(response.isRecording ? "recording" : "idle");
      setMessage(response.isRecording
        ? formatSmartCapturePhase(response.smartCapture?.phase ?? "preflight", locale)
        : (locale === "zh" ? "捕获已停止，停止前的有效证据已保留。" : "Capture stopped. Evidence collected before stopping was preserved."));
      if (hasSignals(response.capture)) {
        setCapture(response.capture);
        setLastPack(null);
        if (!response.isRecording) setStatus("ready");
      }
      if (response.isRecording) window.close();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function openManualRecorder(captureBrief = designBrief) {
    if (isBusy) return;
    setStatus("loading");
    setMessage(locale === "zh" ? "正在打开补充覆盖控制器..." : "Opening guided coverage controls...");
    try {
      const tabId = await ensureContentScript();
      if (!tabId) throw new Error(t.normalPageOnly);
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_OPEN_RECORDER", locale, mode: captureBrief.mode, rebuild: captureBrief.mode === "rebuild" ? captureBrief.rebuild : undefined }) as CaptureResponse;
      if (!response.ok) throw new Error(response.error);
      setStatus("idle");
      setMessage(locale === "zh" ? "补充覆盖控制已放到页面左下角。" : "Guided coverage controls are on the lower-left of the page.");
      window.close();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function requestSmartCapture() {
    if (status === "recording") {
      void toggleSmartCapture();
      return;
    }
    if (designBrief.mode === "rebuild" && !designBrief.rebuild.authorizationConfirmed) {
      setPendingRebuildAction("smart");
      return;
    }
    void toggleSmartCapture();
  }

  function requestManualRecording() {
    if (designBrief.mode === "rebuild" && !designBrief.rebuild.authorizationConfirmed) {
      setPendingRebuildAction("manual");
      return;
    }
    void openManualRecorder();
  }

  function requestSectionPick() {
    if (designBrief.mode === "rebuild" && !designBrief.rebuild.authorizationConfirmed) {
      setPendingRebuildAction("pick");
      return;
    }
    void pickSection();
  }

  async function confirmRebuildAuthorization() {
    if (!pendingRebuildAction || isBusy) return;
    const action = pendingRebuildAction;
    const nextBrief = normalizeDesignBrief({
      ...designBrief,
      mode: "rebuild",
      rebuild: { ...designBrief.rebuild, authorizationConfirmed: true }
    });
    setDesignBrief(nextBrief);
    setPendingRebuildAction(null);
    await setStoredDesignBrief(nextBrief);
    if (action === "smart") await toggleSmartCapture(nextBrief);
    else if (action === "manual") await openManualRecorder(nextBrief);
    else await pickSection();
  }

  async function pickSection() {
    if (isBusy) return;
    setStatus("loading");
    setMessage(t.picking);
    try {
      const tabId = await ensureContentScript();
      if (!tabId) throw new Error(t.normalPageOnly);
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_OPEN_AND_PICK", locale }) as CaptureResponse;
      if (!response.ok) throw new Error(response.error);
      setCapture(response.capture);
      setLastPack(null);
      setStatus("ready");
      setMessage(t.opened);
      window.close();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshRecordingStatus(nextLocale = locale) {
    try {
      const tabId = await ensureContentScript(false);
      if (!tabId) return;
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_RECORD_STATUS", locale: nextLocale }) as CaptureResponse;
      if (response.ok && response.isRecording) {
        setStatus("recording");
        setMessage(response.smartCapture ? formatSmartCapturePhase(response.smartCapture.phase, nextLocale) : messages[nextLocale].recordingActive);
      }
      if (response.ok && hasSignals(response.capture)) {
        setCapture(response.capture);
        setLastPack(null);
        if (!response.isRecording) {
          setStatus("ready");
          setMessage(response.capture.smartCapture
            ? nextLocale === "zh" ? "智能捕获已完成，结果可以导出。" : "Smart Capture is complete and ready to export."
            : messages[nextLocale].opened);
        }
      }
    } catch {
      // No content script yet on this page; idle is fine.
    }
  }

  function openPackFlow() {
    if (!localizedCapture || isBusy) return;
    if (designBrief.mode === "rebuild" && !designBrief.rebuild.authorizationConfirmed) {
      void openWorkspace("settings");
      return;
    }
    if (designBrief.mode === "reference" && !hasAiKey) {
      void openWorkspace("settings");
      setMessage(locale === "zh" ? "需要先配置 AI API Key 才能生成 Prompt；也可以先导出不含 Prompt 的基础资料包。" : "Configure an AI API key to generate a prompt, or export the evidence-only pack.");
      return;
    }
    void submitBrief(localizedCapture, designBrief);
  }

  async function openWorkspace(view: SidePanelView = "overview") {
    try {
      const tab = await resolvePopupTargetTab();
      if (!tab?.id) throw new Error(locale === "zh" ? "当前标签页不可用。" : "The current tab is unavailable.");
      await browser.storage.local.set({ [SIDE_PANEL_VIEW_KEY]: view });
      await browser.sidePanel.open({ tabId: tab.id });
      window.close();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function exportEvidenceOnlyPack() {
    if (!localizedCapture || isBusy || designBrief.mode !== "reference") return;
    const files = buildEvidenceOnlyPackFiles(localizedCapture, designBrief, locale);
    const blob = createZipBlob(files);
    const name = buildPackFilename(localizedCapture, "evidence-only");
    setLastPack({ name, blob, kind: "evidence-only" });
    downloadBlob(name, blob);
    setStatus("ready");
    setMessage(locale === "zh" ? "已下载基础资料包：包含 Token、Skill 和证据，不包含 AI Prompt。" : "Evidence-only pack downloaded with tokens, Skill, and evidence. No AI prompt included.");
  }

  async function generateAiPack(localized: DesignCapture, brief: DesignBrief) {
    const normalizedBrief = normalizeDesignBrief({ ...brief, mode: "reference" });
    setStatus("generating");
    setMessage(locale === "zh" ? "正在压缩证据、调用 AI 并生成可交付资料包..." : "Compressing evidence, calling AI, and building the delivery pack...");
    setDesignBrief(normalizedBrief);
    await setStoredDesignBrief(normalizedBrief);
    setLanguageMenuOpen(false);
    const payload = buildAiAnalysisPayload(localized, locale);
    const prompt = buildAiPrompt(payload, normalizedBrief);
    const settings = activeAiProfile;

    try {
      if (!settings.apiKey.trim()) {
        setStatus("ready");
        void openWorkspace("settings");
        setMessage(locale === "zh" ? "需要先配置 AI API Key 才能生成 Prompt；也可以先导出基础资料包。" : "Configure an AI API key to generate a prompt. You can still export the evidence-only pack.");
        return;
      }
      const aiBrief = await generateAiDesignAnalysis(localized, { apiKey: settings.apiKey.trim(), model: settings.model, baseUrl: settings.baseUrl, endpoint: settings.endpoint, locale, brief: normalizedBrief });
      const files = buildAiPromptPackFiles(localized, normalizedBrief, locale, prompt, aiBrief || prompt, "generated");
      const blob = createZipBlob(files);
      const name = buildPackFilename(localized, "ai-prompt");
      setLastPack({ name, blob, kind: "ai-prompt" });
      downloadBlob(name, blob);
      setStatus("ready");
      setMessage(locale === "zh" ? "AI Prompt、Skill、Token 和证据资料包已打包下载。" : "AI prompt, Skill, tokens, and evidence pack downloaded.");
    } catch (error) {
      try {
        const fallbackBrief = buildFailedAiBrief(prompt, settings.name, locale, error instanceof Error ? error.message : String(error));
        const files = buildAiPromptPackFiles(localized, normalizedBrief, locale, prompt, fallbackBrief, "failed");
        const blob = createZipBlob(files);
        const name = buildPackFilename(localized, "ai-prompt");
        setLastPack({ name, blob, kind: "ai-prompt" });
        downloadBlob(name, blob);
        setStatus("ready");
        setMessage(locale === "zh" ? "AI 请求失败，但已打包 Prompt、Skill、Token 和证据，方便你换模型继续。" : "AI request failed, but the prompt, Skill, tokens, and evidence were packaged for another model.");
      } catch (packError) {
        setStatus("error");
        setMessage(packError instanceof Error ? packError.message : String(packError));
      }
    }
  }

  async function exportRebuildDraft(localized: DesignCapture, brief: DesignBrief) {
    if (isBusy) return;
    const normalizedBrief = normalizeDesignBrief({ ...brief, mode: "rebuild" });
    setStatus("generating");
    setMessage(locale === "zh" ? "正在整理完整捕获、场景计划和验收规则..." : "Preparing the complete capture, scene plan, and acceptance rules...");
    try {
      const artifactFiles = await loadRebuildArtifactFiles(localized, locale);
      const files = buildRebuildDraftPackFiles(localized, normalizedBrief, locale, artifactFiles);
      const blob = createZipBlob(files);
      const name = buildPackFilename(localized, "rebuild-draft");
      setDesignBrief(normalizedBrief);
      await setStoredDesignBrief(normalizedBrief);
      setLastPack({ name, blob, kind: "rebuild-draft" });
      downloadBlob(name, blob);
      setStatus("ready");
      setMessage(locale === "zh" ? "重建草稿已下载；当前视口截图和脱敏事件已打包，其余缺口已写入场景计划。" : "Rebuild draft downloaded with current-viewport screenshots and masked events; remaining gaps are recorded in the scene plan.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function submitBrief(localized: DesignCapture, brief: DesignBrief) {
    return brief.mode === "rebuild" ? exportRebuildDraft(localized, brief) : generateAiPack(localized, brief);
  }

  function downloadLastPack() {
    if (!lastPack || isBusy) return;
    downloadBlob(lastPack.name, lastPack.blob);
    setMessage(locale === "zh" ? "资料包已重新下载。" : "Reference pack downloaded again.");
  }

  return (
    <main className={theme === "dark" ? "theme-dark" : "theme-light"}>
      <header className="hero">
        <div className="mark">D</div>
        <div className="heading">
          <span>{t.eyebrow}</span>
          <h1>{isCollectorBuild ? manifest?.name ?? "Design Lens Collector" : t.appName}</h1>
          <p>{capture ? captureHost(capture.page.url) : t.tagline}</p>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label={t.language} aria-expanded={languageMenuOpen} aria-haspopup="menu" onClick={() => setLanguageMenuOpen((isOpen) => !isOpen)} disabled={isBusy}>
            <Languages aria-hidden="true" />
          </button>
          {languageMenuOpen ? (
            <div className="language-menu" role="menu" aria-label={t.language}>
              <button className={locale === "zh" ? "language-option active" : "language-option"} type="button" role="menuitemradio" aria-checked={locale === "zh"} onClick={() => changeLocale("zh")}>
                <span>{t.chinese}</span>
                {locale === "zh" ? <Check aria-hidden="true" /> : null}
              </button>
              <button className={locale === "en" ? "language-option active" : "language-option"} type="button" role="menuitemradio" aria-checked={locale === "en"} onClick={() => changeLocale("en")}>
                <span>{t.english}</span>
                {locale === "en" ? <Check aria-hidden="true" /> : null}
              </button>
            </div>
          ) : null}
          <button className="icon-button theme-toggle" type="button" aria-label={themeLabel} onClick={() => toggleTheme()} disabled={isBusy}>
            {theme === "light" ? <MoonStar aria-hidden="true" /> : <SunMedium aria-hidden="true" />}
          </button>
          <button className="icon-button" type="button" aria-label={locale === "zh" ? "打开工作区" : "Open workspace"} title={locale === "zh" ? "打开工作区" : "Open workspace"} onClick={() => void openWorkspace()} disabled={isBusy}>
            <PanelRightOpen aria-hidden="true" />
          </button>
        </div>
      </header>

      <CaptureModeSelector mode={designBrief.mode} locale={locale} disabled={isBusy || status === "recording"} onChange={(mode) => void changeCaptureMode(mode)} />

      <section className="command-surface">
        <button className={status === "recording" ? "primary-action recording" : "primary-action"} onClick={requestSmartCapture} disabled={isBusy}>
          {status === "loading" ? <RefreshCw aria-hidden="true" /> : <ScanSearch aria-hidden="true" />}
          <span>{status === "recording" ? (locale === "zh" ? "停止捕获" : "Stop capture") : designBrief.mode === "rebuild" ? (locale === "zh" ? isCollectorBuild ? "深度捕获" : "智能重建" : isCollectorBuild ? "Deep capture" : "Smart rebuild") : t.primaryAction}</span>
        </button>
        <button className="secondary-action" onClick={requestSectionPick} disabled={isBusy || status === "recording"}>
          <Crosshair aria-hidden="true" />
          <span>{locale === "zh" ? "选取组件" : "Pick component"}</span>
        </button>
      </section>

      {pendingRebuildAction ? (
        <section className="authorization-prompt" role="dialog" aria-labelledby="authorization-title">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong id="authorization-title">{locale === "zh" ? "确认采集权限" : "Confirm capture permission"}</strong>
            <p>{locale === "zh" ? "仅在你有权重建此页面并采集页面证据时继续。敏感输入会被脱敏，Canvas 默认不采集。" : "Continue only if you may rebuild this page and capture its evidence. Sensitive inputs are masked and Canvas capture stays off by default."}</p>
          </div>
          <button className="authorization-dismiss" type="button" aria-label={locale === "zh" ? "取消" : "Cancel"} onClick={() => setPendingRebuildAction(null)}>
            <X aria-hidden="true" />
          </button>
          <button className="authorization-confirm" type="button" onClick={() => void confirmRebuildAuthorization()}>
            <ShieldCheck aria-hidden="true" />
            <span>{locale === "zh" ? "确认并继续" : "Confirm and continue"}</span>
          </button>
        </section>
      ) : null}

      <div className={status === "error" ? "status error" : status === "recording" ? "status live" : "status"} aria-live="polite">{message}</div>

      {localizedCapture ? (
        <ResultPanel
          capture={localizedCapture}
          locale={locale}
          isBusy={isBusy}
          hasAiKey={hasAiKey}
          brief={designBrief}
          lastPackKind={lastPack?.kind ?? null}
          onGenerate={openPackFlow}
          onExportEvidence={exportEvidenceOnlyPack}
          onDownloadPack={downloadLastPack}
          onImproveCoverage={requestManualRecording}
          onOpenWorkspace={() => void openWorkspace()}
        />
      ) : <EmptyState locale={locale} mode={designBrief.mode} />}

      {status === "generating" ? <BusyOverlay locale={locale} mode={designBrief.mode} /> : null}
    </main>
  );
}

async function ensureContentScript(shouldInject = true) {
  const tab = await resolvePopupTargetTab();
  if (!tab?.id || !isInjectableUrl(tab.url)) {
    if (shouldInject) throw new Error(messages[DEFAULT_LOCALE].normalPageOnly);
    return null;
  }

  if (!shouldInject) return tab.id;

  await ensureDesignLensPageBridge(tab.id, await getStoredLocale());

  return tab.id;
}

async function resolvePopupTargetTab() {
  const value = new URLSearchParams(window.location.search).get("targetTabId");
  const targetTabId = value && /^\d+$/.test(value) ? Number(value) : undefined;
  if (targetTabId !== undefined) {
    const target = await browser.tabs.get(targetTabId).catch(() => undefined);
    if (target) return target;
  }
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  return activeTab;
}

async function syncActiveTab(message: unknown) {
  const tabId = await ensureContentScript(false);
  if (!tabId) return;
  await browser.tabs.sendMessage(tabId, message).catch(() => undefined);
}

function isInjectableUrl(url?: string) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

function formatSmartCapturePhase(phase: SmartCapturePhase, locale: Locale) {
  const labels: Record<SmartCapturePhase, [string, string]> = {
    idle: ["准备智能捕获...", "Preparing Smart Capture..."],
    preflight: ["正在检查页面规模与能力...", "Checking page size and capabilities..."],
    stabilizing: ["正在等待页面进入稳定窗口...", "Waiting for a stable page window..."],
    snapshot: ["正在捕获结构与视觉基线...", "Capturing structure and visual baselines..."],
    observing: ["正在被动观察动画与页面变化...", "Passively observing motion and page changes..."],
    finalizing: ["正在整理证据与补充任务...", "Finalizing evidence and coverage tasks..."],
    complete: ["智能捕获已完成。", "Smart Capture complete."],
    degraded: ["已降级完成，未覆盖内容会明确列出。", "Completed with limits; uncovered evidence is listed."],
    cancelled: ["捕获已停止，已有证据已保留。", "Capture stopped; existing evidence was preserved."],
    error: ["智能捕获失败。", "Smart Capture failed."]
  };
  return labels[phase][locale === "zh" ? 0 : 1];
}

createRoot(document.getElementById("root")!).render(<Popup />);
