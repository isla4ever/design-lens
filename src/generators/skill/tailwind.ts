import type { DesignCapture } from "../../shared/schema";
import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n";

export function generateTailwindConfig(capture: DesignCapture, locale: Locale = DEFAULT_LOCALE) {
  const colors = capture.tokens.colors.slice(0, 8).reduce<Record<string, string>>((accumulator, color, index) => {
    accumulator[`captured-${index + 1}`] = color.value;
    return accumulator;
  }, {});

  const spacing = capture.tokens.spacing.slice(0, 8).reduce<Record<string, string>>((accumulator, item, index) => {
    accumulator[`captured-${index + 1}`] = item.value;
    return accumulator;
  }, {});

  const borderRadius = capture.tokens.radii.slice(0, 8).reduce<Record<string, string>>((accumulator, item, index) => {
    accumulator[`captured-${index + 1}`] = item.value;
    return accumulator;
  }, {});

  const boxShadow = capture.tokens.shadows.slice(0, 6).reduce<Record<string, string>>((accumulator, item, index) => {
    accumulator[`captured-${index + 1}`] = item.value;
    return accumulator;
  }, {});

  const intro = locale === "zh"
    ? `// Design Lens: ${capture.page.title} token map. Use this as the base for static recreation, then layer motion and interaction states separately.`
    : `// Design Lens: ${capture.page.title} token map. Use this as the base for static recreation, then layer motion and interaction states separately.`;

  return `${intro}
import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 8)},
      spacing: ${JSON.stringify(spacing, null, 8)},
      borderRadius: ${JSON.stringify(borderRadius, null, 8)},
      boxShadow: ${JSON.stringify(boxShadow, null, 8)}
    }
  }
} satisfies Config;
`;
}
