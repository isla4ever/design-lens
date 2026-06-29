import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Crosshair, KeyRound, Languages, MoonStar, RefreshCw, ScanSearch, SunMedium } from "lucide-react";
import { buildAiAnalysisPayload, buildAiPrompt } from "../../src/ai/context";
import { generateAiDesignAnalysis } from "../../src/ai/openai";
import { withLocalizedAnalysis } from "../../src/analyzer/core/analysis";
import { createDefaultAiSettingsState, getActiveAiProfile, getAiSettingsState, setAiSettingsState, upsertAiProfile, type AiProviderProfile, type AiSettingsState } from "../../src/shared/ai-settings";
import { DEFAULT_DESIGN_BRIEF, getStoredDesignBrief, setStoredDesignBrief, type DesignBrief } from "../../src/shared/design-brief";
import { DEFAULT_LOCALE, messages, type Locale } from "../../src/shared/i18n";
import { getStoredLocale, setStoredLocale } from "../../src/shared/locale-storage";
import type { CaptureResponse } from "../../src/shared/messages";
import type { DesignCapture } from "../../src/shared/schema";
import { getStoredTheme, resolveSystemTheme, setStoredTheme, type ThemeMode } from "../../src/shared/theme-storage";
import { createZipBlob } from "../../src/shared/zip";
import { AiSettingsMenu } from "./AiSettingsMenu";
import { buildAiPromptPackFiles, buildEvidenceOnlyPackFiles, buildFailedAiBrief, buildPackFilename } from "./pack-builder";
import { captureHost, downloadBlob, hasSignals } from "./popup-utils";
import { ResultPanel } from "./ResultPanel";
import { BusyOverlay, EmptyState } from "./StatusPanels";
import type { PackDownload, Status } from "./types";
import "./style.css";

