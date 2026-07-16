import { buildSelector, isCaptureNoiseElement } from "../analyzer/core/dom-utils";
import type { RebuildSceneEvidence } from "../capture-v2/core/rebuild-evidence";
import type { GuidedCaptureTask } from "../shared/messages";

export type GuidedTaskEvidence = {
  phase: RebuildSceneEvidence["phase"];
  selector?: string;
};

export function createGuidedTaskObserver(options: {
  doc: Document;
  win: Window;
  task: GuidedCaptureTask;
  onReady: (evidence: GuidedTaskEvidence) => void;
  onTimeout: () => void;
  timeoutMs?: number;
}) {
  const { doc, win, task } = options;
  const cleanup: Array<() => void> = [];
  let settledTimer: number | null = null;
  let finished = false;
  let clickedSelector = "";
  let clickObserved = false;
  let openSurfacesBeforeClick = new Set<Element>();

  const finish = (evidence: GuidedTaskEvidence) => {
    if (finished) return;
    finished = true;
    stop();
    options.onReady(evidence);
  };
  const schedule = (callback: () => void, delayMs = 420) => {
    if (settledTimer !== null) win.clearTimeout(settledTimer);
    settledTimer = win.setTimeout(() => {
      settledTimer = null;
      callback();
    }, delayMs);
  };
  const listen = (target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, eventOptions?: AddEventListenerOptions | boolean) => {
    target.addEventListener(type, listener, eventOptions);
    cleanup.push(() => target.removeEventListener(type, listener, eventOptions));
  };

  function start() {
    const timeout = win.setTimeout(() => {
      if (finished) return;
      finished = true;
      stop();
      options.onTimeout();
    }, options.timeoutMs ?? 20_000);
    cleanup.push(() => win.clearTimeout(timeout));

    if (isScrollTask(task)) {
      const check = () => {
        const targetY = task.targetScrollY;
        if (targetY === undefined ? Math.abs(win.scrollY) > 80 : Math.abs(win.scrollY - targetY) <= 120) {
          finish({ phase: "responsive-scroll", ...(task.selector ? { selector: task.selector } : {}) });
        }
      };
      listen(win, "scroll", () => schedule(check, 320), { passive: true });
      schedule(check, 320);
      return;
    }

    if (isInitialTask(task)) {
      const check = () => {
        const mobile = win.innerWidth < 768;
        if (!task.viewport || (task.viewport === "mobile") === mobile) finish({ phase: "responsive-initial" });
      };
      listen(win, "resize", () => schedule(check, 360), { passive: true });
      schedule(check, 360);
      return;
    }

    if (isHoverTask(task)) {
      const onPointer = (event: Event) => {
        const target = matchingTarget(event.target, task.selector, doc);
        if (!target) return;
        const selector = task.selector ?? buildSelector(target);
        schedule(() => {
          if (target.isConnected && target.matches(":hover")) finish({ phase: "observed-hover", selector });
        });
      };
      listen(doc, "pointerover", onPointer, true);
      listen(doc, "pointermove", onPointer, true);
      return;
    }

    if (task.state === "focus") {
      listen(doc, "focusin", (event) => {
        const target = matchingTarget(event.target, task.selector, doc);
        if (!target) return;
        const selector = task.selector ?? buildSelector(target);
        schedule(() => {
          if (doc.activeElement === target || target.contains(doc.activeElement)) finish({ phase: "observed-focus", selector });
        }, 320);
      }, true);
      return;
    }

    if (task.trigger === "wait") {
      const check = () => {
        const target = queryVisibleTarget(doc, task.selector);
        if (target) finish({ phase: "observed-open", ...(task.selector ? { selector: task.selector } : {}) });
      };
      const observer = new MutationObserver(() => schedule(check, 360));
      observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"], childList: true, subtree: true });
      cleanup.push(() => observer.disconnect());
      schedule(check, 360);
      return;
    }

    const observer = new MutationObserver(() => {
      if (clickObserved) {
        schedule(checkOpenState, 420);
      }
    });
    observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["class", "style", "open", "aria-expanded", "aria-hidden"], childList: true, subtree: true });
    cleanup.push(() => observer.disconnect());
    listen(doc, "click", (event) => {
      const target = matchingTarget(event.target, task.selector, doc);
      if (!target) return;
      clickObserved = true;
      openSurfacesBeforeClick = new Set(findVisibleOpenSurfaces(doc));
      clickedSelector = task.selector ?? buildSelector(target);
      schedule(checkOpenState, 520);
    }, true);

    function checkOpenState() {
      if (!clickObserved || !clickedSelector) return;
      const target = safeQuery(doc, clickedSelector);
      const newOpenSurface = findVisibleOpenSurfaces(doc).some((surface) => !openSurfacesBeforeClick.has(surface));
      if (hasExplicitOpenSignal(target, doc) || newOpenSurface) finish({ phase: "observed-open", selector: clickedSelector });
    }
  }

  function stop() {
    if (settledTimer !== null) win.clearTimeout(settledTimer);
    settledTimer = null;
    cleanup.splice(0).forEach((dispose) => dispose());
  }

  return { start, stop };
}

function isHoverTask(task: GuidedCaptureTask) {
  return task.trigger === "hover" || task.state === "hover";
}

function isScrollTask(task: GuidedCaptureTask) {
  return task.trigger === "scroll" || task.state === "scroll";
}

function isInitialTask(task: GuidedCaptureTask) {
  return task.trigger === "initial" || task.kind === "capture-responsive";
}

function matchingTarget(value: EventTarget | null, selector: string | undefined, doc: Document) {
  if (!(value instanceof Element) || isCaptureNoiseElement(value)) return null;
  if (!selector) return value;
  try {
    return value.matches(selector) ? value : value.closest(selector);
  } catch {
    return safeQuery(doc, selector);
  }
}

function queryVisibleTarget(doc: Document, selector: string | undefined) {
  const target = selector ? safeQuery(doc, selector) : null;
  return target && isVisibleElement(target, doc) ? target : null;
}

export function hasExplicitOpenSignal(target: Element | null, doc: Document) {
  if (!target) return false;
  if (target.getAttribute("aria-expanded") === "true" || target.hasAttribute("open") || /\b(open|active|expanded|visible|show)\b/i.test(target.getAttribute("class") ?? "")) {
    return true;
  }
  const controlledIds = (target.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean);
  return controlledIds.some((id) => {
    const controlled = doc.getElementById(id);
    return controlled ? isVisibleElement(controlled, doc) : false;
  });
}

function findVisibleOpenSurfaces(doc: Document) {
  const selector = "dialog[open], details[open], [popover], [aria-modal='true'], [role='dialog'], [role='menu'], [role='listbox']";
  return Array.from(doc.querySelectorAll(selector)).filter((target) => isVisibleElement(target, doc));
}

function isVisibleElement(target: Element, doc: Document) {
  const rect = target.getBoundingClientRect();
  const style = doc.defaultView?.getComputedStyle(target);
  return rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
}

function safeQuery(doc: Document, selector: string) {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}
