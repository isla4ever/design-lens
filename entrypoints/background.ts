import { defineBackground } from "wxt/utils/define-background";
import { createCaptureVisibleTabQueue } from "../src/capture-v2/browser/capture-visible-tab-queue";
import { captureCdpScenes } from "../src/capture-v2/cdp/cdp-scene-orchestrator";
import type { CdpProtocolEvent } from "../src/capture-v2/cdp/deep-collector";
import { sanitizeDomSnapshot } from "../src/capture-v2/cdp/dom-snapshot-privacy";
import { withCdpSession, type CdpTransport } from "../src/capture-v2/cdp/cdp-session";
import { CaptureProjectStore, type StoredArtifact } from "../src/storage/capture-project-store";
import type { ArtifactStorageRequest, ArtifactStorageResponse, DeepCaptureRequest, DeepCaptureResponse, WorkspaceRequest, WorkspaceResponse } from "../src/shared/messages";
import { ensureDesignLensPageBridge } from "../src/shared/page-bridge";

const captureVisibleTabQueue = createCaptureVisibleTabQueue();

export default defineBackground(() => {
  const store = new CaptureProjectStore();

  void configureDefaultSurface();

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "capture-selection") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isInjectableUrl(tab.url)) return;
    try {
      await ensureDesignLensPageBridge(tab.id);
      await browser.tabs.sendMessage(tab.id, { type: "DESIGN_LENS_CAPTURE_HOVER" });
    } catch {
      // Restricted pages cannot host the page bridge.
    }
  });

  browser.runtime.onMessage.addListener((message: ArtifactStorageRequest | DeepCaptureRequest | WorkspaceRequest, sender) => {
    if (message.type === "DESIGN_LENS_CAPTURE_VISIBLE_TAB") {
      return captureAndStoreVisibleTab(message, sender, store);
    }
    if (message.type === "DESIGN_LENS_STORE_RRWEB_ARTIFACT") {
      return storeRrwebArtifact(message, store);
    }
    if (message.type === "DESIGN_LENS_COLLECT_DEEP_EVIDENCE") {
      return collectAndStoreDeepEvidence(message, sender, store);
    }
    if (message.type === "DESIGN_LENS_STORE_WORKSPACE_CAPTURE") {
      return storeWorkspaceCapture(message, sender, store);
    }
    if (message.type === "DESIGN_LENS_GET_WORKSPACE_CAPTURES") {
      return listWorkspaceCaptures(message, store);
    }
    if (message.type === "DESIGN_LENS_DELETE_WORKSPACE_CAPTURE") {
      return deleteWorkspaceCapture(message, store);
    }
    if (message.type === "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW") {
      return setWorkspaceRecorderFlow(message, store);
    }
    if (message.type === "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW_MATCH") {
      return setWorkspaceRecorderFlowMatch(message, store);
    }
    if (message.type === "DESIGN_LENS_RESOLVE_RECORDER_TARGET") {
      return resolveWorkspaceRecorderTarget(message, store);
    }
    return undefined;
  });
});

async function configureDefaultSurface() {
  try {
    await browser.action.setPopup({ popup: "" });
    if (!browser.sidePanel?.setPanelBehavior) throw new Error("Side Panel behavior is unavailable");
    await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    await browser.action.setPopup({ popup: "popup.html" }).catch(() => undefined);
  }
}