function Popup() {
  const [status, setStatus] = useState<Status>("idle");
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [theme, setTheme] = useState<ThemeMode>(resolveSystemTheme());
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiSettingsState, setLocalAiSettingsState] = useState<AiSettingsState>(createDefaultAiSettingsState());
  const [designBrief, setDesignBrief] = useState<DesignBrief>(DEFAULT_DESIGN_BRIEF);
  const [capture, setCapture] = useState<DesignCapture | null>(null);
  const [lastPack, setLastPack] = useState<PackDownload | null>(null);
  const [message, setMessage] = useState(messages[DEFAULT_LOCALE].openHint);
  const t = messages[locale];

  const localizedCapture = useMemo(() => (capture ? withLocalizedAnalysis(capture, locale) : null), [capture, locale]);
  const themeLabel = useMemo(() => (theme === "light" ? t.lightTheme : t.darkTheme), [theme, t.darkTheme, t.lightTheme]);
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

  async function saveAiProfile(profile: AiProviderProfile) {
    if (isBusy) return;
    const nextState = upsertAiProfile(aiSettingsState, {
      ...profile,
      updatedAt: new Date().toISOString()
    });
    setLocalAiSettingsState(nextState);
    await setAiSettingsState(nextState);
    setAiMenuOpen(false);
    setMessage(locale === "zh" ? "AI 配置已保存到本地。" : "AI settings saved locally.");
  }

  async function clearSavedAi(profileId: string) {
    if (isBusy) return;
    const fallback = createDefaultAiSettingsState();
    const profiles = { ...aiSettingsState.profiles };
    delete profiles[profileId];
    if (!Object.keys(profiles).length) {
      const profile = getActiveAiProfile(fallback);
      profiles[profile.id] = profile;
    }
    const activeProfileId = aiSettingsState.activeProfileId === profileId ? Object.keys(profiles)[0] ?? fallback.activeProfileId : aiSettingsState.activeProfileId;
    const nextState = { activeProfileId, profiles };
    setLocalAiSettingsState(nextState);
    await setAiSettingsState(nextState);
    setMessage(locale === "zh" ? "已清除当前 AI 配置。" : "Current AI settings cleared.");
  }

  async function toggleRecording() {
    if (isBusy) return;
    setStatus("loading");
    setMessage(t.opening);
    try {
      const tabId = await ensureContentScript();
      if (!tabId) throw new Error(t.normalPageOnly);
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_OPEN_RECORDER", locale }) as CaptureResponse;
      if (!response.ok) throw new Error(response.error);
      setStatus(response.isRecording ? "recording" : "idle");
      setMessage(response.isRecording ? t.recordingActive : (locale === "zh" ? "录制控制已放到页面左下角。" : "Recording controls are on the lower-left of the page."));
      if (hasSignals(response.capture)) {
        setCapture(response.capture);
        setLastPack(null);
      }
      window.close();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
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
        setMessage(messages[nextLocale].recordingActive);
      }
      if (response.ok && hasSignals(response.capture)) {
        setCapture(response.capture);
        setLastPack(null);
      }
    } catch {
      // No content script yet on this page; idle is fine.
    }
  }

  function openAiFlow() {
    if (!capture || isBusy) return;
    if (!hasAiKey) {
      setAiMenuOpen(true);
      setMessage(locale === "zh" ? "需要先配置 AI API Key 才能生成 Prompt；也可以先导出不含 Prompt 的基础资料包。" : "Configure an AI API key to generate a prompt, or export the evidence-only pack.");
    }
  }

  function exportEvidenceOnlyPack() {
    if (!localizedCapture || isBusy) return;
    const files = buildEvidenceOnlyPackFiles(localizedCapture, designBrief, locale);
    const blob = createZipBlob(files);
    const name = buildPackFilename(localizedCapture, "evidence-only");
    setLastPack({ name, blob, kind: "evidence-only" });
    downloadBlob(name, blob);
    setStatus("ready");
    setMessage(locale === "zh" ? "已下载基础资料包：包含 Token、Skill 和证据，不包含 AI Prompt。" : "Evidence-only pack downloaded with tokens, Skill, and evidence. No AI prompt included.");
  }

  async function generateAiPack(localized: DesignCapture, brief: DesignBrief) {
    const normalizedBrief = { ...brief };
    setStatus("generating");
    setMessage(locale === "zh" ? "正在压缩证据、调用 AI 并生成可交付资料包..." : "Compressing evidence, calling AI, and building the delivery pack...");
    setDesignBrief(normalizedBrief);
    await setStoredDesignBrief(normalizedBrief);
    setLanguageMenuOpen(false);
    setAiMenuOpen(false);
    const payload = buildAiAnalysisPayload(localized, locale);
    const prompt = buildAiPrompt(payload, normalizedBrief);
    const settings = activeAiProfile;

    try {
      if (!settings.apiKey.trim()) {
        setStatus("ready");
        setAiMenuOpen(true);
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
          <h1>{t.appName}</h1>
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
            {theme === "light" ? <SunMedium aria-hidden="true" /> : <MoonStar aria-hidden="true" />}
          </button>
          <button className="icon-button" type="button" aria-label={locale === "zh" ? "AI 配置" : "AI settings"} aria-expanded={aiMenuOpen} onClick={() => setAiMenuOpen((isOpen) => !isOpen)} disabled={isBusy}>
            <KeyRound aria-hidden="true" />
          </button>
        </div>
      </header>

      {aiMenuOpen ? (
        <section className="settings-inline">
          <AiSettingsMenu locale={locale} state={aiSettingsState} onSave={saveAiProfile} onClear={clearSavedAi} />
        </section>
      ) : null}

      <section className="command-surface">
        <button className={status === "recording" ? "primary-action recording" : "primary-action"} onClick={() => toggleRecording()} disabled={isBusy}>
          {status === "loading" ? <RefreshCw aria-hidden="true" /> : <ScanSearch aria-hidden="true" />}
          {status === "recording" ? t.stopRecording : t.primaryAction}
        </button>
        <button className="secondary-action" onClick={() => pickSection()} disabled={isBusy || status === "recording"}>
          <Crosshair aria-hidden="true" />
          {t.secondaryAction}
        </button>
      </section>

      <div className={status === "error" ? "status error" : status === "recording" ? "status live" : "status"} aria-live="polite">{message}</div>

      {localizedCapture ? (
        <ResultPanel
          capture={localizedCapture}
          locale={locale}
          isBusy={isBusy}
          hasAiKey={hasAiKey}
          aiProfile={activeAiProfile}
          brief={designBrief}
          lastPackKind={lastPack?.kind ?? null}
          onGenerate={openAiFlow}
          onSubmitBrief={(brief) => generateAiPack(localizedCapture, brief)}
          onExportEvidence={exportEvidenceOnlyPack}
          onDownloadPack={downloadLastPack}
        />
      ) : <EmptyState locale={locale} />}

      {status === "generating" ? <BusyOverlay locale={locale} /> : null}
    </main>
  );
}

async function ensureContentScript(shouldInject = true) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isInjectableUrl(tab.url)) {
    if (shouldInject) throw new Error(messages[DEFAULT_LOCALE].normalPageOnly);
    return null;
  }

  if (!shouldInject) return tab.id;

  try {
    await browser.tabs.sendMessage(tab.id, { type: "DESIGN_LENS_SET_LOCALE", locale: await getStoredLocale() });
  } catch {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/content-scripts/content.js"]
    });
  }

  return tab.id;
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

createRoot(document.getElementById("root")!).render(<Popup />);
