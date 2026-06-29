import { capturePageDesign } from "./capture-page";
import { isCaptureNoiseElement } from "../core/dom-utils";
import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n";
import type { CaptureResponse } from "../../shared/messages";

export function createElementPicker(getLocale: () => Locale = () => DEFAULT_LOCALE) {
  let hovered: Element | null = null;
  let selected: Element | null = null;
  let overlay: HTMLDivElement | null = null;
  let toolbar: HTMLDivElement | null = null;
  let lastHoverChangedAt = 0;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "pointer-events:none",
      "border:2px solid #c15a4a",
      "background:rgba(193,90,74,0.08)",
      "border-radius:6px",
      "box-shadow:0 0 0 9999px rgba(23,32,27,0.12)"
    ].join(";");
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function updateOverlay(element: Element | null) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (!isUsableRect(rect)) return;
    const target = ensureOverlay();
    target.style.left = `${rect.left}px`;
    target.style.top = `${rect.top}px`;
    target.style.width = `${rect.width}px`;
    target.style.height = `${rect.height}px`;
    updateToolbar(rect);
  }

  function ensureToolbar(onConfirm: () => void, onCancel: () => void) {
    if (toolbar) return toolbar;
    const locale = getLocale();
    toolbar = document.createElement("div");
    toolbar.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "pointer-events:auto",
      "display:flex",
      "gap:6px",
      "align-items:center",
      "padding:6px",
      "border:1px solid rgba(255,255,255,.18)",
      "border-radius:10px",
      "background:rgba(13,18,17,.92)",
      "box-shadow:0 16px 46px rgba(0,0,0,.32)",
      "font:600 12px Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "color:#fff9ec"
    ].join(";");
    toolbar.innerHTML = `
      <span style="padding:0 5px;color:#b9c5bd">${locale === "zh" ? "确认采集该范围" : "Capture this scope"}</span>
      <button data-design-lens-confirm style="${buttonStyle("#d7ff67", "#111713")}">${locale === "zh" ? "确定" : "Confirm"}</button>
      <button data-design-lens-cancel style="${buttonStyle("rgba(255,255,255,.08)", "#fff9ec")}">${locale === "zh" ? "取消" : "Cancel"}</button>
    `;
    toolbar.querySelector("[data-design-lens-confirm]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onConfirm();
    });
    toolbar.querySelector("[data-design-lens-cancel]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    });
    document.documentElement.appendChild(toolbar);
    return toolbar;
  }

  function updateToolbar(rect: DOMRect) {
    if (!toolbar) return;
    const top = Math.max(8, Math.min(window.innerHeight - 46, rect.bottom + 8));
    const left = Math.max(8, Math.min(window.innerWidth - 220, rect.left));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  async function start(): Promise<CaptureResponse> {
    return new Promise((resolve) => {
      let isResolving = false;
      const confirm = async () => {
        if (isResolving) return;
        isResolving = true;
        const target = selected ?? hovered ?? document.body;
        cleanup();
        resolve(await capturePageDesign(document, window, target, getLocale()));
      };

      const cancel = () => {
        if (isResolving) return;
        isResolving = true;
        cleanup();
        resolve({ ok: false, error: getLocale() === "zh" ? "已取消组件选取。" : "Component picking was cancelled." });
      };

      const onMove = (event: MouseEvent) => {
        if (selected) return;
        if (toolbar?.contains(event.target as Node)) return;
        if (hovered && isWithinConfirmationSafeZone(event.clientX, event.clientY, hovered, toolbar)) return;
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const nextHovered = element && !isCaptureNoiseElement(element) ? findCaptureRoot(element) : hovered;
        if (nextHovered !== hovered && performance.now() - lastHoverChangedAt < 120) return;
        if (nextHovered !== hovered) lastHoverChangedAt = performance.now();
        hovered = nextHovered;
        updateOverlay(hovered);
        if (hovered) ensureToolbar(() => void confirm(), cancel);
      };

      const cleanup = () => {
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("mousedown", onMouseDown, true);
        window.removeEventListener("keydown", onKeydown, true);
        overlay?.remove();
        toolbar?.remove();
        overlay = null;
        toolbar = null;
        hovered = null;
        selected = null;
        lastHoverChangedAt = 0;
      };

      const lockSelection = (event: MouseEvent | PointerEvent) => {
        if (toolbar?.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        const element = document.elementFromPoint(event.clientX, event.clientY);
        selected = hovered ?? (element && !isCaptureNoiseElement(element) ? findCaptureRoot(element) : null) ?? document.body;
        updateOverlay(selected);
        ensureToolbar(() => void confirm(), cancel);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        lockSelection(event);
      };

      const onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0 || selected) return;
        lockSelection(event);
      };

      const onKeydown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        cancel();
      };

      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("mousedown", onMouseDown, true);
      window.addEventListener("keydown", onKeydown, true);
    });
  }

  async function captureHovered() {
    updateOverlay(hovered);
    return capturePageDesign(document, window, hovered ?? document.body, getLocale());
  }

  return { start, captureHovered };
}

