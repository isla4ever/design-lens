const SELECTOR_PART_LIMIT = 4;
const NOISE_PATTERN = /(preloader|loader|cookie|consent|gdpr|cmp|modal-backdrop|overlay|design-lens)/i;

export function isVisibleElement(element: Element, win: Window) {
  if (isCaptureNoiseElement(element)) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.bottom < 0 || rect.right < 0) return false;
  if (rect.top > win.innerHeight || rect.left > win.innerWidth) return false;

  const style = win.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01;
}

export function isCaptureNoiseElement(element: Element) {
  if (element.id === "design-lens-overlay-root") return true;
  if (element.closest("#design-lens-overlay-root")) return true;

  const ownSignal = [
    element.id,
    element.getAttribute("class"),
    element.getAttribute("role"),
    element.getAttribute("aria-label"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-test")
  ]
    .filter(Boolean)
    .join(" ");

  if (NOISE_PATTERN.test(ownSignal)) return true;

  const closestNoise = element.closest(
    [
      "[id*='preload' i]",
      "[class*='preload' i]",
      "[id*='loader' i]",
      "[class*='loader' i]",
      "[id*='cookie' i]",
      "[class*='cookie' i]",
      "[id*='consent' i]",
      "[class*='consent' i]",
      "[id*='gdpr' i]",
      "[class*='gdpr' i]",
      "[aria-label*='cookie' i]"
    ].join(",")
  );

  return Boolean(closestNoise);
}

export function buildSelector(element: Element) {
  if (element.id) return `#${cssEscape(element.id)}`;

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && parts.length < SELECTOR_PART_LIMIT && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const dataId =
      current.getAttribute("data-testid") ||
      current.getAttribute("data-test") ||
      current.getAttribute("aria-label");

    if (dataId) {
      parts.unshift(`${tag}[${dataId.includes(" ") ? "aria-label" : "data-testid"}="${escapeAttribute(dataId)}"]`);
      break;
    }

    const className = Array.from(current.classList)
      .filter((item) => item && !item.includes(":") && !item.includes("["))
      .slice(0, 2)
      .map((item) => `.${cssEscape(item)}`)
      .join("");

    parts.unshift(`${tag}${className}`);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

export function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function cssEscape(value: string) {
  if ("CSS" in globalThis && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeAttribute(value: string) {
  return value.replace(/"/g, '\\"');
}
