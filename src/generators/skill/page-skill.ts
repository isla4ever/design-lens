import type { DesignCapture } from "../../shared/schema";
import {
  formatComponents,
  formatImplementationAdvice,
  formatImplementationTrace,
  formatInteractionOverview,
  formatInteractionStrategy,
  formatLayoutRules,
  formatMediaEffects,
  formatMotion,
  formatMotionOverview,
  formatProductDesignPluginWorkflow,
  formatRebuildPlan,
  formatRhythm,
  formatTechnicalRoutes,
  formatTokenList,
  formatTypographyList,
  formatVisualStructure
} from "./skill-formatters";
import { formatInteractionTimeline } from "./skill-timeline-formatters";
import { slug } from "./skill-utils";

export function generateZhPageSkill(capture: DesignCapture) {
  const name = `${slug(capture.page.title)}-design-style`;

  return `---
name: ${name}
description: 将 ${capture.page.title} 的视觉 token、布局语法、组件模式、动效规则转译为前端设计参考对照表。Use when building React/Vue/HTML/CSS/Tailwind interfaces that should follow this captured site style without copying proprietary source code, assets, logos, or brand marks.
---

# ${capture.page.title} 设计参考 Skill

## 参考原则

- 复用设计语言：${capture.analysis.character}
- 输出原创实现，不复制私有源码、图片、Logo、品牌资产或完整页面结构。
- 优先拆解系统规律：颜色角色、字体层级、间距密度、组件结构、动效节奏。
- 先做静态页面骨架，再补状态、交互与动效，不要先堆视觉特效。

## 设计参考表

### 视觉结构

${formatVisualStructure(capture, "zh")}

### 动效结构

${formatMotionOverview(capture, "zh")}

### 交互结构

${formatInteractionOverview(capture, "zh")}

### 媒体特效

${formatMediaEffects(capture, "zh")}

### 实现建议

${formatImplementationAdvice(capture, "zh")}

### 实现链路证据

${formatImplementationTrace(capture, "zh")}

### 技术路线选择

${formatTechnicalRoutes(capture, "zh")}

## 捕捉来源

- 页面：${capture.page.title}
- URL：${capture.page.url}
- 时间：${capture.page.capturedAt}
- 视口：${capture.viewport.width}x${capture.viewport.height} @${capture.viewport.devicePixelRatio}x
- 标签：${capture.analysis.tags.join("、") || "无"}

## 设计 Token

### 颜色

${formatTokenList(capture.tokens.colors, "zh", "未捕捉到稳定颜色。")}

### 背景

${formatTokenList(capture.tokens.backgrounds, "zh", "未捕捉到稳定背景。")}

### 字体

${formatTypographyList(capture.tokens.typography, "zh")}

### 间距

${formatTokenList(capture.tokens.spacing, "zh", "未捕捉到稳定间距。")}

### 圆角

${formatTokenList(capture.tokens.radii, "zh", "未捕捉到稳定圆角。")}

### 阴影

${formatTokenList(capture.tokens.shadows, "zh", "未捕捉到稳定阴影。")}

### CSS 变量

${formatTokenList(capture.tokens.cssVariables, "zh", "未捕捉到活跃 CSS 变量。")}

## 布局语法

${formatLayoutRules(capture, "zh")}

## 落地路径

${formatRebuildPlan(capture, "zh")}

## Product Design 插件协作（可选）

${formatProductDesignPluginWorkflow(capture, "zh")}

## 页面节奏

${formatRhythm(capture, "zh")}

## 组件模式

${formatComponents(capture.components, "zh")}

## 动效与交互

${formatMotion(capture.motion, "zh")}

## 录制交互时间线

${formatInteractionTimeline(capture, "zh")}

## 交互复现策略

${formatInteractionStrategy(capture, "zh")}

## 原创边界

- 允许复用的是比例、节奏、层次和状态语言，不是源码、文案、图片、图标或品牌符号。
- 如果源站有强动效，重建时保留“节奏感”和“触发方式”，不要照搬具体实现细节。
- 如果源站有加载层、首屏预热或滚动揭示，必须把它们作为独立状态实现，而不是塞进一个单一 fade。

## 实现规则

- 建立 token 层：颜色、字体、间距、圆角、阴影必须先抽象为 CSS variables 或 Tailwind theme。
- 技术选型必须遵守“技术路线选择”：组件库负责可访问结构，动画库负责时间线，特效库负责像素/Shader；复杂效果不要让模型纯手搓。
- 组件先做结构，再做装饰；不要先堆阴影、渐变或大圆角。
- 使用捕捉到的 display、gap、radius、shadow 作为默认值，不随意引入新的视觉语法。
- 允许替换内容、图片、品牌名；不允许照搬 DOM、类名、商标、图像和专有文案。
- hover、focus、active、disabled 状态必须与静态 token 保持同一风格。
- 响应式布局保留原始密度关系：移动端减少列数，不放大字号制造假层级。
- 对复杂官网效果，优先用 GSAP/ScrollTrigger 或等价 timeline 组织：首屏入场、滚动揭示、导航 hover、卡片 hover、表单输入反馈、loading state 分开实现。
- 如果第一轮捕捉偏静态，重新录制 hover、scroll、focus 和动画完成态，再生成最终 skill。

## 禁止项

- 不复制源站源码、图片、Logo、图标库配置或追踪脚本。
- 不把该风格泛化成紫色渐变、玻璃拟态、超大卡片等通用 AI UI。
- 不新增与捕捉证据冲突的主色、字体、圆角尺度或动效时长。
- 不用说明文字解释界面功能；用清晰控件和布局表达。

## 验收清单

- 颜色、字体、间距、圆角、阴影均来自本 skill 的 token 或明确派生值。
- 主要组件能对应到“组件模式”里的至少一条证据。
- 动效时长、缓动和触发方式符合“动效规则”。
- 桌面与移动端无横向溢出，文字不重叠，按钮文字不截断。
- 可访问性保底：语义结构、键盘焦点、可见 focus、对比度检查。
- 最终实现是原创产品界面，不是源站截图级克隆。
`;
}

