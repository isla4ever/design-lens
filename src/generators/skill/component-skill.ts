import type { Locale } from "../../shared/i18n";
import type { DesignCapture } from "../../shared/schema";
import { formatComponentApi, formatComponentBlueprint, formatComponentStates, formatImplementationTrace, formatMotion, formatProductDesignPluginWorkflow, formatTechnicalRoutes, formatTokenList, formatTypographyList } from "./skill-formatters";
import { slug } from "./skill-utils";

export function generateComponentSkill(capture: DesignCapture, locale: Locale) {
  return locale === "zh" ? generateZhComponentSkill(capture) : generateEnComponentSkill(capture);
}

function generateZhComponentSkill(capture: DesignCapture) {
  const name = `${slug(capture.page.title)}-component-reference`;
  const primary = capture.components[0];
  const componentName = primary?.name ?? "Captured Component";

  return `---
name: ${name}
description: 将 ${capture.page.title} 中选取的 ${componentName} 组件/模块范围转译为可复用设计参考。Use when building a similar component, section, card, hero block, navigation module, gallery item, or interactive surface.
---

# ${componentName} 组件参考 Skill

## 使用场景

- 当你要做一个相似的组件、模块、卡片、首屏区块、导航区、作品项、媒体展示或交互表面时使用。
- 目标是借鉴组件结构、状态、布局密度、视觉 token 和动效触发，不是复刻整站页面。
- 输出必须是原创组件；允许替换内容、品牌、图片和业务语义。

## 组件判断

- 来源页面：${capture.page.title}
- 选择范围：组件/模块
- 组件主型：${componentName}
- 设计气质：${capture.analysis.character}
- 核心标签：${capture.analysis.tags.join("、") || "无"}

## 组件结构

${formatComponentBlueprint(capture, "zh")}

## 组件 Token

### 颜色 / 背景

${formatTokenList(capture.tokens.colors, "zh", "未捕捉到稳定颜色。")}

${formatTokenList(capture.tokens.backgrounds, "zh", "未捕捉到稳定背景。")}

### 字体 / 间距 / 圆角 / 阴影

${formatTypographyList(capture.tokens.typography, "zh")}

${formatTokenList(capture.tokens.spacing, "zh", "未捕捉到稳定间距。")}

${formatTokenList(capture.tokens.radii, "zh", "未捕捉到稳定圆角。")}

${formatTokenList(capture.tokens.shadows, "zh", "未捕捉到稳定阴影。")}

## 状态与交互

${formatComponentStates(capture, "zh")}

## 动效实现

${formatMotion(capture.motion, "zh")}

## 技术路线选择

### 实现链路证据

${formatImplementationTrace(capture, "zh")}

### 选型矩阵

${formatTechnicalRoutes(capture, "zh")}

## 组件 API 建议

${formatComponentApi(capture, "zh")}

## Product Design 插件协作（可选）

${formatProductDesignPluginWorkflow(capture, "zh")}

## 复用边界

- 复用结构、比例、密度、状态语言和动效触发方式。
- 不复用源站文案、图片、Logo、类名、DOM 命名或品牌符号。
- 大组件要保留内部层级：容器、标题/正文、媒体、动作区、状态层必须分开建模。
- 小组件要保留状态完整性：default、hover、focus、active、disabled、loading/error/success 如有业务需要必须补齐。
- 如果该组件/模块依赖滚动、鼠标轨迹或媒体扰动，优先按“独立视觉层 + 组件内容层”实现，避免把效果写死进内容 DOM。
- 复杂交互优先使用成熟库：组件库保障可访问结构，动画库保障时间线控制，特效库保障媒体/像素质量；不要默认让模型纯手搓。

## 验收清单

- 组件在独立页面中也能成立，不依赖源站全局 DOM。
- 组件 props/slots 可以替换内容，视觉仍保持同一风格。
- 交互状态可键盘访问，focus 可见。
- 移动端无横向溢出，文字不遮挡，按钮不截断。
- 动效可关闭或降级，复杂 canvas/WebGL 效果不能阻塞主要内容。
`;
}

function generateEnComponentSkill(capture: DesignCapture) {
  const name = `${slug(capture.page.title)}-component-reference`;
  const primary = capture.components[0];
  const componentName = primary?.name ?? "Captured Component";

  return `---
name: ${name}
description: Translate the selected ${componentName} scope from ${capture.page.title} into a reusable component/module design reference. Use when building a similar component, section, card, hero block, navigation module, gallery item, or interactive surface.
---

# ${componentName} Component Reference Skill

## Use Case

- Use this when building a similar component, module, card, hero section, navigation block, work item, media display, or interactive surface.
- Borrow component structure, states, layout density, visual tokens, and motion triggers, not the full site.
- The final component must be original; content, brand, imagery, and business meaning can change.

## Component Read

- Source page: ${capture.page.title}
- Capture scope: selected component/module
- Primary type: ${componentName}
- Design character: ${capture.analysis.character}
- Tags: ${capture.analysis.tags.join(", ") || "none"}

## Component Structure

${formatComponentBlueprint(capture, "en")}

## Component Tokens

### Color / Background

${formatTokenList(capture.tokens.colors, "en", "No stable colors captured.")}

${formatTokenList(capture.tokens.backgrounds, "en", "No stable backgrounds captured.")}

### Type / Spacing / Radius / Shadow

${formatTypographyList(capture.tokens.typography, "en")}

${formatTokenList(capture.tokens.spacing, "en", "No stable spacing captured.")}

${formatTokenList(capture.tokens.radii, "en", "No stable radii captured.")}

${formatTokenList(capture.tokens.shadows, "en", "No stable shadows captured.")}

## States And Interaction

${formatComponentStates(capture, "en")}

## Motion Implementation

${formatMotion(capture.motion, "en")}

## Technical Route Selection

### Implementation Chain Evidence

${formatImplementationTrace(capture, "en")}

### Selection Matrix

${formatTechnicalRoutes(capture, "en")}

## Component API Guidance

${formatComponentApi(capture, "en")}

## Product Design Plugin Workflow (Optional)

${formatProductDesignPluginWorkflow(capture, "en")}

## Reuse Boundary

- Reuse structure, proportion, density, state language, and motion triggers.
- Do not reuse source copy, images, logos, class names, DOM naming, or brand symbols.
- For large components, preserve internal layers: container, heading/body, media, actions, and state layer.
- For small components, preserve state completeness: default, hover, focus, active, disabled, loading/error/success when needed.
- If this scope depends on scroll, pointer trail, or media distortion, implement it as a separate visual layer plus content layer rather than hard-coding the effect into content DOM.
- Prefer mature libraries for complex interaction: component libraries protect accessibility, animation libraries control timelines, and effect libraries improve media/pixel quality; do not default to hand-rolled implementations.

## Acceptance Checklist

- The component works standalone without relying on the source site's global DOM.
- Props/slots can replace content while preserving the captured feel.
- Interaction states are keyboard accessible with visible focus.
- Mobile has no horizontal overflow, overlapping text, or clipped buttons.
- Motion can be reduced; heavy canvas/WebGL effects never block primary content.
`;
}