function buttonStyle(background: string, color: string) {
  return [
    `background:${background}`,
    "border:1px solid rgba(255,255,255,.14)",
    "border-radius:8px",
    `color:${color}`,
    "cursor:pointer",
    "font:inherit",
    "font-weight:850",
    "min-height:28px",
    "padding:5px 9px"
  ].join(";");
}

function findCaptureRoot(element: Element) {
  const candidates: Element[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && current !== document.body) {
    candidates.push(current);
    current = current.parentElement;
  }

  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const scored = candidates
    .map((candidate, index) => ({ candidate, index, score: scoreCaptureCandidate(candidate, index, viewportArea) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return scored[0]?.candidate ?? element;
}

function scoreCaptureCandidate(element: Element, depth: number, viewportArea: number) {
  const rect = element.getBoundingClientRect();
  if (!isUsableRect(rect)) return 0;
  const area = rect.width * rect.height;
  const areaRatio = area / viewportArea;
  const tag = element.tagName.toLowerCase();
  const textLength = (element.textContent ?? "").trim().length;
  const childCount = element.children.length;
  let score = 90 - depth * 8;

  if (areaRatio > 0.62) score -= 70;
  else if (areaRatio > 0.42) score -= 36;
  else if (areaRatio > 0.22) score -= 14;

  if (element.matches("button, a, input, select, textarea, summary, [role='button'], [role='link'], [role='tab'], [role='menuitem']")) score += 38;
  if (element.matches("img, video, canvas, svg, picture")) score += 28;
  if (element.matches("article, li, figure, form, label, [role='group'], [role='listitem']")) score += 26;
  if (element.matches("[class*='card' i], [class*='item' i], [class*='tile' i], [class*='button' i], [class*='btn' i], [class*='media' i], [class*='image' i], [class*='project' i], [class*='work' i], [class*='feature' i]")) score += 24;
  if (element.matches("section, main, header, footer, nav, [role='region']")) score -= areaRatio > 0.18 ? 24 : 6;
  if (tag === "span" || tag === "strong" || tag === "em") score -= childCount ? 8 : 18;
  if (rect.width < 28 || rect.height < 18) score -= 22;
  if (rect.width >= 36 && rect.height >= 24 && rect.width <= 900 && rect.height <= 720) score += 12;
  if (childCount >= 1 && childCount <= 12) score += 12;
  if (textLength > 0 && textLength < 180) score += 8;

  return score;
}

function isUsableRect(rect: DOMRect) {
  return rect.width >= 10 && rect.height >= 10 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function isWithinConfirmationSafeZone(x: number, y: number, element: Element, toolbar: HTMLElement | null) {
  const elementRect = inflateRect(element.getBoundingClientRect(), 14);
  if (pointInRect(x, y, elementRect)) return true;
  if (!toolbar) return false;

  const toolbarRect = inflateRect(toolbar.getBoundingClientRect(), 12);
  if (pointInRect(x, y, toolbarRect)) return true;

  const bridge = {
    left: Math.min(elementRect.left, toolbarRect.left),
    right: Math.max(elementRect.right, toolbarRect.right),
    top: Math.min(elementRect.bottom, toolbarRect.top) - 10,
    bottom: Math.max(elementRect.bottom, toolbarRect.top) + 10
  };
  return pointInRect(x, y, bridge);
}

function inflateRect(rect: DOMRect, amount: number) {
  return {
    left: rect.left - amount,
    right: rect.right + amount,
    top: rect.top - amount,
    bottom: rect.bottom + amount
  };
}

function pointInRect(x: number, y: number, rect: { left: number; right: number; top: number; bottom: number }) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
