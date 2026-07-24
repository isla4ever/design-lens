import { analyzeDesign } from "../core/analysis";
import { detectComponent, extractLayout } from "../layout/component-detector";
import { buildSelector, isCaptureNoiseElement, isVisibleElement } from "../core/dom-utils";
import { detectInteraction } from "./interaction-detector";
import { collectImplementationTrace } from "./implementation-trace";
import { buildLayoutProfile } from "../layout/layout-profiler";
import { detectMotion } from "./motion-detector";
import { extractTokens } from "../core/tokenize";
import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n";
import type { CaptureResponse } from "../../shared/messages";
import type { CaptureEvidence, ComponentSpec, DesignCapture, InteractionSpec, LayoutSpec, MotionSpec } from "../../shared/schema";

const MAX_ELEMENTS = 260;
const MAX_SCANNED_NODES = 8000;
const MAX_SEMANTIC_CANDIDATES = 320;
const SCAN_SLICE_BUDGET_MS = 6;
const MAX_FULL_CAPTURE_DOM_NODES = 50_000;
const SEMANTIC_SELECTOR = [
  "main",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "form",
  "h1",
  "h2",
  "h3",
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "img",
  "video",
  "[role]",
  "[tabindex]",
  "[aria-label]",
  "[class*='nav' i]",
  "[class*='menu' i]",
  "[class*='hero' i]",
  "[class*='card' i]",
  "[class*='work' i]",
  "[class*='project' i]",
  "[class*='button' i]",
  "[class*='btn' i]",
  "[class*='cta' i]",
  "[class*='ticker' i]",
  "[class*='marquee' i]"
].join(",");

export async function capturePageDesign(doc: Document, win: Window, root: ParentNode = doc.body, locale: Locale = DEFAULT_LOCALE): Promise<CaptureResponse> {
  const rootElement = root instanceof Element ? root : doc.body;
  const scope: NonNullable<DesignCapture["scope"]> = rootElement === doc.body || rootElement === doc.documentElement ? "page" : "component";
  const domNodeCount = rootElement.getElementsByTagName("*").length + 1;
  if (domNodeCount > MAX_FULL_CAPTURE_DOM_NODES) return buildBudgetLimitedCapture(doc, win, scope, locale, domNodeCount);
  const allVisible = await collectVisibleElements(doc, rootElement, win);
  const semantic = allVisible.filter((element) => isSemanticElement(element));
  const semanticEvidence = Array.from(root.querySelectorAll(SEMANTIC_SELECTOR)).slice(0, MAX_SEMANTIC_CANDIDATES).filter(
    (element) => !isCaptureNoiseElement(element) && hasSemanticEvidence(element)
  );
  const byArea = (await scoreElements(allVisible, win)).sort((a, b) => b.score - a.score).map((item) => item.element);
  const elements = uniqueElements([...semantic, ...byArea, ...semanticEvidence]).slice(0, MAX_ELEMENTS);
  const samples = await collectElementSamples(elements, win);

  const components: ComponentSpec[] = [];
  const motion: MotionSpec[] = [];
  const layout: LayoutSpec[] = [];
  const interactions: InteractionSpec[] = [];
  const evidence: CaptureEvidence[] = [];

  let analysisSliceStartedAt = win.performance.now();
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!sample) continue;
    const rect = sample.element.getBoundingClientRect();
    const layoutSpec = extractLayout(sample.style, rect);
    if (layout.length < 32 && ["flex", "grid", "block"].includes(layoutSpec.display)) {
      layout.push(layoutSpec);
    }

    const component = detectComponent(sample.element, sample.selector, sample.style);
    if (component && !components.some((item) => item.selector === component.selector || item.name === component.name && item.textSample === component.textSample)) {
      components.push(component);
      evidence.push({
        selector: sample.selector,
        reason: `Detected ${component.name}`,
        properties: component.visual
      });
    }

    motion.push(...detectMotion(sample.element, sample.selector, sample.style));

    const interaction = detectInteraction(sample.element, sample.selector, sample.style);
    if (interaction && !interactions.some((item) => item.selector === interaction.selector && item.trigger === interaction.trigger)) {
      interactions.push(interaction);
    }
    if ((index + 1) % 24 === 0 && win.performance.now() - analysisSliceStartedAt >= SCAN_SLICE_BUDGET_MS) {
      await yieldToBrowser(win);
      analysisSliceStartedAt = win.performance.now();
    }
  }

  for (const component of await inferSemanticComponents(doc, rootElement, win)) {
    if (!components.some((item) => item.selector === component.selector || item.name === component.name && item.textSample === component.textSample)) {
      components.push(component);
    }
  }

  for (const interaction of await inferSemanticInteractions(doc, rootElement, win)) {
    if (!interactions.some((item) => item.selector === interaction.selector && item.trigger === interaction.trigger)) {
      interactions.push(interaction);
    }
  }

  const captureWithoutAnalysis = {
    scope,
    page: {
      title: doc.title || "Untitled page",
      url: win.location.href,
      capturedAt: new Date().toISOString()
    },
    viewport: {
      width: win.innerWidth,
      height: win.innerHeight,
      devicePixelRatio: win.devicePixelRatio
    },
    tokens: extractTokens(samples),
    layout,
    layoutProfile: buildLayoutProfile(layout, win.innerWidth),
    components: components.slice(0, 32),
    motion: dedupeMotion(motion).slice(0, 32),
    interactions: interactions.slice(0, 32),
    evidence: evidence.slice(0, 40),
    implementationTrace: collectImplementationTrace(doc, win)
  } satisfies Omit<DesignCapture, "analysis">;

  return {
    ok: true,
    capture: {
      ...captureWithoutAnalysis,
      analysis: analyzeDesign(captureWithoutAnalysis, locale)
    }
  };
}

