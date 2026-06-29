import type { MotionSpec } from "../../shared/schema";

export function detectMotion(element: Element, selector: string, style: CSSStyleDeclaration): MotionSpec[] {
  const motion: MotionSpec[] = [];
  const className = String(element.className || "").toLowerCase();
  const semanticName = inferMotionSemanticName(element, className, style);
  const transitionDuration = parseTimeList(style.transitionDuration);
  const transitionProperties = style.transitionProperty.split(",").map((item) => item.trim());

  if (transitionDuration.some((duration) => duration > 0)) {
    motion.push({
      id: motionId(selector, "transition"),
      selector,
      type: "transition",
      name: "CSS transition",
      durationMs: Math.max(...transitionDuration),
      delayMs: Math.max(...parseTimeList(style.transitionDelay)),
      easing: style.transitionTimingFunction,
      properties: transitionProperties
    });
  }

  const animationDuration = parseTimeList(style.animationDuration);
  if (animationDuration.some((duration) => duration > 0)) {
    motion.push({
      id: motionId(selector, "animation"),
      selector,
      type: "animation",
      name: style.animationName,
      durationMs: Math.max(...animationDuration),
      delayMs: Math.max(...parseTimeList(style.animationDelay)),
      easing: style.animationTimingFunction,
      properties: [style.transform !== "none" ? "transform" : "animated styles"]
    });
  }

  for (const animation of element.getAnimations({ subtree: false })) {
    const timing = animation.effect?.getTiming();
    if (!timing) continue;
    const duration = typeof timing.duration === "number" ? timing.duration : 0;
    if (duration <= 0) continue;
    motion.push({
      id: motionId(selector, animation.id || "web-animation"),
      selector,
      type: "web-animation",
      name: animation.id || "Web Animation",
      durationMs: Math.round(duration),
      delayMs: typeof timing.delay === "number" ? Math.round(timing.delay) : 0,
      easing: String(timing.easing || "linear"),
      properties: ["runtime animation"]
    });
  }

  if (semanticName) {
    motion.push({
      id: motionId(selector, semanticName),
      selector,
      type: "state-machine",
      name: semanticName,
      durationMs: Math.max(...transitionDuration, ...parseTimeList(style.animationDuration), 0),
      delayMs: Math.max(...parseTimeList(style.transitionDelay), ...parseTimeList(style.animationDelay), 0),
      easing: style.transitionTimingFunction || style.animationTimingFunction || "unknown",
      properties: inferMotionProperties(style, className)
    });
  }

  return motion;
}

function parseTimeList(value: string) {
  return value.split(",").map((item) => {
    const trimmed = item.trim();
    if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed);
    if (trimmed.endsWith("s")) return Number.parseFloat(trimmed) * 1000;
    return 0;
  });
}

function motionId(selector: string, type: string) {
  return `motion_${Math.abs(hash(`${selector}-${type}`)).toString(36)}`;
}

function inferMotionSemanticName(element: Element, className: string, style: CSSStyleDeclaration) {
  const signals: string[] = [];
  if (/(preload|loader|loading|intro|splash)/i.test(className)) signals.push("pre-entry/loading state");
  if (/(hero|masthead|cover)/i.test(className)) signals.push("hero reveal state");
  if (/(work|project|case|card|tile|scene)/i.test(className)) signals.push("interactive project scene");
  if (/(scroll|sticky|pin|parallax|marquee|ticker)/i.test(className)) signals.push("scroll-linked motion surface");
  if (style.position === "fixed" || style.position === "sticky") signals.push(`${style.position} anchor layer`);
  if (style.clipPath && style.clipPath !== "none") signals.push("clip-path reveal");
  if (style.transform && style.transform !== "none") signals.push("transform state");
  if (style.mixBlendMode && style.mixBlendMode !== "normal") signals.push("blend-mode contrast layer");
  if (style.willChange && style.willChange !== "auto") signals.push(`will-change ${style.willChange}`);
  if (element.getAttribute("aria-live")) signals.push("live state surface");

  return signals.length ? signals.slice(0, 3).join(" + ") : "";
}

function inferMotionProperties(style: CSSStyleDeclaration, className: string) {
  const properties = new Set<string>();
  if (style.transitionProperty && style.transitionProperty !== "all") {
    for (const property of style.transitionProperty.split(",")) properties.add(property.trim());
  }
  if (style.animationName && style.animationName !== "none") properties.add(`animation:${style.animationName}`);
  if (style.clipPath && style.clipPath !== "none") properties.add("clip-path");
  if (style.transform && style.transform !== "none") properties.add("transform");
  if (style.opacity !== "1") properties.add("opacity");
  if (style.filter && style.filter !== "none") properties.add("filter");
  if (style.mixBlendMode && style.mixBlendMode !== "normal") properties.add("mix-blend-mode");
  if (style.position === "fixed" || style.position === "sticky") properties.add(`position:${style.position}`);
  if (/(hover|active|selected|open|show|visible|recording)/i.test(className)) properties.add("class-driven state");
  return Array.from(properties).filter(Boolean).slice(0, 8);
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return result;
}
