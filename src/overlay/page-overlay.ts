import { withLocalizedAnalysis } from "../analyzer/core/analysis";
import { createInteractionTimelineRecorder, mergeInteractionTimelines } from "../analyzer/timeline/interaction-timeline";
import { DEFAULT_LOCALE, messages, type Locale } from "../shared/i18n";
import { getStoredTheme, type ThemeMode } from "../shared/theme-storage";
import { getStoredLocale } from "../shared/locale-storage";
import type { CaptureResponse, ScanMode } from "../shared/messages";
import type { DesignCapture, InteractionTimeline } from "../shared/schema";
import {
  buildCaptureCardMarkup,
  buildErrorMarkup,
  buildIdleMarkup,
  buildLoadingMarkup,
  buildOverlayMarkup,
  buildRecorderMarkup
} from "./page-overlay-view";

type OverlayActions = {
  scanPage: () => Promise<CaptureResponse>;
  pickElement: () => Promise<CaptureResponse>;
};

export function createPageOverlay(actions: OverlayActions) {
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let lastCapture: DesignCapture | null = null;
  let locale: Locale = DEFAULT_LOCALE;
  let theme: ThemeMode = "dark";
  let compactMode = false;
  let recordingStartedAt = 0;
  let recordingTimer: number | null = null;
  let dismissTimer: number | null = null;
  let recordedCaptures: DesignCapture[] = [];
  let recordingInFlight = false;
  let hiddenForFlow = false;
  let timelineRecorder: ReturnType<typeof createInteractionTimelineRecorder> | null = null;
  let recordedTimeline: InteractionTimeline | undefined;

  async function toggle(nextLocale?: Locale) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    locale = nextLocale ?? (await getStoredLocale());
    theme = await getStoredTheme();

    if (host) {
      host.remove();
      host = null;
      shadow = null;
      return;
    }

    await open(locale);
  }

  async function open(nextLocale?: Locale) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    locale = nextLocale ?? (await getStoredLocale());
    theme = await getStoredTheme();
    compactMode = true;

    if (host) {
      renderIdle();
      return;
    }

    host = document.createElement("div");
    host.id = "design-lens-overlay-root";
    syncHostPosition();
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
    renderIdle();
  }

  async function ensureHost(nextLocale?: Locale) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    locale = nextLocale ?? (await getStoredLocale());
    theme = await getStoredTheme();
    compactMode = true;
    if (host) return;
    host = document.createElement("div");
    host.id = "design-lens-overlay-root";
    syncHostPosition();
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
  }

  async function openAndRun(action: "scan" | "pick", nextLocale?: Locale, scanMode: ScanMode = "instant") {
    await ensureHost(nextLocale);
    await run(action, scanMode);
  }

  async function openRecorder(nextLocale?: Locale) {
    await ensureHost(nextLocale);
    compactMode = true;
    syncHostPosition();
    setFlowHidden(false);
    renderRecorder(false);
  }

  async function beginRecord(nextLocale?: Locale) {
    locale = nextLocale ?? locale;
    theme = await getStoredTheme();
    if (!host) {
      host = document.createElement("div");
      host.id = "design-lens-overlay-root";
      compactMode = true;
      syncHostPosition();
      shadow = host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }
    await startRecording();
  }

  async function finishRecord() {
    if (!recordingStartedAt) return lastCapture ?? getEmptyCapture();
    const capture = await stopRecording({ keepMinimal: true });
    return capture;
  }

  function getRecordStatus() {
    return {
      isRecording: Boolean(recordingStartedAt),
      capture: lastCapture ?? getEmptyCapture()
    };
  }

  function syncHostPosition() {
    if (!host) return;
    host.style.cssText = `position:fixed;left:18px;bottom:18px;z-index:2147483647;pointer-events:${hiddenForFlow ? "none" : "auto"}`;
  }

  function setFlowHidden(isHidden: boolean) {
    hiddenForFlow = isHidden;
    if (!host) return;
    host.style.opacity = isHidden ? "0" : "1";
    host.style.transform = isHidden ? "translateY(10px) scale(.98)" : "";
    host.style.pointerEvents = isHidden ? "none" : "auto";
    host.setAttribute("aria-hidden", isHidden ? "true" : "false");
  }

  function setLocale(nextLocale: Locale) {
    locale = nextLocale;
    if (!host) return;

    if (recordingStartedAt) renderRecorder(true);
    else renderIdle();
  }

  function setTheme(nextTheme: ThemeMode) {
    theme = nextTheme;
    if (!host) return;
    if (recordingStartedAt) renderRecorder(true);
    else renderIdle();
  }

  function getLastCapture() {
    return lastCapture;
  }

  function getEmptyCapture(): DesignCapture {
    return {
      scope: "page",
      page: {
        title: document.title || "Untitled page",
        url: location.href,
        capturedAt: new Date().toISOString()
      },
      viewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio
      },
      tokens: {
        cssVariables: [],
        colors: [],
        backgrounds: [],
        spacing: [],
        radii: [],
        shadows: [],
        typography: []
      },
      layout: [],
      layoutProfile: {
        density: "balanced",
        composition: "standard document composition",
        dominantDisplays: [],
        dominantGaps: [],
        alignment: [],
        structure: [],
        cadence: [],
        emphasis: []
      },
      components: [],
      motion: [],
      interactions: [],
      evidence: [],
      interactionTimeline: undefined,
      analysis: {
        character: messages[locale].emptyCharacter,
        tags: [],
        recommendations: []
      }
    };
  }

  async function run(action: "scan" | "pick", scanMode: ScanMode = "instant") {
    compactMode = true;
    syncHostPosition();
    if (action === "pick") {
      setFlowHidden(true);
    } else {
      renderLoading(action, scanMode);
    }
    if (action === "scan") await waitForScanTiming(scanMode);
    const response = action === "scan" ? await actions.scanPage() : await actions.pickElement();
    setFlowHidden(false);
    compactMode = true;
    syncHostPosition();

    if (!response.ok) {
      renderError(response.error);
      return;
    }

    lastCapture = response.capture;
    renderDone();
    dismissSoon(5600);
  }

  async function startRecording() {
    if (recordingStartedAt) {
      renderRecorder(true);
      return;
    }
    recordingStartedAt = performance.now();
    recordedCaptures = [];
    recordedTimeline = undefined;
    timelineRecorder = createInteractionTimelineRecorder(document, window);
    timelineRecorder.start();
    setFlowHidden(false);
    renderRecorder(true);
    await sampleRecording();
    recordingTimer = window.setInterval(() => void sampleRecording(), 1200);
    window.addEventListener("scroll", onRecordingSignal, true);
    window.addEventListener("pointerup", onRecordingSignal, true);
    window.addEventListener("mouseover", onRecordingSignal, true);
  }

  async function stopRecording(options: { keepMinimal?: boolean } = {}) {
    stopRecordingListeners();
    setFlowHidden(false);
    renderLoading("scan", "recorded");
    recordedTimeline = timelineRecorder?.stop();
    timelineRecorder = null;
    await burstRecordingSamples();
    const mergedCapture = mergeCaptures(recordedCaptures);
    if (!mergedCapture) {
      const response = await actions.scanPage();
      if (!response.ok) {
        renderError(response.error);
        throw new Error(response.error);
      }
      lastCapture = response.capture;
      recordingStartedAt = 0;
      renderDone();
      dismissSoon(options.keepMinimal ? 5600 : 7200);
      return response.capture;
    }
    mergedCapture.interactionTimeline = mergeInteractionTimelines([mergedCapture.interactionTimeline, recordedTimeline]);
    lastCapture = mergedCapture;
    recordingStartedAt = 0;
    renderDone();
    dismissSoon(options.keepMinimal ? 5600 : 7200);
    return mergedCapture;
  }

  function dismissSoon(delayMs: number) {
    if (dismissTimer !== null) window.clearTimeout(dismissTimer);
    dismissTimer = window.setTimeout(() => closeOverlay(true), delayMs);
  }

  function closeOverlay(animate = false) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (!host) return;
    if (animate && shadow) {
      const panel = shadow.querySelector(".panel");
      panel?.classList.add("is-leaving");
      window.setTimeout(() => {
        host?.remove();
        host = null;
        shadow = null;
      }, 220);
      return;
    }
    host.remove();
    host = null;
    shadow = null;
  }

  function stopRecordingListeners() {
    if (recordingTimer !== null) {
      window.clearInterval(recordingTimer);
      recordingTimer = null;
    }
    window.removeEventListener("scroll", onRecordingSignal, true);
    window.removeEventListener("pointerup", onRecordingSignal, true);
    window.removeEventListener("mouseover", onRecordingSignal, true);
  }

  function onRecordingSignal() {
    if (!recordingStartedAt) return;
    void sampleRecording();
  }

  async function sampleRecording() {
    if (recordingInFlight) return;
    recordingInFlight = true;
    try {
      const response = await actions.scanPage();
      if (response.ok) {
        const preview = timelineRecorder?.getPreview();
        if (preview) response.capture.interactionTimeline = preview;
        recordedCaptures.push(response.capture);
      }
      if (recordedCaptures.length > 8) recordedCaptures = recordedCaptures.slice(-8);
    } finally {
      recordingInFlight = false;
    }
  }

  async function burstRecordingSamples() {
    await sampleRecording();
    const delays = [180, 360, 720];
    for (const delay of delays) {
      await wait(delay);
      await sampleRecording();
    }
  }

  function renderIdle() {
    renderShell(buildIdleMarkup(locale));
  }

  function renderRecorder(isRecording: boolean) {
    renderShell(buildRecorderMarkup(locale, isRecording), isRecording ? "recording" : "recorder");
  }

  function renderDone() {
    if (lastCapture) {
      renderCaptureCard(lastCapture);
      return;
    }
    renderShell(`
      <div class="mini-loading">
        <span class="mini-dot is-done"></span>
        <span>${locale === "zh" ? "采集完成，结果已回到控制台。" : "Capture complete. Results returned to the console."}</span>
      </div>
    `);
  }

  function renderLoading(action: string, scanMode: ScanMode = "instant") {
    renderShell(buildLoadingMarkup(locale, action as "scan" | "pick", scanMode));
  }

  function renderError(error: string) {
    renderShell(buildErrorMarkup(locale, error));
  }

  function renderCaptureCard(capture: DesignCapture) {
    renderShell(buildCaptureCardMarkup({ capture, locale }), "capture");
  }

  function renderShell(content: string, variant: "status" | "capture" | "recorder" | "recording" = "status") {
    if (!shadow) return;
    if (host) {
      host.style.opacity = hiddenForFlow ? "0" : "1";
      host.style.transition = "opacity 180ms ease, transform 180ms ease";
    }
    shadow.innerHTML = buildOverlayMarkup(theme, content, variant);

    shadow.querySelector('[data-action="record-start"]')?.addEventListener("click", () => void startRecording());
    shadow.querySelector('[data-action="record-stop"]')?.addEventListener("click", () => void stopRecording());
    shadow.querySelector('[data-action="close"]')?.addEventListener("click", () => closeOverlay(true));
  }

  return { toggle, openAndRun, openRecorder, beginRecord, finishRecord, getRecordStatus, setLocale, setTheme, getLastCapture, getEmptyCapture };
}

