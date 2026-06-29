import type { InteractionSpec } from "../../shared/schema";

export function detectInteraction(element: Element, selector: string, style: CSSStyleDeclaration): InteractionSpec | null {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role") ?? "";
  const className = String(element.className || "").toLowerCase();
  const ariaExpanded = element.getAttribute("aria-expanded");
  const ariaSelected = element.getAttribute("aria-selected");
  const ariaPressed = element.getAttribute("aria-pressed");
  const hasTabIndex = element.hasAttribute("tabindex");
  const trigger = inferTrigger(tag, role, className, hasTabIndex);

  if (trigger === "unknown" && style.cursor !== "pointer" && !hasInteractiveClass(className)) return null;

  const stateSignals = [
    ariaExpanded !== null ? `aria-expanded=${ariaExpanded}` : "",
    ariaSelected !== null ? `aria-selected=${ariaSelected}` : "",
    ariaPressed !== null ? `aria-pressed=${ariaPressed}` : "",
    hasTabIndex ? `tabindex=${element.getAttribute("tabindex")}` : "",
    className.includes("active") ? "active class" : "",
    className.includes("selected") ? "selected class" : "",
    className.includes("disabled") || element.hasAttribute("disabled") ? "disabled state" : "",
    style.outlineStyle !== "none" ? `outline ${style.outline}` : "",
    style.cursor !== "auto" ? `cursor ${style.cursor}` : ""
  ].filter(Boolean);

  const extraSignals = inferExtraSignals(element, className, role, style, trigger);

  return {
    id: interactionId(selector, trigger),
    selector,
    trigger,
    affordance: inferAffordance(tag, role, className),
    cursor: style.cursor,
    role,
    stateSignals: [...stateSignals, ...extraSignals].slice(0, 8),
    transitionProperties: style.transitionProperty.split(",").map((item) => item.trim()).filter(Boolean)
  };
}

function inferTrigger(tag: string, role: string, className: string, hasTabIndex: boolean): InteractionSpec["trigger"] {
  if (tag === "a" || role === "link" || role === "navigation") return "navigation";
  if (tag === "input" || tag === "textarea" || tag === "select") return "input";
  if (tag === "button" || role === "button" || className.includes("button") || className.includes("btn")) return className.includes("card") || className.includes("tile") || className.includes("work") || className.includes("project") ? "hover" : "click";
  if (className.includes("hover") || className.includes("card") || className.includes("tile") || className.includes("work") || className.includes("project") || className.includes("scene")) return "hover";
  if (hasTabIndex || role === "menuitem" || role === "tab") return "focus";
  return "unknown";
}

function inferAffordance(tag: string, role: string, className: string) {
  if (tag === "button" || role === "button") return "command control";
  if (tag === "a" || role === "link") return "navigation link";
  if (tag === "input" || tag === "textarea" || tag === "select") return "data entry";
  if (role === "tab" || className.includes("tab")) return "tab switch";
  if (role === "menuitem" || className.includes("menu")) return "menu action";
  if (className.includes("card") || className.includes("tile") || className.includes("work") || className.includes("project") || className.includes("scene")) return "selectable scene surface";
  return "interactive surface";
}

function hasInteractiveClass(className: string) {
  return ["button", "btn", "link", "tab", "menu", "toggle", "select", "dropdown", "hover", "click", "card", "tile", "work", "project", "scene"].some((token) => className.includes(token));
}

function inferExtraSignals(element: Element, className: string, role: string, style: CSSStyleDeclaration, trigger: InteractionSpec["trigger"]) {
  const signals: string[] = [];
  if (className.includes("menu") || role === "navigation") signals.push("nav affordance");
  if (className.includes("cta") || className.includes("primary") || className.includes("submit")) signals.push("primary action");
  if (className.includes("form") || role === "form" || element.tagName.toLowerCase() === "input") signals.push("form interaction");
  if (className.includes("marquee") || className.includes("ticker") || className.includes("scroll")) signals.push("motion-driven surface");
  if (style.transform !== "none" || style.willChange.includes("transform")) signals.push("transform transition");
  if (style.clipPath && style.clipPath !== "none") signals.push("clip reveal");
  if (style.mixBlendMode && style.mixBlendMode !== "normal") signals.push(`blend mode ${style.mixBlendMode}`);
  if (style.position === "fixed" || style.position === "sticky") signals.push(`${style.position} layer`);
  if (trigger === "hover") signals.push("hover-reveal pattern");
  return signals;
}

function interactionId(selector: string, trigger: string) {
  let result = 0;
  const value = `${selector}-${trigger}`;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return `int_${Math.abs(result).toString(36)}`;
}