function buildBudgetLimitedCapture(doc: Document, win: Window, scope: NonNullable<DesignCapture["scope"]>, locale: Locale, domNodeCount: number): CaptureResponse {
  const captureWithoutAnalysis = {
    scope,
    page: {
      title: doc.title || "Untitled page",
      url: win.location.href,
      capturedAt: new Date().toISOString()
    },
    viewport: {
      width: win.innerWidth,
      height: win.innerHeight,
      devicePixelRatio: win.devicePixelRatio
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
    layoutProfile: buildLayoutProfile([], win.innerWidth),
    components: [],
    motion: [],
    interactions: [],
    evidence: [{
      selector: scope === "component" ? "selected-component" : "document",
      reason: "Capture reduced to protect page responsiveness",
      properties: {
        domNodeCount: String(domNodeCount),
        safetyLimit: String(MAX_FULL_CAPTURE_DOM_NODES)
      }
    }],
    implementationTrace: collectImplementationTrace(doc, win)
  } satisfies Omit<DesignCapture, "analysis">;

  return {
    ok: true,
    capture: {
      ...captureWithoutAnalysis,
      analysis: analyzeDesign(captureWithoutAnalysis, locale)
    }
  };
}

function area(element: Element) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function scoreElement(element: Element, win: Window) {
  const rect = element.getBoundingClientRect();
  const visibleArea = Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0));
  const semanticBonus = isSemanticElement(element) ? win.innerWidth * 80 : 0;
  const interactionBonus = element.matches("a[href], button, input, textarea, select, [role], [tabindex]") ? win.innerWidth * 60 : 0;
  return visibleArea + semanticBonus + interactionBonus;
}

async function scoreElements(elements: Element[], win: Window) {
  const scored: Array<{ element: Element; score: number }> = [];
  let sliceStartedAt = win.performance.now();
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (element) scored.push({ element, score: scoreElement(element, win) });
    if ((index + 1) % 48 === 0 && win.performance.now() - sliceStartedAt >= SCAN_SLICE_BUDGET_MS) {
      await yieldToBrowser(win);
      sliceStartedAt = win.performance.now();
    }
  }
  return scored;
}