export function generateEnPageSkill(capture: DesignCapture) {
  const name = `${slug(capture.page.title)}-design-style`;

  return `---
name: ${name}
description: Translate ${capture.page.title}'s captured visual tokens, layout grammar, component patterns, and motion rules into a frontend design reference table. Use when building React/Vue/HTML/CSS/Tailwind interfaces that should follow this captured site style without copying proprietary source code, assets, logos, or brand marks.
---

# ${capture.page.title} Design Reference Skill

## Reference Principles

- Reuse the design language: ${capture.analysis.character}
- Produce original implementation; do not copy private source, images, logos, brand assets, or full page structure.
- Prioritize system rules: color roles, type hierarchy, spacing density, component structure, and motion rhythm.
- Build the static shell first, then layer states, interaction, and motion.

## Reference Table

### Visual Structure

${formatVisualStructure(capture, "en")}

### Motion Structure

${formatMotionOverview(capture, "en")}

### Interaction Structure

${formatInteractionOverview(capture, "en")}

### Media Effects

${formatMediaEffects(capture, "en")}

### Implementation Advice

${formatImplementationAdvice(capture, "en")}

### Implementation Chain Evidence

${formatImplementationTrace(capture, "en")}

### Technical Route Selection

${formatTechnicalRoutes(capture, "en")}

## Capture Source

- Page: ${capture.page.title}
- URL: ${capture.page.url}
- Captured: ${capture.page.capturedAt}
- Viewport: ${capture.viewport.width}x${capture.viewport.height} @${capture.viewport.devicePixelRatio}x
- Tags: ${capture.analysis.tags.join(", ") || "none"}

## Reference Tokens

### Color

${formatTokenList(capture.tokens.colors, "en", "No stable colors captured.")}

### Background

${formatTokenList(capture.tokens.backgrounds, "en", "No stable backgrounds captured.")}

### Typography

${formatTypographyList(capture.tokens.typography, "en")}

### Spacing

${formatTokenList(capture.tokens.spacing, "en", "No stable spacing captured.")}

### Radius

${formatTokenList(capture.tokens.radii, "en", "No stable radii captured.")}

### Shadow

${formatTokenList(capture.tokens.shadows, "en", "No stable shadows captured.")}

### CSS Variables

${formatTokenList(capture.tokens.cssVariables, "en", "No active CSS variables captured.")}

## Layout Reference

${formatLayoutRules(capture, "en")}

## Implementation Path

${formatRebuildPlan(capture, "en")}

## Product Design Plugin Workflow (Optional)

${formatProductDesignPluginWorkflow(capture, "en")}

## Page Rhythm

${formatRhythm(capture, "en")}

## Component Map

${formatComponents(capture.components, "en")}

## Motion Map

${formatMotion(capture.motion, "en")}

## Interaction Timeline

${formatInteractionTimeline(capture, "en")}

## Interaction Strategy

${formatInteractionStrategy(capture, "en")}

## Originality Boundary

- Reuse proportions, cadence, hierarchy, and state language, not source code, copy, images, icons, or branding.
- If the source has strong motion, preserve the rhythm and trigger model, not the exact implementation.
- If the source has loading layers, pre-entry states, or scroll reveals, make them separate states instead of a single flat fade.

## Implementation Rules

- Build a token layer first: colors, type, spacing, radii, and shadows must become CSS variables or Tailwind theme values.
- Technical choices must follow Technical Route Selection: component libraries handle accessible structure, animation libraries handle timelines, and effect libraries handle pixels/shaders; do not hand-roll complex effects by default.
- Structure components before decoration; do not start by adding shadows, gradients, or oversized radii.
- Use captured display, gap, radius, and shadow values as defaults; do not introduce unrelated visual grammar.
- Replace content, images, and brand names; do not copy DOM, class names, trademarks, images, or proprietary copy.
- Hover, focus, active, and disabled states must remain consistent with the static token system.
- Preserve density relationships responsively: reduce columns on mobile, do not inflate type to fake hierarchy.
- For complex portfolio effects, use GSAP/ScrollTrigger or an equivalent timeline model: separate first-load entrance, scroll reveal, navigation hover, card hover, form feedback, and loading states.
- If the first pass is too flat, capture again with hover, scroll, focus, and animation-complete states before finalizing the skill.

## Do Not

- Do not copy source code, images, logos, icon-library setup, or tracking scripts.
- Do not reduce the style to generic purple gradients, glassmorphism, or oversized AI-looking cards.
- Do not add colors, typefaces, radius scales, or motion durations that conflict with captured evidence.
- Do not explain UI features with visible instructional text; express function through controls and layout.

## Acceptance Checklist

- Colors, type, spacing, radii, and shadows come from this skill's tokens or explicit derived values.
- Primary components map to at least one item in Component Patterns.
- Motion duration, easing, and trigger behavior follow Motion Rules.
- Desktop and mobile have no horizontal overflow, overlapping text, or clipped button labels.
- Accessibility baseline is met: semantic structure, keyboard focus, visible focus state, contrast checks.
- The final UI is an original product interface, not a screenshot-level clone.
`;
}
