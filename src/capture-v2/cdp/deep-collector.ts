import type { CanvasFrameEvidence, DeepAnimationEvidence, DeepStyleEvidence } from "../core/rebuild-evidence";
import type { CdpCommand } from "./cdp-session";

export type DeepCaptureNodeRequest = { nodeId: string; selector: string };
export type CdpProtocolEvent = { method: string; params: Record<string, unknown> };

export type RawDeepCapture = {
  snapshot?: unknown;
  styles: DeepStyleEvidence[];
  animations: DeepAnimationEvidence[];
  page: {
    frameId?: string;
    loaderId?: string;
    layoutViewport?: { pageX: number; pageY: number; clientWidth: number; clientHeight: number };
    contentSize?: { x: number; y: number; width: number; height: number };
  };
  errors: string[];
};

export type CanvasFrameCapture = { evidence: CanvasFrameEvidence; pngBase64?: string };

const MAX_CANVAS_COUNT = 4;
const MAX_CANVAS_AREA = 2_000_000;
const MAX_CANVAS_DIMENSION = 2048;
const MAX_CANVAS_ARTIFACT_BYTES = 8 * 1024 * 1024;

export async function collectCanvasFrames(command: CdpCommand, sceneId: string, capturedAt = new Date().toISOString()): Promise<CanvasFrameCapture[]> {
  const result = await command<{ result?: { value?: unknown } }>("Runtime.evaluate", {
    expression: `(() => {
      const maxCount = ${MAX_CANVAS_COUNT};
      const maxArea = ${MAX_CANVAS_AREA};
      const maxDimension = ${MAX_CANVAS_DIMENSION};
      const maxArtifactBytes = ${MAX_CANVAS_ARTIFACT_BYTES};
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const selectorFor = (element) => {
        if (element.id) return "#" + CSS.escape(element.id);
        const parts = [];
        let current = element;
        while (current && current.nodeType === 1 && parts.length < 8) {
          const tag = current.tagName.toLowerCase();
          let index = 1;
          let sibling = current;
          while ((sibling = sibling.previousElementSibling)) if (sibling.tagName === current.tagName) index++;
          parts.unshift(tag + ":nth-of-type(" + index + ")");
          current = current.parentElement;
        }
        return parts.join(" > ");
      };
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return { rect, visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth };
      };
      const frames = [];
      let remaining = maxArea;
      for (let index = 0; index < canvases.length && frames.length < maxCount; index++) {
        const canvas = canvases[index];
        const { rect, visible: isVisible } = visible(canvas);
        const width = Number(canvas.width) || 0;
        const height = Number(canvas.height) || 0;
        const base = { index, selector: selectorFor(canvas), width, height, cssWidth: Math.round(rect.width * 100) / 100, cssHeight: Math.round(rect.height * 100) / 100 };
        if (!isVisible || width < 1 || height < 1) continue;
        const area = width * height;
        if (area > remaining || area > maxArea) {
          frames.push({ ...base, status: "skipped", error: "Canvas exceeds the bounded pixel-area budget." });
          continue;
        }
        const scale = Math.min(1, Math.sqrt(remaining / area), maxDimension / width, maxDimension / height);
        try {
          let dataUrl;
          if (scale < 0.999) {
            const target = document.createElement("canvas");
            target.width = Math.max(1, Math.floor(width * scale));
            target.height = Math.max(1, Math.floor(height * scale));
            const context = target.getContext("2d");
            if (!context) throw new Error("A readable 2D context was unavailable for scaling.");
            context.drawImage(canvas, 0, 0, target.width, target.height);
            dataUrl = target.toDataURL("image/png");
          } else {
            dataUrl = canvas.toDataURL("image/png");
          }
          if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) throw new Error("Canvas did not return a PNG data URL.");
          const estimatedBytes = Math.floor((dataUrl.length - "data:image/png;base64,".length) * 0.75);
          if (estimatedBytes > maxArtifactBytes) {
            frames.push({ ...base, status: "skipped", scale: Math.round(scale * 1000) / 1000, error: "Canvas PNG exceeds the bounded artifact-size budget." });
            continue;
          }
          const context = canvas.getContext("2d") ? "2d" : "unknown";
          frames.push({ ...base, status: "readable", scale: Math.round(scale * 1000) / 1000, context, dataUrl });
          remaining -= Math.min(remaining, Math.floor(width * scale) * Math.floor(height * scale));
        } catch (error) {
          const message = error && typeof error.message === "string" ? error.message : String(error);
          const isTainted = error && (error.name === "SecurityError" || /taint|origin-clean|cross-origin/i.test(message));
          // Do not create a new WebGL context while probing an unreadable surface.
          // Unknown context is deliberately reported as requires-companion (for example WebGL/OffscreenCanvas).
          const context = "unknown";
          frames.push({ ...base, status: isTainted ? "tainted" : context === "webgl" || context === "unknown" ? "requires-companion" : "unavailable", context, error: message.slice(0, 240) });
        }
      }
      return frames;
    })()` ,
    returnByValue: true,
    awaitPromise: false
  });
  const values = Array.isArray(result.result?.value) ? result.result.value : [];
  return values.flatMap((value) => {
    if (!isObject(value) || typeof value.selector !== "string" || typeof value.index !== "number") return [];
    const evidence: CanvasFrameEvidence = {
      id: `${sceneId}-canvas-${value.index}`,
      sceneId,
      selector: value.selector,
      index: value.index,
      width: numberOrZero(value.width),
      height: numberOrZero(value.height),
      cssWidth: numberOrZero(value.cssWidth),
      cssHeight: numberOrZero(value.cssHeight),
      status: isCanvasStatus(value.status) ? value.status : "unavailable",
      ...(typeof value.scale === "number" ? { scale: value.scale } : {}),
      ...(isCanvasContext(value.context) ? { context: value.context } : {}),
      capturedAt,
      ...(typeof value.error === "string" ? { error: value.error } : {})
    };
    const dataUrl = typeof value.dataUrl === "string" && value.dataUrl.startsWith("data:image/png;base64,") ? value.dataUrl.slice("data:image/png;base64,".length) : undefined;
    return [{ evidence, ...(dataUrl ? { pngBase64: dataUrl } : {}) }];
  });
}