async function collectElementSamples(elements: Element[], win: Window) {
  const samples: Array<{ element: Element; selector: string; style: CSSStyleDeclaration }> = [];
  let sliceStartedAt = win.performance.now();
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (element) samples.push({ element, selector: buildSelector(element), style: win.getComputedStyle(element) });
    if ((index + 1) % 24 === 0 && win.performance.now() - sliceStartedAt >= SCAN_SLICE_BUDGET_MS) {
      await yieldToBrowser(win);
      sliceStartedAt = win.performance.now();
    }
  }
  return samples;
}

function isSemanticElement(element: Element) {
  return element.matches(SEMANTIC_SELECTOR);
}

async function collectVisibleElements(doc: Document, root: Element, win: Window) {
  const visible: Element[] = [];
  const walker = doc.createTreeWalker(root, 1);
  let current: Node | null = root;
  let scanned = 0;
  let sliceStartedAt = win.performance.now();

  while (current && scanned < MAX_SCANNED_NODES) {
    if (current instanceof Element && isVisibleElement(current, win)) visible.push(current);
    scanned += 1;
    current = walker.nextNode();
    if (scanned % 64 === 0 && win.performance.now() - sliceStartedAt >= SCAN_SLICE_BUDGET_MS) {
      await yieldToBrowser(win);
      sliceStartedAt = win.performance.now();
    }
  }

  return visible;
}

function yieldToBrowser(win: Window) {
  return new Promise<void>((resolve) => {
    const idleWindow = win as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }
    win.setTimeout(resolve, 0);
  });
}

function uniqueElements(elements: Element[]) {
  const seen = new Set<Element>();
  const result: Element[] = [];
  for (const element of elements) {
    if (seen.has(element)) continue;
    seen.add(element);
    result.push(element);
  }
  return result;
}

function dedupeMotion(motion: MotionSpec[]) {
  const seen = new Set<string>();
  return motion.filter((item) => {
    const key = `${item.selector}-${item.type}-${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function inferSemanticComponents(doc: Document, root: Element, win: Window): Promise<ComponentSpec[]> {
  const components: ComponentSpec[] = [];
  const candidates = uniqueElements([
    ...Array.from(root.querySelectorAll("nav, header, main, section, article, form, h1, h2, h3")),
    ...Array.from(root.querySelectorAll("[class*='hero' i], [class*='work' i], [class*='project' i], [class*='contact' i], [class*='form' i], [class*='menu' i]"))
  ]).slice(0, MAX_SEMANTIC_CANDIDATES).filter((element) => !isCaptureNoiseElement(element) && (isVisibleElement(element, win) || hasSemanticEvidence(element)));

  const selected = candidates.slice(0, 48);
  let sliceStartedAt = win.performance.now();
  for (let index = 0; index < selected.length; index += 1) {
    const element = selected[index];
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    const style = win.getComputedStyle(element);
    const selector = buildSelector(element);
    const name = semanticComponentName(element, doc);
    if (!name) continue;
    components.push({
      id: semanticId(selector, name),
      name,
      selector,
      tagName: element.tagName.toLowerCase(),
      confidence: semanticConfidence(name),
      textSample: cleanSemanticText(element),
      layout: extractLayout(style, rect),
      visual: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        font: `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        border: style.border
      }
    });
    if ((index + 1) % 16 === 0 && win.performance.now() - sliceStartedAt >= SCAN_SLICE_BUDGET_MS) {
      await yieldToBrowser(win);
      sliceStartedAt = win.performance.now();
    }
  }

  return components;
}

