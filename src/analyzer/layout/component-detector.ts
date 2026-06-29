import { cleanText } from "../core/dom-utils";
import type { ComponentSpec, LayoutSpec } from "../../shared/schema";

export function detectComponent(element: Element, selector: string, style: CSSStyleDeclaration): ComponentSpec | null {
  const rect = element.getBoundingClientRect();
  if (rect.width < 24 || rect.height < 16) return null;

  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role") ?? "";
  const className = element.className ? String(element.className).toLowerCase() : "";
  const text = cleanText(element.textContent ?? "");

  const candidates = [
    score("Button", tag === "button" || role === "button" || className.includes("button") || className.includes("btn"), 92),
    score("Navigation", tag === "nav" || role === "navigation" || className.includes("nav") || className.includes("menu"), 88),
    score("Form Field", tag === "input" || tag === "textarea" || tag === "select" || className.includes("input"), 90),
    score("Form Flow", tag === "form" || role === "form" || className.includes("form") || className.includes("contact"), 82),
    score("Section", tag === "section" || tag === "article" || className.includes("section"), 70),
    score("Project/Work Tile", className.includes("work") || className.includes("project") || className.includes("case"), 78),
    score("Ticker/Marquee", className.includes("ticker") || className.includes("marquee") || className.includes("carousel") || className.includes("slider"), 80),
    score("Card", className.includes("card") || hasCardShape(style, rect), 76),
    score("Hero Section", isHeroLike(element, rect, text), 72),
    score("Media Block", tag === "img" || tag === "video" || className.includes("media"), 84),
    score("Dialog", role === "dialog" || className.includes("modal") || className.includes("dialog"), 86),
    score("Toolbar", role === "toolbar" || className.includes("toolbar"), 80),
    score("List Item", tag === "li" || className.includes("item"), 64)
  ].filter(Boolean) as Array<{ name: string; confidence: number }>;

  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
  if (!best) return null;

  return {
    id: hash(`${selector}-${best.name}`),
    name: best.name,
    selector,
    tagName: tag,
    confidence: best.confidence,
    textSample: text,
    layout: extractLayout(style, rect),
    visual: {
      color: style.color,
      backgroundColor: style.backgroundColor,
      font: `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      border: style.border
    }
  };
}

export function extractLayout(style: CSSStyleDeclaration, rect: DOMRect): LayoutSpec {
  return {
    display: style.display,
    position: style.position,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    gap: style.gap,
    gridTemplateColumns: style.gridTemplateColumns,
    flexDirection: style.flexDirection,
    alignItems: style.alignItems,
    justifyContent: style.justifyContent
  };
}

function score(name: string, condition: boolean, confidence: number) {
  return condition ? { name, confidence } : null;
}

function hasCardShape(style: CSSStyleDeclaration, rect: DOMRect) {
  const hasSurface = style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.boxShadow !== "none";
  const hasRadius = parseFloat(style.borderRadius) >= 6;
  return hasSurface && hasRadius && rect.width >= 120 && rect.height >= 80;
}

function isHeroLike(element: Element, rect: DOMRect, text: string) {
  const heading = element.querySelector("h1, h2");
  const tag = element.tagName.toLowerCase();
  return Boolean((heading || tag === "main") && rect.width > window.innerWidth * 0.55 && rect.height > 220 && text.length > 20);
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return `cmp_${Math.abs(result).toString(36)}`;
}