function isCanvasStatus(value: unknown): value is CanvasFrameEvidence["status"] {
  return value === "readable" || value === "tainted" || value === "unavailable" || value === "skipped" || value === "requires-companion";
}

function isCanvasContext(value: unknown): value is NonNullable<CanvasFrameEvidence["context"]> {
  return value === "2d" || value === "webgl" || value === "unknown";
}

const COMPUTED_STYLE_PROPERTIES = [
  "display", "position", "box-sizing", "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "color", "background-color", "background-image",
  "border", "border-radius", "box-shadow", "opacity", "transform", "transform-origin", "filter", "backdrop-filter", "clip-path",
  "overflow", "z-index", "gap", "grid-template-columns", "grid-template-rows", "flex-direction", "align-items", "justify-content",
  "aspect-ratio", "object-fit", "transition", "transition-property", "transition-duration", "transition-timing-function",
  "animation", "animation-name", "animation-duration", "animation-timing-function"
] as const;
const COMPUTED_STYLE_SET = new Set<string>(COMPUTED_STYLE_PROPERTIES);

export async function collectDeepCdpEvidence(
  command: CdpCommand,
  nodes: DeepCaptureNodeRequest[],
  protocolEvents: CdpProtocolEvent[],
  options: { sceneId?: string; pseudoStates?: string[]; captureSnapshot?: boolean } = {}
): Promise<RawDeepCapture> {
  await command("Page.enable");
  await command("DOM.enable");
  await command("CSS.enable");
  await enableOptionalAnimationDomain(command);

  const frameBefore = await command<Record<string, unknown>>("Page.getFrameTree");
  const documentResult = await command<{ root?: { nodeId?: number } }>("DOM.getDocument", { depth: -1, pierce: true });
  const rootNodeId = documentResult.root?.nodeId;
  if (!rootNodeId) throw new Error("CDP DOM.getDocument did not return a root node");

  const snapshot = options.captureSnapshot === false ? undefined : await command("DOMSnapshot.captureSnapshot", {
      computedStyles: [...COMPUTED_STYLE_PROPERTIES],
      includePaintOrder: true,
      includeDOMRects: true,
      includeBlendedBackgroundColors: true,
      includeTextColorOpacities: true
    });
  const layout = await command<Record<string, unknown>>("Page.getLayoutMetrics");
  const styles: DeepStyleEvidence[] = [];
  const errors: string[] = [];

  for (const request of uniqueNodes(nodes).slice(0, 24)) {
    try {
      const query = await command<{ nodeId?: number }>("DOM.querySelector", { nodeId: rootNodeId, selector: request.selector });
      if (!query.nodeId) continue;
      const [description, computedResult, matchedResult, boxResult] = await Promise.all([
        command<{ node?: { backendNodeId?: number; nodeName?: string } }>("DOM.describeNode", { nodeId: query.nodeId, depth: 0 }),
        command<{ computedStyle?: Array<{ name?: string; value?: string }> }>("CSS.getComputedStyleForNode", { nodeId: query.nodeId }),
        command<Record<string, unknown>>("CSS.getMatchedStylesForNode", { nodeId: query.nodeId }),
        command<{ model?: { border?: number[] } }>("DOM.getBoxModel", { nodeId: query.nodeId }).catch((): { model?: { border?: number[] } } => ({}))
      ]);
      const allComputed = toDeclarationRecord(computedResult.computedStyle ?? [], true);
      styles.push({
        nodeId: request.nodeId,
        selector: request.selector,
        ...(options.sceneId ? { sceneId: options.sceneId } : {}),
        ...(options.pseudoStates?.length ? { pseudoStates: options.pseudoStates } : {}),
        ...(description.node?.backendNodeId ? { backendNodeId: description.node.backendNodeId } : {}),
        ...(description.node?.nodeName ? { tagName: description.node.nodeName.toLowerCase() } : {}),
        computed: Object.fromEntries(Object.entries(allComputed).filter(([name]) => COMPUTED_STYLE_SET.has(name))),
        cssVariables: Object.fromEntries(Object.entries(allComputed).filter(([name]) => name.startsWith("--")).slice(0, 128)),
        matchedRules: normalizeMatchedRules(matchedResult, protocolEvents),
        ...(boxResult.model?.border ? { rect: quadToRect(boxResult.model.border) } : {})
      });
    } catch (error) {
      errors.push(`${request.selector}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const frameAfter = await command<Record<string, unknown>>("Page.getFrameTree");
  const before = mainFrame(frameBefore);
  const after = mainFrame(frameAfter);
  if (before.loaderId && after.loaderId && before.loaderId !== after.loaderId) {
    throw new Error("The page navigated while deep evidence was being captured");
  }

  const layoutViewport = isLayoutViewport(layout.cssLayoutViewport) ? layout.cssLayoutViewport : isLayoutViewport(layout.layoutViewport) ? layout.layoutViewport : undefined;
  const contentSize = isContentSize(layout.cssContentSize) ? layout.cssContentSize : isContentSize(layout.contentSize) ? layout.contentSize : undefined;
  return {
    ...(snapshot !== undefined ? { snapshot } : {}),
    styles,
    animations: normalizeAnimationEvents(protocolEvents, styles, options.sceneId),
    page: {
      ...after,
      ...(layoutViewport ? { layoutViewport } : {}),
      ...(contentSize ? { contentSize } : {})
    },
    errors
  };
}

async function enableOptionalAnimationDomain(command: CdpCommand) {
  try {
    await command("Animation.enable");
  } catch (error) {
    if (!isUnsupportedCdpMethod(error)) throw error;
  }
}

function isUnsupportedCdpMethod(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === -32601) return true;
    if (typeof candidate.message === "string" && /wasn't found|method not found/i.test(candidate.message)) return true;
  }
  return /wasn't found|method not found|\"code\"\s*:\s*-32601/i.test(error instanceof Error ? error.message : String(error));
}

function normalizeMatchedRules(value: Record<string, unknown>, events: CdpProtocolEvent[]) {
  const entries = [
    ...(Array.isArray(value.matchedCSSRules) ? value.matchedCSSRules : []),
    ...collectNestedRules(value.inherited),
    ...collectPseudoRules(value.pseudoElements)
  ];
  const rules = entries.flatMap((entry) => {
    if (!isObject(entry) || !isObject(entry.rule)) return [];
    const rule = entry.rule;
    const selectorList = isObject(rule.selectorList) ? rule.selectorList : {};
    const style = isObject(rule.style) ? rule.style : {};
    const selector = typeof selectorList.text === "string" ? selectorList.text.slice(0, 2000) : "";
    if (!selector) return [];
    const declarations = toDeclarationRecord(Array.isArray(style.cssProperties) ? style.cssProperties : [], false);
    const styleSheetId = typeof rule.styleSheetId === "string" ? rule.styleSheetId : undefined;
    const sourceUrl = styleSheetId ? styleSheetSource(events, styleSheetId) : undefined;
    return [{
      selector,
      declarations,
      ...(typeof rule.origin === "string" ? { origin: rule.origin } : {}),
      ...(styleSheetId ? { styleSheetId } : {}),
      ...(sourceUrl ? { sourceUrl } : {})
    }];
  });
  for (const [label, candidate] of [["element.style", value.inlineStyle], ["presentational attributes", value.attributesStyle]] as const) {
    if (!isObject(candidate)) continue;
    const declarations = toDeclarationRecord(Array.isArray(candidate.cssProperties) ? candidate.cssProperties : [], false);
    if (Object.keys(declarations).length) rules.push({ selector: label, declarations, origin: "inline" });
  }
  return rules.slice(0, 96);
}

function toDeclarationRecord(properties: unknown[], includeAll: boolean) {
  const result: Record<string, string> = {};
  for (const property of properties) {
    if (!isObject(property) || typeof property.name !== "string" || typeof property.value !== "string" || property.disabled === true) continue;
    if (!includeAll && !COMPUTED_STYLE_SET.has(property.name) && !property.name.startsWith("--")) continue;
    result[property.name] = `${sanitizeCssValue(property.value)}${property.important === true ? " !important" : ""}`;
  }
  return result;
}

function normalizeAnimationEvents(events: CdpProtocolEvent[], styles: DeepStyleEvidence[], sceneId?: string) {
  const seen = new Map<string, DeepAnimationEvidence>();
  for (const event of events) {
    if (event.method !== "Animation.animationStarted" && event.method !== "Animation.animationCreated") continue;
    const animation = isObject(event.params.animation) ? event.params.animation : event.params;
    if (typeof animation.id !== "string") continue;
    const source = isObject(animation.source) ? animation.source : {};
    const backendNodeId = typeof source.backendNodeId === "number" ? source.backendNodeId : undefined;
    const target = backendNodeId ? styles.find((style) => style.backendNodeId === backendNodeId) : undefined;
    const keyframesRule = isObject(source.keyframesRule) ? source.keyframesRule : {};
    const keyframes = Array.isArray(keyframesRule.keyframes)
      ? keyframesRule.keyframes.flatMap((keyframe) => isObject(keyframe) ? [{
          offset: typeof keyframe.offset === "string" ? keyframe.offset : "",
          easing: typeof keyframe.easing === "string" ? keyframe.easing : ""
        }] : [])
      : undefined;
    seen.set(animation.id, {
      id: animation.id,
      ...(sceneId ? { sceneId } : {}),
      ...(target?.nodeId ? { nodeId: target.nodeId } : {}),
      ...(target?.selector ? { selector: target.selector } : {}),
      ...(backendNodeId ? { backendNodeId } : {}),
      name: typeof animation.name === "string" && animation.name ? animation.name : "anonymous",
      type: typeof animation.type === "string" ? animation.type : "unknown",
      playState: typeof animation.playState === "string" ? animation.playState : "unknown",
      durationMs: numberOrZero(source.duration),
      delayMs: numberOrZero(source.delay),
      easing: typeof source.easing === "string" ? source.easing : "linear",
      ...(typeof source.iterations === "number" ? { iterationCount: source.iterations } : {}),
      ...(keyframes?.length ? { keyframes } : {})
    });
  }
  return Array.from(seen.values());
}

function collectNestedRules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => isObject(entry) && Array.isArray(entry.matchedCSSRules) ? entry.matchedCSSRules : []);
}

function collectPseudoRules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => isObject(entry) && Array.isArray(entry.matches) ? entry.matches : []);
}

function styleSheetSource(events: CdpProtocolEvent[], styleSheetId: string) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.method !== "CSS.styleSheetAdded" || !isObject(event.params.header)) continue;
    if (event.params.header.styleSheetId === styleSheetId && typeof event.params.header.sourceURL === "string" && event.params.header.sourceURL) {
      return sanitizeSourceUrl(event.params.header.sourceURL);
    }
  }
  return undefined;
}

function quadToRect(quad: number[]) {
  const xs = quad.filter((_value, index) => index % 2 === 0);
  const ys = quad.filter((_value, index) => index % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function uniqueNodes(nodes: DeepCaptureNodeRequest[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = `${node.nodeId}|${node.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(node.nodeId && node.selector);
  });
}

function mainFrame(value: Record<string, unknown>) {
  const tree = isObject(value.frameTree) ? value.frameTree : {};
  const frame = isObject(tree.frame) ? tree.frame : {};
  return {
    ...(typeof frame.id === "string" ? { frameId: frame.id } : {}),
    ...(typeof frame.loaderId === "string" ? { loaderId: frame.loaderId } : {})
  };
}

function isLayoutViewport(value: unknown): value is { pageX: number; pageY: number; clientWidth: number; clientHeight: number } {
  return isObject(value) && [value.pageX, value.pageY, value.clientWidth, value.clientHeight].every((item) => typeof item === "number");
}

function isContentSize(value: unknown): value is { x: number; y: number; width: number; height: number } {
  return isObject(value) && [value.x, value.y, value.width, value.height].every((item) => typeof item === "number");
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sanitizeCssValue(value: string) {
  if (/url\(\s*["']?data:/i.test(value) || /^data:/i.test(value)) return "[data-url omitted]";
  return value.slice(0, 2000);
}

function sanitizeSourceUrl(value: string) {
  if (/^data:/i.test(value)) return "data:[omitted]";
  if (/^blob:/i.test(value)) return "blob:[omitted]";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href.slice(0, 2000);
  } catch {
    return value.split(/[?#]/, 1)[0]?.slice(0, 2000) ?? "";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