async function inferSemanticInteractions(doc: Document, root: Element, win: Window): Promise<InteractionSpec[]> {
  const interactions: InteractionSpec[] = [];
  const candidates = Array.from(root.querySelectorAll("a[href], button, input, textarea, select, [role='button'], [role='link'], [tabindex], [aria-expanded], [aria-controls]"))
    .slice(0, MAX_SEMANTIC_CANDIDATES)
    .filter((element) => !isCaptureNoiseElement(element) && (isVisibleElement(element, win) || hasSemanticEvidence(element)));

  const selected = candidates.slice(0, 80);
  let sliceStartedAt = win.performance.now();
  for (let index = 0; index < selected.length; index += 1) {
    const element = selected[index];
    if (!element) continue;
    const selector = buildSelector(element);
    const style = win.getComputedStyle(element);
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role") ?? "";
    const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") ?? "" : "";
    const trigger = tag === "input" || tag === "textarea" || tag === "select" ? "input" : tag === "a" || role === "link" ? "navigation" : "click";
    const affordance = tag === "a" ? (href.startsWith("mailto:") ? "contact link" : "navigation link") : tag === "input" || tag === "textarea" || tag === "select" ? "data entry" : "command control";
    const stateSignals = [
      element.getAttribute("aria-expanded") ? `aria-expanded=${element.getAttribute("aria-expanded")}` : "",
      element.getAttribute("aria-controls") ? `aria-controls=${element.getAttribute("aria-controls")}` : "",
      element.hasAttribute("required") ? "required field" : "",
      href ? `href ${href.startsWith("http") ? "external/internal navigation" : href.split(":")[0] || "path"}` : "",
      style.transitionProperty !== "all" ? `transition ${style.transitionProperty}` : "transition all"
    ].filter(Boolean);

    interactions.push({
      id: semanticId(selector, trigger),
      selector,
      trigger,
      affordance,
      cursor: style.cursor,
      role,
      stateSignals,
      transitionProperties: style.transitionProperty.split(",").map((item) => item.trim()).filter(Boolean)
    });
    if ((index + 1) % 20 === 0 && win.performance.now() - sliceStartedAt >= SCAN_SLICE_BUDGET_MS) {
      await yieldToBrowser(win);
      sliceStartedAt = win.performance.now();
    }
  }

  return interactions;
}

function semanticComponentName(element: Element, doc: Document) {
  const tag = element.tagName.toLowerCase();
  const className = String(element.className || "").toLowerCase();
  if (tag === "nav" || className.includes("nav") || className.includes("menu")) return "Navigation";
  if (tag === "form" || className.includes("form") || className.includes("contact")) return "Form Flow";
  if (tag === "main" || className.includes("hero") || element.querySelector("h1")) return "Hero Section";
  if (className.includes("work") || className.includes("project") || className.includes("case")) return "Project/Work Tile";
  if (className.includes("ticker") || className.includes("marquee") || className.includes("slider")) return "Ticker/Marquee";
  if (["section", "article"].includes(tag)) return "Section";
  if (["h1", "h2", "h3"].includes(tag)) return "Heading System";
  if (element === doc.body) return null;
  return null;
}

function hasSemanticEvidence(element: Element) {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return false;
  const tag = element.tagName.toLowerCase();
  const className = String(element.className || "").toLowerCase();
  const text = cleanSemanticText(element);
  const hasMeaningfulClass = ["nav", "menu", "hero", "work", "project", "contact", "form", "button", "link"].some((item) => className.includes(item));
  return text.length > 0 || hasMeaningfulClass || ["main", "section", "article", "header", "footer", "nav", "form", "a", "button", "input", "textarea", "select", "h1", "h2", "h3"].includes(tag);
}

function semanticConfidence(name: string) {
  if (["Navigation", "Form Flow", "Hero Section"].includes(name)) return 88;
  if (name === "Project/Work Tile") return 82;
  if (name === "Heading System") return 76;
  return 72;
}

function cleanSemanticText(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function semanticId(selector: string, name: string) {
  let result = 0;
  const value = `${selector}-${name}`;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return `sem_${Math.abs(result).toString(36)}`;
}
