import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppWindow, Clock3, Languages, LayoutDashboard, ListChecks, MoonStar, RefreshCw, Settings2, SunMedium, X } from "lucide-react";
import { buildAiAnalysisPayload, buildAiPrompt } from "../../src/ai/context";
import { generateAiDesignAnalysis } from "../../src/ai/openai";
import { withLocalizedAnalysis } from "../../src/analyzer/core/analysis";
import { addCaptureToRouteProject, getStoredRebuildRouteProject, removeRouteFromProject, setStoredRebuildRouteProject, type RebuildRouteProject } from "../../src/capture-v2/core/rebuild-route-project";
import { compileImportedRecorderFlow, MAX_RECORDER_FLOW_BYTES } from "../../src/capture-v2/core/imported-recorder-flow";
import { createDefaultAiSettingsState, getActiveAiProfile, getAiSettingsState, setAiSettingsState, upsertAiProfile, type AiProviderProfile, type AiSettingsState } from "../../src/shared/ai-settings";
import { DEFAULT_DESIGN_BRIEF, getStoredDesignBrief, normalizeDesignBrief, setStoredDesignBrief, type DesignBrief } from "../../src/shared/design-brief";
import { DEFAULT_LOCALE, type Locale } from "../../src/shared/i18n";
import { getStoredLocale, setStoredLocale } from "../../src/shared/locale-storage";
import type { CaptureResponse, GuidedCaptureTask, WorkspaceResponse } from "../../src/shared/messages";
import { openCompactActionPopup } from "../../src/shared/compact-popup";
import { ensureDesignLensPageBridge } from "../../src/shared/page-bridge";
import type { DesignCapture } from "../../src/shared/schema";
import { SIDE_PANEL_VIEW_KEY, type SidePanelView } from "../../src/shared/side-panel";
import { isSmartCaptureProgressNotice } from "../../src/shared/workspace-notice";
import { mergeSupplementalTasks, planRecorderSupplementalTasks } from "../../src/smart-capture/recorder-gap-planner";
import type { SmartCaptureTask } from "../../src/smart-capture/types";
import { getStoredTheme, resolveSystemTheme, setStoredTheme, type ThemeMode } from "../../src/shared/theme-storage";
import { createZipBlob } from "../../src/shared/zip";
import type { WorkspaceCaptureRecord } from "../../src/storage/capture-project-store";
import { buildAiPromptPackFiles, buildEvidenceOnlyPackFiles, buildFailedAiBrief, buildMultiRoutePackFilename, buildMultiRouteRebuildDraftPackFiles, buildPackFilename, buildRebuildDraftPackFiles, loadMultiRouteRebuildArtifactFiles, loadRebuildArtifactFiles } from "../popup/pack-builder";
import { captureHost, downloadBlob, hasSignals } from "../popup/popup-utils";
import { WorkspaceCoverage } from "./WorkspaceCoverage";
import { WorkspaceHistory } from "./WorkspaceHistory";
import { WorkspaceOverview } from "./WorkspaceOverview";
import { WorkspaceSettings } from "./WorkspaceSettings";
import "./style.css";

