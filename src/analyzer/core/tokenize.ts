import type { DesignTokens, TokenValue, TypographyToken } from "../../shared/schema";

type Sample = {
  selector: string;
  style: CSSStyleDeclaration;
};

export function extractTokens(samples: Sample[]): DesignTokens {
  return {
    cssVariables: collectCssVariables(samples),
    colors: collectValues(samples, ["color"], normalizeColor),
    backgrounds: collectValues(samples, ["backgroundColor"], normalizeColor),
    spacing: collectValues(samples, ["marginTop", "marginRight", "marginBottom", "marginLeft", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "gap", "rowGap", "columnGap"], normalizeSize),
    radii: collectValues(samples, ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"], normalizeSize),
    shadows: collectValues(samples, ["boxShadow"], normalizeShadow),
    typography: collectTypography(samples)
  };
}

function collectCssVariables(samples: Sample[]): TokenValue[] {
  const map = new Map<string, TokenValue>();

  for (const sample of samples) {
    for (let index = 0; index < sample.style.length; index += 1) {
      const property = sample.style.item(index);
      if (!property.startsWith("--")) continue;

      const rawValue = sample.style.getPropertyValue(property).trim();
      if (!rawValue) continue;

      const value = `${property}: ${rawValue}`;
      const existing = map.get(value) ?? { value, count: 0, sampleSelectors: [] };
      existing.count += 1;
      if (existing.sampleSelectors.length < 4) existing.sampleSelectors.push(sample.selector);
      map.set(value, existing);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 32);
}

function collectValues(
  samples: Sample[],
  properties: Array<keyof CSSStyleDeclaration>,
  normalize: (value: string) => string | null
): TokenValue[] {
  const map = new Map<string, TokenValue>();

  for (const sample of samples) {
    for (const property of properties) {
      const rawValue = String(sample.style[property] ?? "");
      const value = normalize(rawValue);
      if (!value) continue;

      const existing = map.get(value) ?? { value, count: 0, sampleSelectors: [] };
      existing.count += 1;
      if (existing.sampleSelectors.length < 4) existing.sampleSelectors.push(sample.selector);
      map.set(value, existing);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 24);
}

function collectTypography(samples: Sample[]): TypographyToken[] {
  const map = new Map<string, TypographyToken>();

  for (const sample of samples) {
    const family = sample.style.fontFamily.split(",")[0]?.replace(/"/g, "").trim() || "system";
    const size = sample.style.fontSize;
    const weight = sample.style.fontWeight;
    const lineHeight = sample.style.lineHeight;
    const key = `${family}|${size}|${weight}|${lineHeight}`;
    const existing = map.get(key) ?? {
      family,
      size,
      weight,
      lineHeight,
      count: 0,
      sampleSelectors: []
    };

    existing.count += 1;
    if (existing.sampleSelectors.length < 4) existing.sampleSelectors.push(sample.selector);
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 16);
}

function normalizeColor(value: string) {
  if (!value || value === "rgba(0, 0, 0, 0)" || value === "transparent") return null;
  return value;
}

function normalizeSize(value: string) {
  if (!value || value === "normal" || value === "auto" || value === "0px") return null;
  return value;
}

function normalizeShadow(value: string) {
  if (!value || value === "none") return null;
  return value;
}
