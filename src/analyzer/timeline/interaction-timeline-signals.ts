import { buildSelector } from "../core/dom-utils";
import type { RuntimeAnimationSample, VisualSurfaceSample } from "../../shared/schema";

export function extractAnimatedProperties(keyframes: ComputedKeyframe[]) {
  const ignored = new Set(["offset", "easing", "composite", "computedOffset"]);
  const properties = new Set<string>();
  for (const keyframe of keyframes.slice(0, 8)) {
    for (const key of Object.keys(keyframe)) {
      if (!ignored.has(key)) properties.add(key);
    }
  }
  return Array.from(properties).slice(0, 10);
}

export function inferAnimationSource(animation: Animation, target: Element, properties: string[]): RuntimeAnimationSample["source"] {
  const style = getComputedStyle(target);
  const cssAnimationCtor = (globalThis as { CSSAnimation?: typeof CSSAnimation }).CSSAnimation;
  const cssTransitionCtor = (globalThis as { CSSTransition?: typeof CSSTransition }).CSSTransition;
  if ((cssAnimationCtor && animation instanceof cssAnimationCtor) || (style.animationName && style.animationName !== "none")) return "css-animation";
  if ((cssTransitionCtor && animation instanceof cssTransitionCtor) || (style.transitionProperty && style.transitionProperty !== "all" && properties.length <= 2)) return "css-transition";
  if (animation.id || properties.length) return "web-animation";
  return "unknown";
}

export function inferAnimationName(target: Element, win: Window) {
  const style = win.getComputedStyle(target);
  if (style.animationName && style.animationName !== "none") return style.animationName;
  const className = String(target.getAttribute("class") || "");
  const match = className.match(/(?:anim|motion|reveal|fade|slide|scroll|loader|preload|hero|cursor|wave|ripple)[\w-]*/i);
  return match?.[0] ?? "";
}

export function runtimeAnimationSignature(sample: RuntimeAnimationSample) {
  return `${sample.selector}|${sample.name}|${sample.currentTimeMs}|${sample.playState}|${sample.properties.join(",")}`;
}

export function sampleVisualSurface(element: Element, t: number, rect: DOMRect): VisualSurfaceSample {
  const selector = buildSelector(element);
  const tagName = element.tagName.toLowerCase();
  if (element instanceof HTMLCanvasElement) {
    const signature = readCanvasSignature(element);
    return {
      t,
      selector,
      tagName,
      width: element.width,
      height: element.height,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      signal: signature === "tainted" ? "canvas-tainted" : signature ? "canvas-readable" : "canvas-active",
      frameSignature: signature && signature !== "tainted" ? signature : undefined
    };
  }
  if (element instanceof HTMLVideoElement) {
    return {
      t,
      selector,
      tagName,
      width: element.videoWidth,
      height: element.videoHeight,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      signal: "video-active",
      frameSignature: `${Math.round(element.currentTime * 1000)}|${element.readyState}|${element.paused ? "paused" : "playing"}`
    };
  }
  if (element instanceof HTMLImageElement) {
    return {
      t,
      selector,
      tagName,
      width: element.naturalWidth,
      height: element.naturalHeight,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      signal: "image-media",
      frameSignature: `${element.currentSrc || element.src}|${element.complete ? "complete" : "loading"}`
    };
  }
  return {
    t,
    selector,
    tagName,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    cssWidth: Math.round(rect.width),
    cssHeight: Math.round(rect.height),
    signal: "svg-surface",
    frameSignature: element.getAttribute("viewBox") ?? element.getAttribute("class") ?? undefined
  };
}

export function isInterestingMutation(element: Element, record: MutationRecord) {
  const signal = [element.id, element.getAttribute("class"), record.attributeName, element.getAttribute("style")].filter(Boolean).join(" ");
  if (/(design-lens|cookie|consent|gdpr)/i.test(signal)) return false;
  if (record.type === "childList") {
    return record.addedNodes.length + record.removedNodes.length > 0 && /(preload|loader|media|image|gallery|hero|scene|work|project|modal|panel|cursor|ripple|water|wave|canvas|show|hidden|active|inview|join|finish|open)/i.test(signal);
  }
  if (record.attributeName === "class" || record.attributeName === "style") {
    return /(preload|loader|media|image|gallery|hero|scene|work|project|modal|panel|cursor|ripple|water|wave|canvas|show|hidden|active|inview|join|finish|open|transform|opacity|clip|filter|display)/i.test(signal);
  }
  return ["data-state", "aria-expanded", "aria-hidden"].includes(record.attributeName ?? "");
}

function readCanvasSignature(canvas: HTMLCanvasElement) {
  if (!canvas.width || !canvas.height) return "";
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "";
    const width = Math.min(8, canvas.width);
    const height = Math.min(8, canvas.height);
    const data = context.getImageData(0, 0, width, height).data;
    let hash = 0;
    for (let index = 0; index < data.length; index += 16) {
      hash = (hash * 31 + (data[index] ?? 0) + (data[index + 1] ?? 0) * 3 + (data[index + 2] ?? 0) * 7 + (data[index + 3] ?? 0) * 11) | 0;
    }
    return Math.abs(hash).toString(36);
  } catch {
    return "tainted";
  }
}