async function storeWorkspaceCapture(
  message: Extract<WorkspaceRequest, { type: "DESIGN_LENS_STORE_WORKSPACE_CAPTURE" }>,
  sender: Browser.runtime.MessageSender,
  store: CaptureProjectStore
): Promise<WorkspaceResponse> {
  try {
    if (sender.tab?.id === undefined) throw new Error("The captured tab is unavailable.");
    const record = await store.putWorkspaceCapture(sender.tab.id, message.capture);
    void browser.runtime.sendMessage({ type: "DESIGN_LENS_WORKSPACE_UPDATED", tabId: sender.tab.id, recordId: record.id }).catch(() => undefined);
    return { ok: true, record };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function listWorkspaceCaptures(
  message: Extract<WorkspaceRequest, { type: "DESIGN_LENS_GET_WORKSPACE_CAPTURES" }>,
  store: CaptureProjectStore
): Promise<WorkspaceResponse> {
  try {
    return { ok: true, records: await store.listWorkspaceCaptures(message.tabId) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function deleteWorkspaceCapture(
  message: Extract<WorkspaceRequest, { type: "DESIGN_LENS_DELETE_WORKSPACE_CAPTURE" }>,
  store: CaptureProjectStore
): Promise<WorkspaceResponse> {
  try {
    await store.deleteWorkspaceCapture(message.id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function setWorkspaceRecorderFlow(
  message: Extract<WorkspaceRequest, { type: "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW" }>,
  store: CaptureProjectStore
): Promise<WorkspaceResponse> {
  try {
    const record = await store.setWorkspaceRecorderFlow(message.id, message.flow);
    void browser.runtime.sendMessage({ type: "DESIGN_LENS_WORKSPACE_UPDATED", tabId: record.tabId, recordId: record.id }).catch(() => undefined);
    return { ok: true, record };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function setWorkspaceRecorderFlowMatch(
  message: Extract<WorkspaceRequest, { type: "DESIGN_LENS_SET_WORKSPACE_RECORDER_FLOW_MATCH" }>,
  store: CaptureProjectStore
): Promise<WorkspaceResponse> {
  try {
    const record = await store.setWorkspaceRecorderFlowMatch(message.id, message.match);
    void browser.runtime.sendMessage({ type: "DESIGN_LENS_WORKSPACE_UPDATED", tabId: record.tabId, recordId: record.id }).catch(() => undefined);
    return { ok: true, record };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function resolveWorkspaceRecorderTarget(
  message: Extract<WorkspaceRequest, { type: "DESIGN_LENS_RESOLVE_RECORDER_TARGET" }>,
  store: CaptureProjectStore
): Promise<WorkspaceResponse> {
  try {
    const record = await store.resolveWorkspaceRecorderTarget(message.id, message.sceneId, message.selector);
    void browser.runtime.sendMessage({ type: "DESIGN_LENS_WORKSPACE_UPDATED", tabId: record.tabId, recordId: record.id }).catch(() => undefined);
    return { ok: true, record };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function captureAndStoreVisibleTab(
  message: Extract<ArtifactStorageRequest, { type: "DESIGN_LENS_CAPTURE_VISIBLE_TAB" }>,
  sender: Browser.runtime.MessageSender,
  store: CaptureProjectStore
): Promise<ArtifactStorageResponse> {
  try {
    if (!sender.tab?.active || sender.tab.windowId === undefined) {
      throw new Error("The recorded page must remain the active tab while screenshots are captured.");
    }
    const windowId = sender.tab.windowId;
    const dataUrl = await captureVisibleTabQueue.run(() => browser.tabs.captureVisibleTab(windowId, { format: "png" }));
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const stored = await store.putArtifact({
      projectId: message.storageProjectId,
      artifactId: message.artifactId,
      kind: "screenshot",
      name: message.name,
      mediaType: "image/png",
      data: blob,
      createdAt: message.createdAt
    });
    return { ok: true, artifact: toArtifactReference(stored) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function collectAndStoreDeepEvidence(
  message: DeepCaptureRequest,
  sender: Browser.runtime.MessageSender,
  store: CaptureProjectStore
): Promise<DeepCaptureResponse> {
  if (!browser.runtime.getManifest().permissions?.includes("debugger")) {
    return { ok: true, available: false };
  }
  if (!sender.tab?.id) return { ok: false, error: "The recorded tab is unavailable for deep capture." };

  const tabId = sender.tab.id;
  const protocolEvents: CdpProtocolEvent[] = [];
  const onEvent = (source: Browser.debugger.Debuggee, method: string, params?: object) => {
    if (source.tabId !== tabId || (!method.startsWith("Animation.") && method !== "CSS.styleSheetAdded")) return;
    protocolEvents.push({ method, params: params && typeof params === "object" ? params as Record<string, unknown> : {} });
  };
  browser.debugger.onEvent.addListener(onEvent);

  try {
    const captures = await withCdpSession(createChromeDebuggerTransport(), tabId, (command) => captureCdpScenes(command, {
      phase: message.phase,
      viewports: message.viewports,
      states: message.states,
      stateTargets: message.stateTargets,
      nodes: message.nodes,
      captureCanvas: message.captureCanvas === true
    }, protocolEvents, async (enabled) => {
      const response = await browser.tabs.sendMessage(tabId, { type: "DESIGN_LENS_SET_CAPTURE_PRIVACY_MASK", enabled }) as { ok?: boolean; error?: string } | undefined;
      if (!response?.ok) throw new Error(response?.error ?? "The page privacy mask could not be updated.");
    }), 8000);
    const rawCaptures = captures.filter((capture) => capture.raw).map((capture) => capture.raw!);
    const styles = rawCaptures.flatMap((raw) => raw.styles);
    const animations = uniqueBy(rawCaptures.flatMap((raw) => raw.animations), (animation) => `${animation.sceneId ?? "unknown"}|${animation.id}`);
    const motionCheckpoints = captures.flatMap((capture) => capture.motionCheckpoints?.map((checkpoint) => checkpoint.evidence) ?? []);
    const canvasFrames = captures.flatMap((capture) => capture.canvasFrames?.map((frame) => frame.evidence) ?? []);
    const page = rawCaptures[0]?.page ?? {};
    const errors = [
      ...rawCaptures.flatMap((raw) => raw.errors),
      ...captures.flatMap((capture) => capture.scene.error ? [capture.scene.error] : [])
    ];
    const artifactInputs: Array<Parameters<CaptureProjectStore["putArtifact"]>[0]> = [];
    for (const capture of captures) {
      if (capture.screenshotBase64) {
        const artifactId = `cdp-screenshot-${capture.scene.id}`;
        capture.scene.screenshotArtifactId = artifactId;
        artifactInputs.push({
          projectId: message.storageProjectId,
          artifactId,
          kind: "screenshot",
          name: `screenshots/${capture.scene.id}.png`,
          mediaType: "image/png",
          data: decodeBase64(capture.screenshotBase64),
          createdAt: capture.scene.capturedAt ?? message.createdAt
        });
      }
      if (capture.raw?.snapshot !== undefined) {
        const snapshotArtifactId = `cdp-dom-snapshot-${capture.scene.id}`;
        capture.scene.domSnapshotArtifactId = snapshotArtifactId;
        artifactInputs.push({
          projectId: message.storageProjectId,
          artifactId: snapshotArtifactId,
          kind: "dom-snapshot",
          name: `raw/cdp-dom-snapshot-${capture.scene.id}.json`,
          mediaType: "application/json",
          data: JSON.stringify(sanitizeDomSnapshot(capture.raw.snapshot)),
          createdAt: capture.scene.capturedAt ?? message.createdAt
        });
      }
      for (const checkpoint of capture.motionCheckpoints ?? []) {
        if (!checkpoint.screenshotBase64) continue;
        const artifactId = `cdp-motion-${checkpoint.evidence.id}`;
        checkpoint.evidence.screenshotArtifactId = artifactId;
        artifactInputs.push({
          projectId: message.storageProjectId,
          artifactId,
          kind: "screenshot",
          name: `screenshots/motion/${checkpoint.evidence.id}.png`,
          mediaType: "image/png",
          data: decodeBase64(checkpoint.screenshotBase64),
          createdAt: checkpoint.evidence.capturedAt ?? message.createdAt
        });
      }
      for (const frame of capture.canvasFrames ?? []) {
        if (!frame.pngBase64 || frame.evidence.status !== "readable") continue;
        const artifactId = `cdp-canvas-${frame.evidence.id}`;
        frame.evidence.artifactId = artifactId;
        artifactInputs.push({
          projectId: message.storageProjectId,
          artifactId,
          kind: "canvas-frame",
          name: `canvas/${frame.evidence.id}.png`,
          mediaType: "image/png",
          data: decodeBase64(frame.pngBase64),
          createdAt: frame.evidence.capturedAt ?? message.createdAt
        });
      }
    }
    if (rawCaptures.length) {
      artifactInputs.push({
        projectId: message.storageProjectId,
        artifactId: `cdp-style-evidence-${message.phase}`,
        kind: "style",
        name: `raw/cdp-style-evidence-${message.phase}.json`,
        mediaType: "application/json",
        data: JSON.stringify({ styles, animations, motionCheckpoints, canvasFrames, page, errors }),
        createdAt: message.createdAt
      });
    }
    const storedArtifacts = await storeArtifactsAtomically(store, artifactInputs);
    const artifacts = storedArtifacts.map(toArtifactReference);
    return {
      ok: true,
      available: true,
      evidence: {
        version: 1,
        protocolVersion: "1.3",
        sceneId: captures[0]?.scene.id ?? message.sceneId,
        capturedAt: message.createdAt,
        requestedNodeCount: message.nodes.length,
        capturedNodeCount: Math.max(0, ...rawCaptures.map((raw) => raw.styles.length)),
        artifacts,
        scenes: captures.map((capture) => capture.scene),
        styles,
        animations,
        ...(canvasFrames.length ? { canvasFrames } : {}),
        motionCheckpoints,
        page,
        errors
      }
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    browser.debugger.onEvent.removeListener(onEvent);
  }
}

async function storeArtifactsAtomically(store: CaptureProjectStore, inputs: Array<Parameters<CaptureProjectStore["putArtifact"]>[0]>) {
  const storedArtifacts = await Promise.allSettled(inputs.map((input) => store.putArtifact(input)));
  const failedWrite = storedArtifacts.find((result) => result.status === "rejected");
  if (failedWrite) {
    await Promise.all(storedArtifacts.flatMap((result) => result.status === "fulfilled"
      ? [store.deleteArtifact(result.value.projectId, result.value.artifactId)]
      : []));
    throw failedWrite.reason;
  }
  return storedArtifacts.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createChromeDebuggerTransport(): CdpTransport {
  const detachListeners = new Map<(target: { tabId: number }, reason: string) => void, (source: Browser.debugger.Debuggee, reason: "canceled_by_user" | "target_closed") => void>();
  return {
    attach: (target, protocolVersion) => browser.debugger.attach(target, protocolVersion),
    detach: (target) => browser.debugger.detach(target),
    async sendCommand<T = unknown>(target: { tabId: number }, method: string, params?: Record<string, unknown>) {
      return await browser.debugger.sendCommand(target, method, params) as T;
    },
    onDetach: {
      addListener(listener) {
        const wrapped = (source: Browser.debugger.Debuggee, reason: "canceled_by_user" | "target_closed") => {
          if (source.tabId !== undefined) listener({ tabId: source.tabId }, reason);
        };
        detachListeners.set(listener, wrapped);
        browser.debugger.onDetach.addListener(wrapped);
      },
      removeListener(listener) {
        const wrapped = detachListeners.get(listener);
        if (!wrapped) return;
        browser.debugger.onDetach.removeListener(wrapped);
        detachListeners.delete(listener);
      }
    }
  };
}

async function storeRrwebArtifact(
  message: Extract<ArtifactStorageRequest, { type: "DESIGN_LENS_STORE_RRWEB_ARTIFACT" }>,
  store: CaptureProjectStore
): Promise<ArtifactStorageResponse> {
  try {
    const stored = await store.putArtifact({
      projectId: message.storageProjectId,
      artifactId: message.artifactId,
      kind: "rrweb",
      name: message.name,
      mediaType: "application/json",
      data: message.content,
      createdAt: message.createdAt
    });
    return { ok: true, artifact: toArtifactReference(stored) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function toArtifactReference(artifact: StoredArtifact) {
  return {
    id: artifact.artifactId,
    kind: artifact.kind as "screenshot" | "rrweb" | "dom-snapshot" | "style",
    name: artifact.name,
    mediaType: artifact.mediaType,
    size: artifact.size,
    createdAt: artifact.createdAt
  };
}

function isInjectableUrl(url?: string) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}