async function waitForScanTiming(scanMode: ScanMode) {
  if (scanMode === "instant") return;
  await waitForDocumentReady();
}

async function waitForDocumentReady() {
  if (document.readyState === "complete") return;
  await new Promise<void>((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
    window.setTimeout(() => resolve(), 2500);
  });
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

async function waitForAnimationWindow(durationMs: number) {
  const startedAt = performance.now();
  let lastMutation = performance.now();
  const observer = new MutationObserver(() => {
    lastMutation = performance.now();
  });
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const quiet = performance.now() - lastMutation > 450;
      if (elapsed >= durationMs && (quiet || elapsed > durationMs + 1400)) {
        observer.disconnect();
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function mergeCaptures(captures: DesignCapture[]) {
  const [base] = captures;
  if (!base) return null;

  const merged: DesignCapture = structuredClone(base);
  merged.scope = captures.some((capture) => capture.scope === "component") ? "component" : "page";
  merged.tokens = {
    cssVariables: mergeTokenValues(captures.flatMap((capture) => capture.tokens.cssVariables)),
    colors: mergeTokenValues(captures.flatMap((capture) => capture.tokens.colors)),
    backgrounds: mergeTokenValues(captures.flatMap((capture) => capture.tokens.backgrounds)),
    spacing: mergeTokenValues(captures.flatMap((capture) => capture.tokens.spacing)),
    radii: mergeTokenValues(captures.flatMap((capture) => capture.tokens.radii)),
    shadows: mergeTokenValues(captures.flatMap((capture) => capture.tokens.shadows)),
    typography: mergeTypography(captures.flatMap((capture) => capture.tokens.typography))
  };
  merged.components = mergeByKey(captures.flatMap((capture) => capture.components), (component) => `${component.name}:${component.selector}`);
  merged.motion = mergeByKey(captures.flatMap((capture) => capture.motion), (motion) => `${motion.selector}:${motion.type}:${motion.name}`);
  merged.interactions = mergeByKey(captures.flatMap((capture) => capture.interactions), (interaction) => `${interaction.selector}:${interaction.trigger}:${interaction.affordance}`);
  merged.layout = mergeByKey(captures.flatMap((capture) => capture.layout), (layout) => `${layout.display}:${layout.position}:${layout.width}:${layout.height}:${layout.gap}`).slice(0, 48);
  merged.evidence = mergeByKey(captures.flatMap((capture) => capture.evidence), (evidence) => `${evidence.reason}:${evidence.selector}`).slice(0, 60);
  merged.interactionTimeline = mergeInteractionTimelines(captures.map((capture) => capture.interactionTimeline));
  merged.layoutProfile = {
    ...merged.layoutProfile,
    structure: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.structure)),
    cadence: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.cadence)),
    emphasis: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.emphasis)),
    dominantDisplays: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.dominantDisplays)),
    dominantGaps: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.dominantGaps)),
    alignment: mergeStrings(captures.flatMap((capture) => capture.layoutProfile.alignment))
  };
  merged.analysis = withLocalizedAnalysis(merged).analysis;
  return merged;
}

function mergeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = getKey(item);
    if (!seen.has(key)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

function mergeStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, 8);
}

function mergeTokenValues(tokens: DesignCapture["tokens"]["colors"]) {
  const seen = new Map<string, DesignCapture["tokens"]["colors"][number]>();
  for (const token of tokens) {
    const existing = seen.get(token.value);
    if (existing) {
      existing.count += token.count;
      existing.sampleSelectors = mergeStrings([...existing.sampleSelectors, ...token.sampleSelectors]).slice(0, 4);
    } else {
      seen.set(token.value, { ...token, sampleSelectors: token.sampleSelectors.slice(0, 4) });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count).slice(0, 32);
}

function mergeTypography(tokens: DesignCapture["tokens"]["typography"]) {
  const seen = new Map<string, DesignCapture["tokens"]["typography"][number]>();
  for (const token of tokens) {
    const key = `${token.family}:${token.size}:${token.weight}:${token.lineHeight}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count += token.count;
      existing.sampleSelectors = mergeStrings([...existing.sampleSelectors, ...token.sampleSelectors]).slice(0, 4);
    } else {
      seen.set(key, { ...token, sampleSelectors: token.sampleSelectors.slice(0, 4) });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count).slice(0, 16);
}