function SidePanel() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [theme, setTheme] = useState<ThemeMode>(resolveSystemTheme());
  const [activeView, setActiveView] = useState<SidePanelView>("overview");
  const [records, setRecords] = useState<WorkspaceCaptureRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [brief, setBrief] = useState<DesignBrief>(DEFAULT_DESIGN_BRIEF);
  const [aiSettings, setAiSettings] = useState<AiSettingsState>(createDefaultAiSettingsState());
  const [routeProject, setRouteProject] = useState<RebuildRouteProject | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedRecord = useMemo(() => records.find((record) => record.id === selectedId) ?? null, [records, selectedId]);
  const capture = selectedRecord?.capture ?? null;
  const activeAiProfile = useMemo(() => getActiveAiProfile(aiSettings), [aiSettings]);
  const hasAiKey = Boolean(activeAiProfile.apiKey.trim());
  const currentTabRecord = records.find((record) => record.tabId === activeTabId) ?? null;
  const canEditCurrentRoute = Boolean(selectedRecord && currentTabRecord?.id === selectedRecord.id);
  const settingsBrief = useMemo(() => selectedRecord ? normalizeDesignBrief({ ...brief, mode: selectedRecord.mode }) : brief, [brief, selectedRecord]);
  const recorderTasks = useMemo(() => selectedRecord?.recorderFlow && selectedRecord.recorderFlowMatch
    ? planRecorderSupplementalTasks(selectedRecord.recorderFlow, selectedRecord.recorderFlowMatch)
    : [], [selectedRecord?.recorderFlow, selectedRecord?.recorderFlowMatch]);
  const supplementalTasks = useMemo(() => mergeSupplementalTasks([
    ...recorderTasks,
    ...(capture?.smartCapture?.tasks ?? [])
  ]), [recorderTasks, capture?.smartCapture?.tasks]);

  useEffect(() => {
    void Promise.all([getStoredLocale(), getStoredTheme(), getStoredDesignBrief(), getAiSettingsState(), getStoredRebuildRouteProject()]).then(([nextLocale, nextTheme, nextBrief, nextAi, nextRouteProject]) => {
      setLocale(nextLocale);
      setTheme(nextTheme);
      setBrief(nextBrief);
      setAiSettings(nextAi);
      setRouteProject(nextRouteProject);
    });
    void browser.storage.local.get(SIDE_PANEL_VIEW_KEY).then((value) => {
      const requested = value[SIDE_PANEL_VIEW_KEY];
      if (isSidePanelView(requested)) setActiveView(requested);
      void browser.storage.local.remove(SIDE_PANEL_VIEW_KEY);
    });
    void refreshWorkspace(true);

    const onWorkspaceUpdated = (message: unknown) => {
      if (isWorkspaceUpdate(message)) void refreshWorkspace(true);
    };
    const onActivated = () => void refreshWorkspace(true);
    browser.runtime.onMessage.addListener(onWorkspaceUpdated);
    browser.tabs.onActivated.addListener(onActivated);
    return () => {
      browser.runtime.onMessage.removeListener(onWorkspaceUpdated);
      browser.tabs.onActivated.removeListener(onActivated);
    };
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => void refreshRecordingStatus(), 500);
    return () => window.clearInterval(timer);
  }, [isRecording, activeTabId]);

  async function refreshWorkspace(preferCurrent = false) {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id ?? null;
      setActiveTabId(tabId);
      const response = await browser.runtime.sendMessage({ type: "DESIGN_LENS_GET_WORKSPACE_CAPTURES" }) as WorkspaceResponse;
      if (!response.ok || !("records" in response)) throw new Error(response.ok ? "Workspace records unavailable." : response.error);
      setRecords(response.records);
      setSelectedId((current) => {
        const currentExists = response.records.some((record) => record.id === current);
        if (!preferCurrent && currentExists) return current;
        return response.records.find((record) => record.tabId === tabId)?.id ?? (currentExists ? current : response.records[0]?.id ?? null);
      });
      if (tabId !== null) await refreshRecordingStatus(tabId, false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshRecordingStatus(tabId = activeTabId, refreshOnComplete = true) {
    if (tabId === null) return;
    try {
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_RECORD_STATUS", locale }) as CaptureResponse;
      if (!response.ok) return;
      const nextIsRecording = Boolean(response.isRecording);
      setIsRecording(nextIsRecording);
      if (!nextIsRecording) setNotice((current) => isSmartCaptureProgressNotice(current) ? "" : current);
      if (!response.isRecording && refreshOnComplete && hasSignals(response.capture)) await refreshWorkspace(true);
    } catch {
      setIsRecording(false);
      setNotice((current) => isSmartCaptureProgressNotice(current) ? "" : current);
    }
  }

  async function startSmartCapture() {
    if (isBusy) return;
    if (brief.mode === "rebuild" && !brief.rebuild.authorizationConfirmed) {
      setActiveView("settings");
      setNotice(locale === "zh" ? "请先在设置中确认重建与证据采集权限。" : "Confirm rebuild and evidence-capture permission in Settings first.");
      return;
    }
    setIsBusy(true);
    setNotice(locale === "zh" ? "正在启动智能捕获..." : "Starting Smart Capture...");
    try {
      const tabId = await ensureActiveContentScript();
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_SMART_CAPTURE_START", locale, mode: brief.mode, rebuild: brief.mode === "rebuild" ? brief.rebuild : undefined }) as CaptureResponse;
      if (!response.ok) throw new Error(response.error);
      setIsRecording(Boolean(response.isRecording));
      if (response.isRecording) setNotice(locale === "zh" ? "智能捕获进行中" : "Smart Capture in progress");
      else {
        setNotice("");
        await refreshWorkspace(true);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function stopCapture() {
    if (isBusy) return;
    setIsBusy(true);
    setNotice(locale === "zh" ? "正在停止并整理证据..." : "Stopping and preserving evidence...");
    try {
      const tabId = await ensureActiveContentScript();
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_RECORD_STOP", locale }) as CaptureResponse;
      if (!response.ok) throw new Error(response.error);
      setIsRecording(false);
      await refreshWorkspace(true);
      setNotice(locale === "zh" ? "捕获已停止" : "Capture stopped");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function openGuidedCoverage(task?: SmartCaptureTask) {
    if (activeTabId === null || isBusy) return;
    const coverageMode = selectedRecord?.mode ?? brief.mode;
    if (coverageMode === "rebuild" && !brief.rebuild.authorizationConfirmed) {
      setActiveView("settings");
      setNotice(locale === "zh" ? "请先确认重建权限。" : "Confirm rebuild permission first.");
      return;
    }
    const guidedCaptureTask = coverageMode === "rebuild" ? toGuidedCaptureTask(task) : undefined;
    const response = await sendPageCommand({
      type: "DESIGN_LENS_OPEN_RECORDER",
      locale,
      mode: coverageMode,
      rebuild: coverageMode === "rebuild" ? brief.rebuild : undefined,
      ...(guidedCaptureTask ? { guidedTask: guidedCaptureTask } : {})
    }, guidedCaptureTask ? (locale === "zh" ? "当前手动补采任务已开始" : "The manual capture task started on the page") : (locale === "zh" ? "手动补采工具已打开" : "Manual capture controls opened"));
    if (response?.ok) setIsRecording(Boolean(response.isRecording));
  }

  async function pickComponent() {
    await sendPageCommand({ type: "DESIGN_LENS_OPEN_AND_PICK", locale }, locale === "zh" ? "请在页面中选取组件" : "Pick a component on the page");
  }

  async function resolveNextSupplementalTask() {
    const nextTask = supplementalTasks[0];
    const sceneId = nextTask?.source === "recorder-flow" && nextTask.kind === "capture-component"
      ? nextTask.sourceSceneIds?.[0]
      : undefined;
    if (!sceneId || !selectedRecord) {
      await openGuidedCoverage(nextTask);
      return;
    }
    await sendPageCommand({
      type: "DESIGN_LENS_OPEN_AND_PICK",
      locale,
      recorderTarget: { workspaceRecordId: selectedRecord.id, sceneId }
    }, locale === "zh" ? "选择目标后将自动进入状态补采" : "Choose the target to continue with state capture");
  }

  async function sendPageCommand(message: unknown, success: string) {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const tabId = await ensureActiveContentScript();
      const response = await browser.tabs.sendMessage(tabId, message) as CaptureResponse;
      if (!response.ok) throw new Error(response.error);
      setNotice(success);
      return response;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function ensureActiveContentScript() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isInjectableUrl(tab.url)) {
      throw new Error(locale === "zh" ? "请在普通网页中使用 Design Lens。" : "Use Design Lens on a regular web page.");
    }

    setActiveTabId(tab.id);
    await ensureDesignLensPageBridge(tab.id, locale);
    return tab.id;
  }

  async function exportSelectedCapture() {
    if (!capture || isBusy) return;
    const captureBrief = normalizeDesignBrief({ ...brief, mode: selectedRecord?.mode ?? brief.mode });
    if (captureBrief.mode === "rebuild" && !captureBrief.rebuild.authorizationConfirmed) {
      setActiveView("settings");
      setNotice(locale === "zh" ? "导出重建草稿前需要再次确认权限。" : "Confirm permission before exporting a rebuild draft.");
      return;
    }
    setIsBusy(true);
    try {
      const localized = withLocalizedAnalysis(capture, locale);
      if (captureBrief.mode === "rebuild") {
        const artifacts = await loadRebuildArtifactFiles(localized, locale);
        const blob = createZipBlob(buildRebuildDraftPackFiles(localized, captureBrief, locale, artifacts, selectedRecord?.recorderFlow, selectedRecord?.recorderFlowMatch));
        downloadBlob(buildPackFilename(localized, "rebuild-draft"), blob);
        setNotice(locale === "zh" ? "重建草稿已导出" : "Rebuild draft exported");
      } else if (!hasAiKey) {
        const blob = createZipBlob(buildEvidenceOnlyPackFiles(localized, captureBrief, locale));
        downloadBlob(buildPackFilename(localized, "evidence-only"), blob);
        setNotice(locale === "zh" ? "基础资料包已导出" : "Evidence pack exported");
      } else {
        await generatePromptPack(localized, captureBrief);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function generatePromptPack(captureToExport: DesignCapture, captureBrief: DesignBrief) {
    const payload = buildAiAnalysisPayload(captureToExport, locale);
    const prompt = buildAiPrompt(payload, captureBrief);
    try {
      const aiBrief = await generateAiDesignAnalysis(captureToExport, { apiKey: activeAiProfile.apiKey.trim(), model: activeAiProfile.model, baseUrl: activeAiProfile.baseUrl, endpoint: activeAiProfile.endpoint, locale, brief: captureBrief });
      const blob = createZipBlob(buildAiPromptPackFiles(captureToExport, captureBrief, locale, prompt, aiBrief || prompt, "generated"));
      downloadBlob(buildPackFilename(captureToExport, "ai-prompt"), blob);
      setNotice(locale === "zh" ? "Prompt 包已生成" : "Prompt pack generated");
    } catch (error) {
      const fallback = buildFailedAiBrief(prompt, activeAiProfile.name, locale, error instanceof Error ? error.message : String(error));
      const blob = createZipBlob(buildAiPromptPackFiles(captureToExport, captureBrief, locale, prompt, fallback, "failed"));
      downloadBlob(buildPackFilename(captureToExport, "ai-prompt"), blob);
      setNotice(locale === "zh" ? "AI 请求失败，已导出可继续使用的 Prompt 包" : "AI failed; a reusable prompt pack was exported");
    }
  }

  async function saveBrief(nextBrief: DesignBrief) {
    const normalized = normalizeDesignBrief(nextBrief);
    setBrief(normalized);
    await setStoredDesignBrief(normalized);
    setNotice(locale === "zh" ? "捕获要求已保存" : "Capture brief saved");
  }

  async function changeCaptureMode(mode: DesignBrief["mode"]) {
    if (isBusy || mode === brief.mode) return;
    const next = normalizeDesignBrief({ ...brief, mode });
    setBrief(next);
    await setStoredDesignBrief(next);
    setNotice(locale === "zh"
      ? mode === "reference" ? "已切换为设计参照" : "已切换为高保真重建"
      : mode === "reference" ? "Switched to Reference" : "Switched to Rebuild");
  }

  async function openCompactView() {
    try {
      if (activeTabId === null) throw new Error(locale === "zh" ? "当前标签页不可用。" : "The current tab is unavailable.");
      await openCompactActionPopup(activeTabId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setNotice(locale === "zh" ? `无法打开插件弹窗：${detail}` : `Unable to open the extension popup: ${detail}`);
    }
  }

  async function saveAi(profile: AiProviderProfile) {
    const next = upsertAiProfile(aiSettings, { ...profile, updatedAt: new Date().toISOString() });
    setAiSettings(next);
    await setAiSettingsState(next);
    setNotice(locale === "zh" ? "AI 配置已保存" : "AI settings saved");
  }

  async function clearAi(profileId: string) {
    const fallback = createDefaultAiSettingsState();
    const profiles = { ...aiSettings.profiles };
    delete profiles[profileId];
    if (!Object.keys(profiles).length) {
      const profile = getActiveAiProfile(fallback);
      profiles[profile.id] = profile;
    }
    const next = { activeProfileId: aiSettings.activeProfileId === profileId ? Object.keys(profiles)[0] ?? fallback.activeProfileId : aiSettings.activeProfileId, profiles };
    setAiSettings(next);
    await setAiSettingsState(next);
  }

  async function addCurrentRoute() {
    if (!capture) return;
    const next = addCaptureToRouteProject(routeProject, capture, undefined, selectedRecord?.recorderFlow, selectedRecord?.recorderFlowMatch);
    await setStoredRebuildRouteProject(next);
    setRouteProject(next);
  }

  async function removeProjectRoute(routeId: string) {
    if (!routeProject) return;
    const next = removeRouteFromProject(routeProject, routeId);
    await setStoredRebuildRouteProject(next.routes.length ? next : null);
    setRouteProject(next.routes.length ? next : null);
  }

  async function startNewRouteProject() {
    if (!capture) return;
    const next = addCaptureToRouteProject(null, capture, undefined, selectedRecord?.recorderFlow, selectedRecord?.recorderFlowMatch);
    await setStoredRebuildRouteProject(next);
    setRouteProject(next);
  }

  async function exportRouteProject() {
    if (!routeProject || routeProject.routes.length < 2) return;
    const captureBrief = normalizeDesignBrief({ ...brief, mode: "rebuild" });
    if (!captureBrief.rebuild.authorizationConfirmed) {
      setActiveView("settings");
      setNotice(locale === "zh" ? "导出网站项目前需要确认权限。" : "Confirm permission before exporting the site project.");
      return;
    }
    setIsBusy(true);
    try {
      const artifacts = await loadMultiRouteRebuildArtifactFiles(routeProject.routes, locale);
      const blob = createZipBlob(buildMultiRouteRebuildDraftPackFiles(routeProject.routes, captureBrief, locale, artifacts));
      downloadBlob(buildMultiRoutePackFilename(routeProject.routes), blob);
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteHistory(id: string) {
    const response = await browser.runtime.sendMessage({ type: "DESIGN_LENS_DELETE_WORKSPACE_CAPTURE", id }) as WorkspaceResponse;
    if (!response.ok) {
      setNotice(response.error);
      return;
    }
    await refreshWorkspace(false);
  }

  async function importRecorderFlow(file: File) {
    if (!selectedRecord || !canEditCurrentRoute || isBusy) return;
    if (file.size > MAX_RECORDER_FLOW_BYTES) {
      setNotice(locale === "zh" ? "Recorder JSON 不能超过 2MB。" : "Recorder JSON must be 2MB or smaller.");
      return;
    }
    setIsBusy(true);
    try {
      const source = await file.text();
      const plan = compileImportedRecorderFlow(JSON.parse(source), {
        viewport: {
          width: selectedRecord.capture.viewport.width,
          height: selectedRecord.capture.viewport.height,
          deviceScaleFactor: selectedRecord.capture.viewport.devicePixelRatio
        }
      });
      const response = await browser.runtime.sendMessage({ type: "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW", id: selectedRecord.id, flow: plan }) as WorkspaceResponse;
      if (!response.ok) throw new Error(response.error);
      await refreshWorkspace(false);
      setNotice(locale === "zh" ? `已导入 ${plan.scenes.length} 个脱敏场景计划` : `Imported ${plan.scenes.length} redacted scene plans`);
    } catch (error) {
      setNotice(locale === "zh"
        ? `Recorder 文件无效：${error instanceof Error ? error.message : String(error)}`
        : `Invalid Recorder file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function clearRecorderFlow() {
    if (!selectedRecord || !canEditCurrentRoute || isBusy) return;
    setIsBusy(true);
    try {
      const response = await browser.runtime.sendMessage({ type: "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW", id: selectedRecord.id, flow: null }) as WorkspaceResponse;
      if (!response.ok) throw new Error(response.error);
      await refreshWorkspace(false);
      setNotice(locale === "zh" ? "Recorder 流程已移除" : "Recorder flow removed");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleLocale() {
    const next: Locale = locale === "zh" ? "en" : "zh";
    setLocale(next);
    await setStoredLocale(next);
  }

  async function toggleTheme() {
    const next: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(next);
    await setStoredTheme(next);
  }

  return (
    <main className={theme === "dark" ? "workspace theme-dark" : "workspace theme-light"}>
      <header className="workspace-header">
        <div className="workspace-brand"><div className="workspace-mark">D</div><div><h1>Design Lens</h1><span>{capture ? captureHost(capture.page.url) : locale === "zh" ? "捕获工作区" : "Capture workspace"}</span></div></div>
        <div className="workspace-header-actions">
          <button type="button" aria-label={locale === "zh" ? "打开插件弹窗" : "Open extension popup"} title={locale === "zh" ? "插件弹窗" : "Extension popup"} onClick={() => void openCompactView()}><AppWindow aria-hidden="true" /></button>
          <button type="button" aria-label={locale === "zh" ? "English" : "中文"} onClick={() => void toggleLocale()}><Languages aria-hidden="true" /></button>
          <button type="button" aria-label={theme === "light" ? (locale === "zh" ? "深色模式" : "Dark mode") : (locale === "zh" ? "浅色模式" : "Light mode")} onClick={() => void toggleTheme()}>{theme === "light" ? <MoonStar aria-hidden="true" /> : <SunMedium aria-hidden="true" />}</button>
        </div>
      </header>

      <nav className="workspace-tabs" aria-label={locale === "zh" ? "工作区视图" : "Workspace views"}>
        <TabButton view="overview" active={activeView} locale={locale} icon={<LayoutDashboard aria-hidden="true" />} onChange={setActiveView} />
        <TabButton view="coverage" active={activeView} locale={locale} icon={<ListChecks aria-hidden="true" />} onChange={setActiveView} />
        <TabButton view="history" active={activeView} locale={locale} icon={<Clock3 aria-hidden="true" />} onChange={setActiveView} />
        <TabButton view="settings" active={activeView} locale={locale} icon={<Settings2 aria-hidden="true" />} onChange={setActiveView} />
      </nav>

      {notice ? <div className="workspace-notice" role="status"><span>{notice}</span><button type="button" aria-label={locale === "zh" ? "清除状态" : "Dismiss status"} onClick={() => setNotice("")}><X aria-hidden="true" /></button></div> : null}

      <div className="workspace-content">
        {activeView === "overview" ? <WorkspaceOverview capture={capture} captureMode={brief.mode} tasks={supplementalTasks} recorderGapCount={(selectedRecord?.recorderFlowMatch?.counts.partial ?? 0) + (selectedRecord?.recorderFlowMatch?.counts.missing ?? 0)} locale={locale} isBusy={isBusy} isRecording={isRecording} hasAiKey={hasAiKey} isCurrentResult={Boolean(selectedRecord && currentTabRecord?.id === selectedRecord.id)} onModeChange={(mode) => void changeCaptureMode(mode)} onCapture={() => void startSmartCapture()} onStop={() => void stopCapture()} onImprove={() => void resolveNextSupplementalTask()} onExport={() => void exportSelectedCapture()} onOpenSettings={() => setActiveView("settings")} onShowCurrent={() => setSelectedId(currentTabRecord?.id ?? null)} /> : null}
        {activeView === "coverage" ? <WorkspaceCoverage capture={capture} locale={locale} isBusy={isBusy} routeProject={routeProject} recorderFlow={selectedRecord?.recorderFlow} recorderFlowMatch={selectedRecord?.recorderFlowMatch} canEditCurrentRoute={canEditCurrentRoute} onAddRoute={() => void addCurrentRoute()} onRemoveRoute={(id) => void removeProjectRoute(id)} onExportRouteProject={() => void exportRouteProject()} onStartNewRouteProject={() => void startNewRouteProject()} onImportRecorderFlow={(file) => void importRecorderFlow(file)} onClearRecorderFlow={() => void clearRecorderFlow()} /> : null}
        {activeView === "history" ? <WorkspaceHistory records={records} selectedId={selectedId} locale={locale} onSelect={(id) => { setSelectedId(id); setActiveView("overview"); }} onDelete={(id) => void deleteHistory(id)} /> : null}
        {activeView === "settings" ? <WorkspaceSettings locale={locale} brief={settingsBrief} aiSettings={aiSettings} onSaveBrief={(next) => void saveBrief(next)} onSaveAi={(profile) => void saveAi(profile)} onClearAi={(id) => void clearAi(id)} /> : null}
      </div>
    </main>
  );
}

function toGuidedCaptureTask(task: SmartCaptureTask | undefined): GuidedCaptureTask | undefined {
  if (!task || (task.kind !== "record-interactions" && task.kind !== "capture-responsive" && task.kind !== "capture-state")) return undefined;
  return {
    kind: task.kind,
    ...(task.trigger ? { trigger: task.trigger } : {}),
    ...(task.state ? { state: task.state } : {}),
    ...(task.viewport ? { viewport: task.viewport } : {}),
    ...(task.selector ? { selector: task.selector } : {}),
    ...(task.targetScrollY !== undefined ? { targetScrollY: task.targetScrollY } : {})
  };
}

function TabButton({ view, active, locale, icon, onChange }: { view: SidePanelView; active: SidePanelView; locale: Locale; icon: React.ReactNode; onChange: (view: SidePanelView) => void }) {
  const labels: Record<SidePanelView, [string, string]> = { overview: ["概览", "Overview"], coverage: ["覆盖", "Coverage"], history: ["历史", "History"], settings: ["设置", "Settings"] };
  const label = labels[view][locale === "zh" ? 0 : 1];
  return <button className={active === view ? "active" : ""} type="button" aria-label={label} title={label} aria-current={active === view ? "page" : undefined} onClick={() => onChange(view)}>{icon}<span>{label}</span></button>;
}

function isSidePanelView(value: unknown): value is SidePanelView {
  return value === "overview" || value === "coverage" || value === "history" || value === "settings";
}

function isWorkspaceUpdate(value: unknown): value is { type: "DESIGN_LENS_WORKSPACE_UPDATED" } {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "DESIGN_LENS_WORKSPACE_UPDATED");
}

function isInjectableUrl(url?: string) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

createRoot(document.getElementById("root")!).render(<SidePanel />);
