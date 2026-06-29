import { withLocalizedAnalysis } from "../../analyzer/core/analysis";
import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n";
import type { DesignCapture } from "../../shared/schema";
import { generateComponentSkill } from "./component-skill";
import { generateEnPageSkill, generateZhPageSkill } from "./page-skill";
import { formatInteractionOverview, formatMediaEffects, formatMotionOverview, formatProductDesignPluginWorkflow, formatTechnicalRoutes, formatVisualStructure } from "./skill-formatters";
import { slug } from "./skill-utils";

export function generateSkillMarkdown(capture: DesignCapture, locale: Locale = DEFAULT_LOCALE) {
  const localizedCapture = withLocalizedAnalysis(capture, locale);
  if (localizedCapture.scope === "component") {
    return generateComponentSkill(localizedCapture, locale);
  }
  return locale === "zh" ? generateZhPageSkill(localizedCapture) : generateEnPageSkill(localizedCapture);
}

export function generateCompactSkillMarkdown(capture: DesignCapture, locale: Locale = DEFAULT_LOCALE) {
  const localizedCapture = withLocalizedAnalysis(capture, locale);
  return locale === "zh" ? generateZhCompactSkill(localizedCapture) : generateEnCompactSkill(localizedCapture);
}

function generateZhCompactSkill(capture: DesignCapture) {
  const name = `${slug(capture.page.title)}-${capture.scope === "component" ? "component" : "design"}-reference`;
  const title = capture.scope === "component" ? "组件参考 Skill" : "设计参考 Skill";
  return `---
name: ${name}
description: 将 ${capture.page.title} 的视觉、布局、动效和交互规律转译为可复用设计参考。Use when building original frontend UI inspired by this captured reference without copying source code, assets, logo, brand, or text.
---

# ${capture.page.title} ${title}

## 使用边界

- 借鉴对象：风格气质、布局比例、组件密度、动效节奏、交互触发和技术路线。
- 禁止复制：源站源码、DOM 命名、图片、Logo、品牌符号、专有文案和完整页面结构。
- 完整 token、证据时间线、实现链路和原型线索见 \`evidence.json\`。

## 设计语法

${formatVisualStructure(capture, "zh")}

## 动效与交互

${formatMotionOverview(capture, "zh")}

${formatInteractionOverview(capture, "zh")}

${formatMediaEffects(capture, "zh")}

## 技术路线

${formatTechnicalRoutes(capture, "zh").split("\n").slice(0, 8).join("\n")}

## Product Design 插件协作（可选）

${formatProductDesignPluginWorkflow(capture, "zh")}

## 落地规则

- 先搭页面/组件骨架，再接 token，再补状态和动效。
- 复杂动效优先使用成熟库；组件库负责可访问结构，动画库负责时间线，特效库负责像素/Shader。
- hover、focus、active、loading、error 等状态要和静态 token 保持一致。
- 移动端减少列数和层级，不用放大字号制造假层级。
- 最终产物必须是原创界面，而不是参考站截图级克隆。
`;
}

function generateEnCompactSkill(capture: DesignCapture) {
  const name = `${slug(capture.page.title)}-${capture.scope === "component" ? "component" : "design"}-reference`;
  const title = capture.scope === "component" ? "Component Reference Skill" : "Design Reference Skill";
  return `---
name: ${name}
description: Translate ${capture.page.title}'s visual, layout, motion, and interaction patterns into a reusable design reference. Use when building original frontend UI inspired by this captured reference without copying source code, assets, logo, brand, or text.
---

# ${capture.page.title} ${title}

## Use Boundary

- Borrow: character, layout proportion, component density, motion rhythm, interaction triggers, and technical route.
- Do not copy: source code, DOM naming, imagery, logos, brand marks, proprietary copy, or full page structure.
- Full tokens, evidence timeline, implementation trace, and prototype cues live in \`evidence.json\`.

## Design Grammar

${formatVisualStructure(capture, "en")}

## Motion And Interaction

${formatMotionOverview(capture, "en")}

${formatInteractionOverview(capture, "en")}

${formatMediaEffects(capture, "en")}

## Technical Route

${formatTechnicalRoutes(capture, "en").split("\n").slice(0, 8).join("\n")}

## Product Design Plugin Workflow (Optional)

${formatProductDesignPluginWorkflow(capture, "en")}

## Build Rules

- Build the page/component shell first, then apply tokens, then states and motion.
- Prefer mature libraries for complex effects; component libraries handle accessibility, animation libraries handle timelines, and effect libraries handle pixels/shaders.
- Keep hover, focus, active, loading, and error states consistent with the static tokens.
- On mobile, reduce columns and layers; do not inflate type to fake hierarchy.
- The final output must be an original interface, not a screenshot-level clone of the reference.
`;
}
