import type { Locale } from "../../shared/i18n";
import type { ComponentSpec, DesignCapture, MotionSpec, TokenValue, TypographyToken } from "../../shared/schema";
import { formatPatternName } from "./skill-pattern-labels";

export function formatTokenList(tokens: TokenValue[], locale: Locale, empty: string) {
  if (!tokens.length) return `- ${empty}`;

  return tokens
    .slice(0, 12)
    .map((token, index) => {
      const samples = token.sampleSelectors.slice(0, 3).map((selector) => `\`${selector}\``).join(locale === "zh" ? "、" : ", ");
      const label = locale === "zh" ? `Token ${index + 1}` : `Token ${index + 1}`;
      const count = locale === "zh" ? `${token.count} 次` : `${token.count} uses`;
      return `- ${label}: \`${token.value}\` (${count})${samples ? `; ${locale === "zh" ? "证据" : "evidence"}: ${samples}` : ""}`;
    })
    .join("\n");
}

export function formatTypographyList(tokens: TypographyToken[], locale: Locale) {
  if (!tokens.length) return locale === "zh" ? "- 未捕捉到稳定字体。" : "- No stable typography captured.";

  return tokens
    .slice(0, 8)
    .map((token, index) => {
      const samples = token.sampleSelectors.slice(0, 2).map((selector) => `\`${selector}\``).join(locale === "zh" ? "、" : ", ");
      if (locale === "zh") {
        return `- 字体 ${index + 1}: ${token.family}; ${token.size}; 字重 ${token.weight}; 行高 ${token.lineHeight}; ${token.count} 次${samples ? `; 证据: ${samples}` : ""}`;
      }
      return `- Type ${index + 1}: ${token.family}; ${token.size}; weight ${token.weight}; line-height ${token.lineHeight}; ${token.count} uses${samples ? `; evidence: ${samples}` : ""}`;
    })
    .join("\n");
}

export function formatVisualStructure(capture: DesignCapture, locale: Locale) {
  const colors = capture.tokens.colors.slice(0, 4).map((token) => token.value);
  const backgrounds = capture.tokens.backgrounds.slice(0, 3).map((token) => token.value);
  const typography = capture.tokens.typography.slice(0, 3).map((token) => `${token.family} ${token.size}/${token.lineHeight}`);
  const structure = capture.layoutProfile.structure.slice(0, 4);
  const cadence = capture.layoutProfile.cadence.slice(0, 4);
  const emphasis = capture.layoutProfile.emphasis.slice(0, 4);

  if (locale === "zh") {
    return [
      `- 主色：${colors.join("、") || "未捕捉到"}`,
      `- 背景：${backgrounds.join("、") || "未捕捉到"}`,
      `- 字体：${typography.join("；") || "未捕捉到"}`,
      `- 结构：${structure.join("、") || "未捕捉到"}`,
      `- 节奏：${cadence.join("、") || "未捕捉到"}`,
      `- 强调：${emphasis.join("、") || "未捕捉到"}`
    ].join("\n");
  }

  return [
    `- Color: ${colors.join(", ") || "not captured"}`,
    `- Background: ${backgrounds.join(", ") || "not captured"}`,
    `- Type: ${typography.join(" ; ") || "not captured"}`,
    `- Structure: ${structure.join(", ") || "not captured"}`,
    `- Cadence: ${cadence.join(", ") || "not captured"}`,
    `- Emphasis: ${emphasis.join(", ") || "not captured"}`
  ].join("\n");
}

export function formatMotionOverview(capture: DesignCapture, locale: Locale) {
  const motionTypes = Array.from(new Set(capture.motion.map((item) => item.type)));
  const highlight = capture.motion.slice(0, 8).map((item) => `${item.name} · ${item.durationMs}ms · ${item.easing}`);
  const stages = capture.interactionTimeline?.patterns.slice(0, 5).map((pattern) => formatPatternName(pattern.kind, locale)) ?? [];

  if (locale === "zh") {
    return [
      `- 动效类型：${motionTypes.join("、") || "未捕捉到"}`,
      `- 重点动效：${highlight.join("；") || "未捕捉到"}`,
      `- 阶段模式：${stages.join("、") || "未录制时间线"}`
    ].join("\n");
  }

  return [
    `- Motion types: ${motionTypes.join(", ") || "not captured"}`,
    `- Key motions: ${highlight.join("; ") || "not captured"}`,
    `- Stage patterns: ${stages.join(", ") || "no timeline recorded"}`
  ].join("\n");
}

export function formatInteractionOverview(capture: DesignCapture, locale: Locale) {
  const triggers = Array.from(new Set(capture.interactions.map((item) => item.trigger)));
  const cues = capture.interactions.slice(0, 8).map((item) => `${item.trigger} · ${item.affordance} · ${item.cursor}`);
  const patterns = capture.interactionTimeline?.patterns.slice(0, 6).map((pattern) => `${formatPatternName(pattern.kind, locale)} (${pattern.confidence}%)`) ?? [];

  if (locale === "zh") {
    return [
      `- 触发方式：${triggers.join("、") || "未捕捉到"}`,
      `- 交互线索：${cues.join("；") || "未捕捉到"}`,
      `- 模式判断：${patterns.join("、") || "未录制时间线"}`
    ].join("\n");
  }

  return [
    `- Triggers: ${triggers.join(", ") || "not captured"}`,
    `- Interaction cues: ${cues.join("; ") || "not captured"}`,
    `- Pattern read: ${patterns.join(", ") || "no timeline recorded"}`
  ].join("\n");
}

export function formatMediaEffects(capture: DesignCapture, locale: Locale) {
  const timeline = capture.interactionTimeline;
  const patterns = timeline?.patterns ?? [];
  const lines = [
    patterns.some((item) => item.kind === "media-sequence") ? formatPatternLine("media-sequence", locale, capture) : "",
    patterns.some((item) => item.kind === "media-liquid-distortion") ? formatPatternLine("media-liquid-distortion", locale, capture) : "",
    patterns.some((item) => item.kind === "canvas-webgl-motion") ? formatPatternLine("canvas-webgl-motion", locale, capture) : "",
    patterns.some((item) => item.kind === "pointer-distortion") ? formatPatternLine("pointer-distortion", locale, capture) : ""
  ].filter(Boolean);

  if (locale === "zh") return lines.length ? lines.join("\n") : "- 未捕捉到明确媒体特效。";
  return lines.length ? lines.join("\n") : "- No explicit media effects captured.";
}

export function formatImplementationAdvice(capture: DesignCapture, locale: Locale) {
  const structure = capture.layoutProfile.structure.slice(0, 4);
  const cadence = capture.layoutProfile.cadence.slice(0, 4);
  const motion = capture.motion.slice(0, 4).map((item) => item.name);
  const hasTimeline = !!capture.interactionTimeline;

  if (locale === "zh") {
    return [
      `- 先做骨架：${structure.join("、") || cadence.join("、") || "先从布局和间距开始"}。`,
      `- 再补动效：${motion.join("、") || "从首屏和 hover 状态开始"}。`,
      `- 再补交互：${capture.interactions.length ? "按触发方式拆状态" : "建议补录 hover / click / scroll"}。`,
      `- 如有时间线：${hasTimeline ? "把阶段拆开实现" : "需要先补录时间线"}。`
    ].join("\n");
  }

  return [
    `- Build the shell first: ${structure.join(", ") || cadence.join(", ") || "start from layout and spacing"}.`,
    `- Add motion next: ${motion.join(", ") || "start with hero and hover states"}.`,
    `- Then add interactions: ${capture.interactions.length ? "split states by trigger" : "re-record hover / click / scroll"}.`,
    `- If there is a timeline: ${hasTimeline ? "implement phases separately" : "record a timeline first"}.`
  ].join("\n");
}

export function formatProductDesignPluginWorkflow(capture: DesignCapture, locale: Locale) {
  const isComponent = capture.scope === "component";

  if (locale === "zh") {
    return [
      "- 如果你的 AI 编码环境安装了 Product Design 插件，可把本 `skill.md`、`evidence.json` 和你的真实需求一起交给它。",
      isComponent
        ? "- 让 Product Design 先审查组件定位、内部层级、props/slots、状态矩阵、动效触发和响应式边界，再进入编码。"
        : "- 让 Product Design 先审查页面信息架构、首屏层级、模块顺序、动效节奏、组件清单和响应式策略，再进入编码。",
      "- 明确要求它基于本 Skill 的 token、布局语法、时间线和技术路线做原创方案，不复制源站素材、品牌、文案或私有实现。",
      "- 编码前让它输出设计决策、组件拆分、交互状态、动画库/特效库选型和验收清单；编码后再用同一清单复核。"
    ].join("\n");
  }

  return [
    "- If your AI coding workspace has a Product Design plugin installed, provide this `skill.md`, `evidence.json`, and your real product brief to it.",
    isComponent
      ? "- Ask Product Design to review component purpose, internal anatomy, props/slots, state matrix, motion triggers, and responsive boundaries before coding."
      : "- Ask Product Design to review page information architecture, hero hierarchy, section order, motion cadence, component list, and responsive strategy before coding.",
    "- Require it to create an original direction from this Skill's tokens, layout grammar, timeline, and technical routes without copying source assets, branding, copy, or private implementation.",
    "- Before coding, have it produce design decisions, component breakdown, interaction states, animation/effect-library choices, and an acceptance checklist; use the same checklist after implementation."
  ].join("\n");
}

export function formatImplementationTrace(capture: DesignCapture, locale: Locale) {
  const trace = capture.implementationTrace;
  if (!trace) {
    return locale === "zh"
      ? "- 未采集到实现链路证据；请重新录制页面，或使用未来的 CDP companion 获取脚本、CSS rule、事件监听器和 sourcemap 线索。"
      : "- No implementation trace captured; re-record the page or use the future CDP companion for script, CSS rule, event listener, and sourcemap evidence.";
  }

  const assets = trace.assets.slice(0, 12).map((asset) => {
    const signals = asset.signals.length ? asset.signals.join(locale === "zh" ? "、" : ", ") : locale === "zh" ? "无明显信号" : "no strong signal";
    return locale === "zh"
      ? `- ${asset.kind}: ${asset.label}；来源 ${asset.origin}；信号 ${signals}`
      : `- ${asset.kind}: ${asset.label}; origin ${asset.origin}; signals ${signals}`;
  });

  if (locale === "zh") {
    return [
      `- 框架痕迹：${trace.frameworkSignals.join("、") || "未识别到明确框架"}`,
      `- 库痕迹：${trace.librarySignals.join("、") || "未识别到明确库；按技术路线选择保守实现"}`,
      `- Sourcemap 线索：${trace.sourceMapHints.join("；") || "未发现可见 sourcemap 线索"}`,
      `- 事件模型：${trace.eventModelHints.join("；") || "未捕捉到事件模型线索"}`,
      `- 运行时样式：${trace.styleRuntimeHints.join("；") || "未捕捉到运行时样式线索"}`,
      `- 网络资源：${trace.networkHints.join("；") || "未捕捉到资源线索"}`,
      "",
      "### 资源摘要",
      assets.join("\n") || "- 未捕捉到资源摘要。",
      "",
      "> 说明：这些是实现链路证据，不是源码复制。用它们判断技术路线、事件触发、样式来源和动效层级；不要复制源站私有代码、素材或品牌资产。"
    ].join("\n");
  }

  return [
    `- Framework signals: ${trace.frameworkSignals.join(", ") || "no clear framework detected"}`,
    `- Library signals: ${trace.librarySignals.join(", ") || "no clear library detected; choose conservatively from Technical Route Selection"}`,
    `- Sourcemap hints: ${trace.sourceMapHints.join("; ") || "no visible sourcemap hints"}`,
    `- Event model: ${trace.eventModelHints.join("; ") || "no event model hints captured"}`,
    `- Runtime style: ${trace.styleRuntimeHints.join("; ") || "no runtime style hints captured"}`,
    `- Network resources: ${trace.networkHints.join("; ") || "no resource hints captured"}`,
    "",
    "### Asset Summary",
    assets.join("\n") || "- No asset summary captured.",
    "",
    "> Note: this is implementation-chain evidence, not source-code copying. Use it to infer technical routes, event triggers, style origins, and motion layers; do not copy private source, assets, or brand material."
  ].join("\n");
}

export function formatTechnicalRoutes(capture: DesignCapture, locale: Locale) {
  const timeline = capture.interactionTimeline;
  const patternKinds = timeline?.patterns.map((pattern) => pattern.kind) ?? [];
  const motionProps = capture.motion.flatMap((item) => item.properties);
  const tags = capture.analysis.tags.join(" ").toLowerCase();
  const structure = capture.layoutProfile.structure.join(" ").toLowerCase();
  const cadence = capture.layoutProfile.cadence.join(" ").toLowerCase();
  const componentNames = capture.components.map((item) => `${item.name} ${item.tagName}`).join(" ").toLowerCase();

  const hasScroll = patternKinds.includes("scroll-pinned-stage") || cadence.includes("scroll") || cadence.includes("pinned");
  const hasTimeline = patternKinds.includes("stage-state-machine") || capture.motion.some((item) => item.type === "state-machine") || capture.motion.length > 3;
  const hasPointer = patternKinds.includes("pointer-distortion") || patternKinds.includes("pointer-trail-field") || capture.interactions.some((item) => item.trigger === "hover");
  const hasLiquid = patternKinds.includes("media-liquid-distortion") || patternKinds.includes("pointer-distortion") || tags.includes("liquid");
  const hasCanvas = patternKinds.includes("canvas-webgl-motion") || capture.components.some((item) => item.tagName === "canvas") || componentNames.includes("canvas");
  const hasMedia = patternKinds.includes("media-sequence") || capture.components.some((item) => ["img", "video", "picture"].includes(item.tagName));
  const hasCarousel = structure.includes("carousel") || structure.includes("gallery") || componentNames.includes("carousel") || componentNames.includes("slider");
  const hasDialog = componentNames.includes("dialog") || componentNames.includes("modal") || capture.interactions.some((item) => item.affordance.toLowerCase().includes("open"));
  const hasForm = capture.interactions.some((item) => item.trigger === "input") || componentNames.includes("input") || componentNames.includes("form");
  const hasClip = motionProps.includes("clip-path") || capture.motion.some((item) => item.name.includes("clip-path"));

  if (locale === "zh") {
    const routes = [
      "- 技术栈矩阵：React/Next 适合 Radix UI 或 shadcn/ui + Motion/GSAP + Lenis + React Three Fiber/PixiJS；Vue/Nuxt 适合 Headless UI/Radix Vue + VueUse Motion/GSAP + Lenis + Three.js/PixiJS；纯 HTML/CSS/JS 适合语义 HTML + CSS variables + GSAP/Embla/SVG filter，避免引入框架级依赖。",
      "- 基础组件：React/Next 优先用 Radix UI 或 shadcn/ui 做 Dialog、Tabs、Dropdown、Tooltip、Popover、Command、Form 控件；Vue 优先 Headless UI / Radix Vue；纯 HTML 保留语义标签和 ARIA，不要让模型手搓键盘交互。",
      "- 普通动效：简单 hover、入场、折叠、按钮反馈可用 CSS transition/keyframes；React 项目可用 Motion；Vue 项目可用 VueUse Motion；需要跨框架或精确控制时用 GSAP。",
      hasTimeline ? "- 复杂时间线：使用 GSAP timeline 组织 preload、hero、scroll、hover、open/detail、exit；用 label 和 position 参数描述顺序，不要用一串 setTimeout。" : "- 时间线：如果只有少量过渡，先用 CSS/Motion；等捕捉到多阶段动效后再升级 GSAP timeline。",
      hasScroll ? "- 滚动驱动：优先 GSAP ScrollTrigger 处理 pinned stage、scrub、stagger、parallax；需要顺滑滚动时可叠加 Lenis，但必须同步 refresh 并提供 prefers-reduced-motion 降级。" : "- 滚动：普通 reveal 用 IntersectionObserver 或 Motion whileInView；不要为了轻量页面强上 smooth scroll。",
      hasPointer ? "- 指针交互：高频 mouse/pointer 追踪用 requestAnimationFrame 或 GSAP quickTo；将 x/y、速度、方向、衰减封装为输入，不要每次 move 新建动画实例。" : "- 指针交互：未捕捉到指针特效时只保留 hover/focus 状态，不要硬造跟随光标。",
      hasLiquid ? "- 液态/水纹/图片扰动：优先 PixiJS DisplacementFilter、Three.js shader plane 或 WebGL fragment shader；轻量替代可用 SVG filter + feDisplacementMap / CSS mask + blur，但真实水纹不要只用 scale/opacity。" : "- 媒体特效：若只是裁切和悬浮，用 CSS object-fit、clip-path、mask 即可；需要折射/扰动再上 PixiJS/Three.js。",
      hasCanvas ? "- Canvas/WebGL：2D 粒子、置换、图片滤镜用 PixiJS；3D 场景、shader 材质、透视空间用 Three.js / React Three Fiber；必须限制 DPR、暂停离屏动画、提供静态 fallback。" : "- 视觉层：没有 WebGL 证据时不要默认引入 Three.js；先用 DOM/CSS/SVG 完成结构和状态。",
      "- 互动插画/状态动画：Rive 适合可交互状态机、按钮/角色/品牌动效；Lottie 适合播放设计师从 After Effects 导出的矢量动画。它们负责插画/图形动画，不要用来承载核心布局和可访问交互。",
      hasMedia ? "- 图片/视频：Next 可用 next/image；画廊和媒体队列要有 loading、loaded、error、reduced-motion 状态；图片切换用预加载队列，不要让首屏闪烁。" : "- 媒体：若新项目需要图片，先定比例、裁切、加载态和暗色/亮色背景适配。",
      hasCarousel ? "- 轮播/横向作品流：优先 Embla Carousel，保留自定义 markup 和样式；不要手写惯性、拖拽和边界回弹。" : "- 列表/作品网格：普通网格用 CSS Grid；只有需要拖拽、惯性或精准 swipe 时才引入 Embla。",
      hasDialog ? "- 弹层/详情：Dialog、Sheet、Popover 用 Radix/shadcn，自己设计视觉；保留焦点陷阱、Esc 关闭、滚动锁定和返回焦点。" : "- 弹层：如果没有详情层，不要为了炫技加 modal；保留导航路径和链接状态即可。",
      hasForm ? "- 表单：React Hook Form + Zod 适合复杂校验；简单表单可原生约束；状态必须包括 focus、error、submitting、success。" : "- 表单：如果后续加订阅/联系表单，先复用 token 和圆角密度，再接校验库。",
      hasClip ? "- 遮罩/揭幕：clip-path、CSS mask、SVG mask 适合文字和图片揭幕；复杂路径 morph 可用 GSAP + SVG，注意 Safari 兼容和 fallback。" : "- 揭幕：没有捕捉到 mask/clip 证据时，不要把所有模块都做成遮罩动画。",
      "- 选型约束：先选最少库满足效果；组件库负责可访问结构，动画库负责时间线，特效库负责像素/Shader；不要让一个库包办所有层。"
    ];
    return routes.join("\n");
  }

  const routes = [
    "- Stack matrix: React/Next fits Radix UI or shadcn/ui + Motion/GSAP + Lenis + React Three Fiber/PixiJS; Vue/Nuxt fits Headless UI/Radix Vue + VueUse Motion/GSAP + Lenis + Three.js/PixiJS; plain HTML/CSS/JS fits semantic HTML + CSS variables + GSAP/Embla/SVG filters without framework-level dependencies.",
    "- Base components: for React/Next, prefer Radix UI or shadcn/ui for Dialog, Tabs, Dropdown, Tooltip, Popover, Command, and form controls; for Vue, prefer Headless UI / Radix Vue; for plain HTML, keep semantic elements and ARIA instead of hand-rolling keyboard behavior.",
    "- Basic motion: use CSS transitions/keyframes for simple hover, entrance, collapse, and button feedback; use Motion for React, VueUse Motion for Vue, and GSAP when precise cross-framework control is needed.",
    hasTimeline ? "- Complex timelines: use GSAP timeline for preload, hero, scroll, hover, open/detail, and exit phases; describe sequence with labels and position parameters instead of setTimeout chains." : "- Timelines: if the capture only shows a few transitions, start with CSS/Motion and upgrade to GSAP timeline only when multi-phase motion is recorded.",
    hasScroll ? "- Scroll-driven motion: prefer GSAP ScrollTrigger for pinned stages, scrub, stagger, and parallax; add Lenis only for smooth scroll and keep refresh/reduced-motion behavior explicit." : "- Scroll: use IntersectionObserver or Motion whileInView for ordinary reveals; do not add smooth scrolling to lightweight pages by default.",
    hasPointer ? "- Pointer interaction: use requestAnimationFrame or GSAP quickTo for high-frequency pointer tracking; model x/y, speed, direction, and decay as inputs instead of creating new animations on every move." : "- Pointer interaction: if no pointer effect was captured, keep hover/focus states and avoid inventing cursor followers.",
    hasLiquid ? "- Liquid/ripple/image distortion: prefer PixiJS DisplacementFilter, a Three.js shader plane, or a WebGL fragment shader; lightweight fallback can use SVG filter + feDisplacementMap / CSS mask + blur, but real ripple should not be reduced to scale/opacity." : "- Media effects: use CSS object-fit, clip-path, and mask for crop/hover effects; move to PixiJS/Three.js only for refraction or displacement.",
    hasCanvas ? "- Canvas/WebGL: use PixiJS for 2D particles, displacement, and image filters; use Three.js / React Three Fiber for 3D scenes, shader materials, and perspective space; cap DPR, pause off-screen animation, and provide a static fallback." : "- Visual layer: without WebGL evidence, do not add Three.js by default; finish DOM/CSS/SVG structure and states first.",
    "- Interactive illustration/state animation: Rive fits interactive state machines, buttons, characters, and brand motion; Lottie fits playback of designer-exported After Effects vector animation. Use them for illustration/graphic layers, not core layout or accessible interaction.",
    hasMedia ? "- Image/video: use next/image in Next; media queues need loading, loaded, error, and reduced-motion states; preload image sequences to avoid first-screen flicker." : "- Media: if the new product needs images, define aspect ratio, crop, loading state, and light/dark background behavior first.",
    hasCarousel ? "- Carousel/horizontal work flow: prefer Embla Carousel for swipe precision and extensibility while keeping custom markup and styling." : "- Lists/work grids: use CSS Grid for ordinary grids; introduce Embla only when drag, inertia, or precise swipe is needed.",
    hasDialog ? "- Overlay/detail: use Radix/shadcn Dialog, Sheet, or Popover and design the visual layer yourself; preserve focus trap, Esc close, scroll lock, and return focus." : "- Overlay: if there is no captured detail layer, avoid adding modals for decoration; keep navigation and link states clear.",
    hasForm ? "- Forms: React Hook Form + Zod fits complex validation; simple forms can use native constraints; include focus, error, submitting, and success states." : "- Forms: if a subscribe/contact form is added later, reuse the token/radius density before wiring validation.",
    hasClip ? "- Masks/reveals: use clip-path, CSS mask, or SVG mask for text/media reveals; use GSAP + SVG for complex path morphs and verify Safari fallback." : "- Reveals: without mask/clip evidence, do not turn every module into a reveal animation.",
    "- Selection rule: choose the smallest library set that matches the effect; component libraries handle accessible structure, animation libraries handle timelines, and effect libraries handle pixels/shaders."
  ];
  return routes.join("\n");
}

function formatPatternLine(kind: NonNullable<DesignCapture["interactionTimeline"]>["patterns"][number]["kind"], locale: Locale, capture: DesignCapture) {
  const pattern = capture.interactionTimeline?.patterns.find((item) => item.kind === kind);
  if (!pattern) return "";
  return locale === "zh"
    ? `- ${formatPatternName(kind, locale)}：${pattern.evidence.join("、") || "无证据"}；实现 ${pattern.implementationNotes.join("、") || "按时间线还原"}`
    : `- ${formatPatternName(kind, locale)}: ${pattern.evidence.join(", ") || "no evidence"}; implement ${pattern.implementationNotes.join(", ") || "follow timeline"}`;
}

export function formatRebuildPlan(capture: DesignCapture, locale: Locale) {
  const hasLoading = capture.motion.some((item) => /load|loading|preload|enter/i.test(item.name));
  const hasScroll = capture.layoutProfile.cadence.some((item) => item.includes("scroll") || item.includes("pinned"));
  const hasHover = capture.interactions.some((item) => item.trigger === "hover");
  const hasInput = capture.interactions.some((item) => item.trigger === "input");
  const hasNav = capture.interactions.some((item) => item.trigger === "navigation");
  const hasStateMachine = capture.motion.some((item) => item.type === "state-machine");
  const hasClipReveal = capture.motion.some((item) => item.properties.includes("clip-path") || item.name.includes("clip-path"));
  const hasAnchors = capture.layoutProfile.structure.some((item) => item.includes("anchor")) || capture.motion.some((item) => item.name.includes("anchor"));

  if (locale === "zh") {
    return [
      `- 1. 静态骨架：先用布局语法还原首屏、导航、模块分区和主要内容流${hasAnchors ? "，固定锚点层必须单独建层" : ""}。`,
      `- 2. 状态层：${hasHover ? "补 hover" : "若存在 hover 则补 hover"}、${hasInput ? "补输入反馈" : "若存在表单则补输入反馈"}、${hasNav ? "补导航路径" : "若存在导航则补当前路径"}。`,
      `- 3. 动效层：${hasLoading ? "把加载/预热态单独做成状态" : "如需加载感，独立做轻量 loading state"}，${hasScroll ? "滚动揭示/钉住舞台分段实现" : "如果无明显滚动线索则保持轻量过渡"}${hasClipReveal ? "，clip-path 揭幕不要替换成普通淡入" : ""}。`,
      hasStateMachine ? "- 4. 状态机：把 preload、hero、scroll、hover、detail/open 拆成可测试状态，不要混成一个大动画。" : "- 4. 视觉打磨：最后才微调圆角、阴影、边框和微交互，不要先动这些再回头补结构。",
      hasStateMachine ? "- 5. 视觉打磨：最后才微调圆角、阴影、边框和微交互，不要先动这些再回头补结构。" : ""
    ].filter(Boolean).join("\n");
  }

  return [
    `- 1. Static shell: rebuild the hero, navigation, section bands, and primary content flow first${hasAnchors ? "; keep fixed anchor layers separate" : ""}.`,
    `- 2. State layer: ${hasHover ? "add hover" : "add hover if it exists"}, ${hasInput ? "add input feedback" : "add input feedback if forms exist"}, ${hasNav ? "add navigation path feedback" : "add navigation path feedback if relevant"}.`,
    `- 3. Motion layer: ${hasLoading ? "treat loading/pre-entry as a separate state" : "add a lightweight loading state if needed"}, ${hasScroll ? "implement scroll reveals / pinned stage transitions in segments" : "keep transitions light if no scroll cadence is captured"}${hasClipReveal ? "; keep clip-path reveals instead of replacing them with fade-ins" : ""}.`,
    hasStateMachine ? "- 4. State machine: split preload, hero, scroll, hover, and detail/open states into testable phases." : "- 4. Polish last: tune radii, shadows, borders, and micro-interactions only after structure and states are in place.",
    hasStateMachine ? "- 5. Polish last: tune radii, shadows, borders, and micro-interactions only after structure and states are in place." : ""
  ].filter(Boolean).join("\n");
}

export function formatLayoutRules(capture: DesignCapture, locale: Locale) {
  const displays = countValues(capture.layout.map((item) => item.display));
  const gaps = countValues(capture.layout.map((item) => item.gap).filter((gap) => gap && gap !== "normal"));
  const alignments = countValues(capture.layout.map((item) => item.alignItems).filter(Boolean));
  const justifications = countValues(capture.layout.map((item) => item.justifyContent).filter(Boolean));
  const density = findDensityTag(capture.analysis.tags, locale);

  if (locale === "zh") {
    return [
      `- 密度：${density}`,
      `- Display：${formatCounts(displays, "未捕捉到")}`,
      `- Gap：${formatCounts(gaps, "未捕捉到")}`,
      `- Align：${formatCounts(alignments, "未捕捉到")}`,
      `- Justify：${formatCounts(justifications, "未捕捉到")}`,
      "- 页面结构优先使用捕捉到的主 display 模式；只有内容真实需要时才引入新布局模式。"
    ].join("\n");
  }

  return [
    `- Density: ${density}`,
    `- Display: ${formatCounts(displays, "not captured")}`,
    `- Gap: ${formatCounts(gaps, "not captured")}`,
    `- Align: ${formatCounts(alignments, "not captured")}`,
    `- Justify: ${formatCounts(justifications, "not captured")}`,
    "- Prefer captured display modes for page structure; introduce new layout modes only when content requires them."
  ].join("\n");
}

export function formatRhythm(capture: DesignCapture, locale: Locale) {
  if (locale === "zh") {
    return [
      `- 节奏：${capture.layoutProfile.cadence.join("、") || "均衡节奏"}`,
      `- 强调：${capture.layoutProfile.emphasis.join("、") || "均衡强调"}`,
      "- 如果要复刻这种感觉，优先还原首屏压强、模块间距和滚动后的节奏切换。"
    ].join("\n");
  }

  return [
    `- Cadence: ${capture.layoutProfile.cadence.join(", ") || "balanced cadence"}`,
    `- Emphasis: ${capture.layoutProfile.emphasis.join(", ") || "balanced emphasis"}`,
    "- To recreate the feel, prioritize first-screen pressure, module spacing, and the cadence shift after scroll."
  ].join("\n");
}

export function formatComponents(components: ComponentSpec[], locale: Locale) {
  if (!components.length) return locale === "zh" ? "- 未捕捉到明确组件。先按 token 和布局语法实现基础界面。" : "- No clear components captured. Build from tokens and layout grammar first.";

  return components
    .slice(0, 10)
    .map((component, index) => {
      if (locale === "zh") {
        return `### ${index + 1}. ${component.name}

- 选择器：\`${component.selector}\`
- 置信度：${component.confidence}%
- 标签：${component.tagName}
- 文本样例：${component.textSample || "无"}
- 布局：${component.layout.display}; ${component.layout.width}x${component.layout.height}; gap ${component.layout.gap}; align ${component.layout.alignItems}; justify ${component.layout.justifyContent}
- 视觉：color ${component.visual.color}; bg ${component.visual.backgroundColor}; radius ${component.visual.borderRadius}; shadow ${component.visual.boxShadow}; border ${component.visual.border}
- 实现：保留该组件的层级、密度和状态反馈；内容和命名必须原创。`;
      }

      return `### ${index + 1}. ${component.name}

- Selector: \`${component.selector}\`
- Confidence: ${component.confidence}%
- Tag: ${component.tagName}
- Text sample: ${component.textSample || "none"}
- Layout: ${component.layout.display}; ${component.layout.width}x${component.layout.height}; gap ${component.layout.gap}; align ${component.layout.alignItems}; justify ${component.layout.justifyContent}
- Visual: color ${component.visual.color}; bg ${component.visual.backgroundColor}; radius ${component.visual.borderRadius}; shadow ${component.visual.boxShadow}; border ${component.visual.border}
- Implement: preserve hierarchy, density, and state feedback; content and naming must be original.`;
    })
    .join("\n\n");
}

export function formatComponentBlueprint(capture: DesignCapture, locale: Locale) {
  const primary = capture.components[0];
  const children = capture.components.slice(1, 8);
  const layout = capture.layout.slice(0, 6);
  const structure = capture.layoutProfile.structure.slice(0, 4);

  if (locale === "zh") {
    return [
      `- 根组件：${primary ? `${primary.name} / \`${primary.selector}\` / ${primary.layout.display} / ${primary.layout.width}x${primary.layout.height}` : "未捕捉到明确根组件，按选区容器建模。"}`,
      `- 内部层级：${children.length ? children.map((item) => `${item.name}(\`${item.selector}\`)`).join("、") : "按内容拆分为 header/body/media/actions/state layer。"}`,
      `- 布局语法：${structure.join("、") || layout.map((item) => `${item.display} gap ${item.gap}`).join("、") || "未捕捉到稳定布局；先按容器 + 内容区 + 动作区建模。"}`,
      "- 实现建议：组件内部不要拍平成一个 div；至少拆容器、内容、媒体/装饰、动作区和状态层。"
    ].join("\n");
  }

  return [
    `- Root component: ${primary ? `${primary.name} / \`${primary.selector}\` / ${primary.layout.display} / ${primary.layout.width}x${primary.layout.height}` : "No clear root component captured; model the selected scope as a container."}`,
    `- Internal layers: ${children.length ? children.map((item) => `${item.name}(\`${item.selector}\`)`).join(", ") : "split into header/body/media/actions/state layer."}`,
    `- Layout grammar: ${structure.join(", ") || layout.map((item) => `${item.display} gap ${item.gap}`).join(", ") || "No stable layout captured; start with container + content area + actions."}`,
    "- Implementation: do not flatten the component into one div; separate container, content, media/decor, action area, and state layer."
  ].join("\n");
}

export function formatComponentStates(capture: DesignCapture, locale: Locale) {
  const triggers = Array.from(new Set(capture.interactions.map((item) => item.trigger))).filter(Boolean);
  const interactions = capture.interactions.slice(0, 8);
  const timelinePatterns = capture.interactionTimeline?.patterns.slice(0, 5).map((pattern) => formatPatternName(pattern.kind, locale)) ?? [];

  if (locale === "zh") {
    return [
      `- 已捕捉触发：${triggers.join("、") || "未捕捉到明确触发；至少补 default / hover / focus / active。"}`,
      interactions.length
        ? interactions.map((item) => `- ${item.trigger}: \`${item.selector}\`; ${item.affordance}; cursor ${item.cursor}; transition ${item.transitionProperties.join("+") || "未捕捉到"}`).join("\n")
        : "- 默认状态：保留基础可点击/可聚焦反馈；不要凭空添加复杂状态。",
      `- 动效/状态模式：${timelinePatterns.join("、") || "未录到组件时间线；如果组件有 hover、open、loading、media swap，请补录后再定稿。"}`
    ].join("\n");
  }

  return [
    `- Captured triggers: ${triggers.join(", ") || "no clear trigger; at least implement default / hover / focus / active."}`,
    interactions.length
      ? interactions.map((item) => `- ${item.trigger}: \`${item.selector}\`; ${item.affordance}; cursor ${item.cursor}; transition ${item.transitionProperties.join("+") || "not captured"}`).join("\n")
      : "- Default state: preserve basic clickable/focusable feedback; do not invent complex states without evidence.",
    `- Motion/state patterns: ${timelinePatterns.join(", ") || "No component timeline captured; record hover, open, loading, or media swap before finalizing if the component depends on them."}`
  ].join("\n");
}

export function formatComponentApi(capture: DesignCapture, locale: Locale) {
  const hasMedia = capture.components.some((item) => ["img", "video", "picture", "canvas", "svg"].includes(item.tagName)) || capture.interactionTimeline?.patterns.some((item) => item.kind.includes("media") || item.kind.includes("canvas"));
  const hasAction = capture.interactions.some((item) => item.trigger === "click" || item.trigger === "navigation");
  const hasState = capture.interactions.length > 0 || Boolean(capture.interactionTimeline?.patterns.length);

  if (locale === "zh") {
    return [
      "- Props：`title`、`eyebrow`、`description`、`items` 按实际内容取舍；不要把源站文案写死。",
      hasMedia ? "- Media slots：提供 `media` / `image` / `video` / `visualLayer`，复杂扰动效果放在独立 visual layer。" : "- Media slots：若新组件需要媒体，保持同一比例和裁切节奏，不强行复用源站图片。",
      hasAction ? "- Actions：提供 `primaryAction` / `secondaryAction` / `href` / `onClick`，并补 hover/focus/active。" : "- Actions：没有明确动作时，不要硬加大 CTA；保持组件信息层级。",
      hasState ? "- Variants：至少定义 `default`、`hover`、`active/open`、`disabled`；如有异步行为补 `loading/error/success`。" : "- Variants：至少定义 `default` 和 `focus-visible`，后续按业务补状态。",
      "- Motion hooks：把入场、hover、open/close、media swap 拆成独立 timeline 或 class，不要写成不可复用的一次性动画。"
    ].join("\n");
  }

  return [
    "- Props: choose from `title`, `eyebrow`, `description`, and `items`; never hard-code source copy.",
    hasMedia ? "- Media slots: expose `media` / `image` / `video` / `visualLayer`; put complex distortion in a separate visual layer." : "- Media slots: if the new component needs media, preserve proportion and cropping rhythm without reusing source imagery.",
    hasAction ? "- Actions: expose `primaryAction` / `secondaryAction` / `href` / `onClick`, with hover/focus/active states." : "- Actions: do not force a large CTA if the captured component has no clear action; preserve information hierarchy.",
    hasState ? "- Variants: define at least `default`, `hover`, `active/open`, and `disabled`; add `loading/error/success` for async behavior." : "- Variants: define at least `default` and `focus-visible`; add business states later.",
    "- Motion hooks: split entrance, hover, open/close, and media swap into reusable timelines or classes rather than one-off animation code."
  ].join("\n");
}

export function formatMotion(motion: MotionSpec[], locale: Locale) {
  if (!motion.length) {
    return locale === "zh"
      ? "- 未捕捉到明显动效。不要臆造复杂效果；先重新手动录制加载、滚动、鼠标移动和 hover 状态，再决定是否需要视觉层级动画。"
      : "- No clear motion captured. Do not invent complex effects; re-record loading, scroll, pointer movement, and hover states before deciding the visual motion layer.";
  }

  return motion
    .slice(0, 14)
    .map((item) => {
      const kind = item.type === "state-machine" ? (locale === "zh" ? "机制" : "mechanism") : item.type;
      if (locale === "zh") {
        return `- ${kind}: ${item.name}; ${item.durationMs}ms; delay ${item.delayMs}ms; easing ${item.easing}; 属性 ${item.properties.join("、") || "状态语义"}; 选择器 \`${item.selector}\``;
      }
      return `- ${kind}: ${item.name}; ${item.durationMs}ms; delay ${item.delayMs}ms; easing ${item.easing}; properties ${item.properties.join(", ") || "state semantics"}; selector \`${item.selector}\``;
    })
    .join("\n");
}


export function formatInteractionStrategy(capture: DesignCapture, locale: Locale) {
  const interactionKinds = Array.from(new Set(capture.interactions.map((item) => item.trigger))).filter(Boolean);
  const hasNavigation = capture.interactions.some((item) => item.trigger === "navigation");
  const hasInput = capture.interactions.some((item) => item.trigger === "input");
  const hasHover = capture.interactions.some((item) => item.trigger === "hover" || item.stateSignals.some((signal) => signal.includes("hover")));
  const hasLongScroll = capture.layoutProfile.cadence.some((item) => item.includes("scroll") || item.includes("pinned"));
  const hasHero = capture.layoutProfile.emphasis.some((item) => item.includes("hero"));
  const hasClip = capture.motion.some((item) => item.properties.includes("clip-path") || item.name.includes("clip-path"));
  const hasBlend = capture.motion.some((item) => item.properties.includes("mix-blend-mode"));
  const hasScene = capture.interactions.some((item) => item.affordance.includes("scene")) || capture.motion.some((item) => item.name.includes("project scene"));
  const timeline = capture.interactionTimeline;
  const hasPointerDistortion = timeline?.patterns.some((item) => item.kind === "pointer-distortion");
  const hasMediaSequence = timeline?.patterns.some((item) => item.kind === "media-sequence");
  const hasMediaLiquidDistortion = timeline?.patterns.some((item) => item.kind === "media-liquid-distortion");
  const hasPinnedTimeline = timeline?.patterns.some((item) => item.kind === "scroll-pinned-stage");
  const hasStageMachine = timeline?.patterns.some((item) => item.kind === "stage-state-machine");
  const hasPointerTrailField = timeline?.patterns.some((item) => item.kind === "pointer-trail-field");
  const hasTypographyPhase = timeline?.patterns.some((item) => item.kind === "typography-phase");

  if (locale === "zh") {
    return [
      `- 已捕捉交互类型：${interactionKinds.join("、") || "未捕捉到明确触发类型"}。`,
      hasHero ? "- 首屏：使用分段 timeline 做标题/副文/媒体层入场，避免一次性淡入。" : "- 首屏：保持静态层级清晰，不强行添加大型入场动效。",
      hasStageMachine ? "- 阶段状态机：preloader、媒体队列、稳定首屏、黑底文字、水纹指针场、作品区、详情层必须拆成可测试状态；每个状态要有进入、停留、退出和降级策略。" : "",
      hasPinnedTimeline || hasLongScroll ? "- 滚动：用滚动触发的 reveal/stagger 或 pinned stage，让作品卡、标题、中心媒体和辅助图形分批进入。" : "- 滚动：保持模块节奏一致；未录到滚动阶段时不要臆造复杂 pinned 动效。",
      hasMediaSequence ? "- 媒体队列：把首屏/加载图片作为有序队列实现，分清 loading animation、第一张稳定图、滚动后的媒体交接。" : "",
      hasMediaLiquidDistortion ? "- 媒体液态扰动：对图片/卡片使用局部位移、blur、mask 和 refraction 高光，不要把它降级成普通 hover 放大。" : "",
      hasPointerDistortion ? "- 鼠标扰动：把 pointer x/y/速度/方向/衰减作为输入驱动水波、位移、mask 或 shader；必须明确在白底、黑底、媒体层哪一阶段出现，不要只做 cursor scale。" : "",
      hasPointerTrailField ? "- 水纹轨迹场：用上一帧坐标和速度向量拉伸拖尾，至少实现宽模糊 wake、中等 ribbon、锐利 leading edge 三层，并在黑底大字阶段实测遮挡关系。" : "",
      hasTypographyPhase ? "- 黑底文字阶段：大字排版是核心结构，记录行高、换行、固定侧标、clip 揭幕、混合模式和鼠标扰动穿越文字的层级关系。" : "",
      hasNavigation ? "- 导航：复现 hover 的方向感、图标/文字微位移、cursor pointer 和当前路径反馈。" : "- 导航：至少实现 hover/focus 可见反馈。",
      hasHover ? "- Hover：卡片和链接建议使用 transform + opacity + clip-path，避免改 layout 属性造成卡顿。" : "- Hover：如果未录到 hover，只实现可访问的 focus/active 基础态，不要臆造主视觉特效。",
      hasScene ? "- 作品场景：卡片不是静态网格，至少包含指针热点、媒体形变、标题混合/反差和 click/open 详情状态。" : "- 作品场景：如果新增作品卡，必须补 hover/focus/click 三态。",
      hasClip ? "- 揭幕：clip-path/遮罩类动效要作为主节奏保留，不要用普通 opacity fade 代替。" : "",
      hasBlend ? "- 反差层：mix-blend-mode 用于导航/标题穿越深浅背景时保持识别度，必须实测可读性。" : "",
      hasInput ? "- 表单：输入框需要 focus、required/error、提交中和完成态，不只做静态输入框。" : "- 表单：如果新产品有表单，按同一密度和圆角系统实现状态反馈。",
      "- 性能：动画只改 transform/opacity/filter；滚动监听要节流或交给 ScrollTrigger/IntersectionObserver。"
    ].filter(Boolean).join("\n");
  }

  return [
    `- Captured triggers: ${interactionKinds.join(", ") || "no clear trigger types captured"}.`,
    hasHero ? "- Hero: use a segmented timeline for title, supporting copy, and media entrance; avoid one flat fade-in." : "- Hero: keep hierarchy clear and avoid forced large entrance motion.",
    hasStageMachine ? "- Stage state machine: split preloader, media queue, stable hero, dark typography, pointer field, work grid, and detail layer into testable states with enter/hold/exit/reduced-motion behavior." : "",
    hasPinnedTimeline || hasLongScroll ? "- Scroll: use scroll-triggered reveal/stagger or a pinned stage for work cards, headings, center media, and supporting graphics." : "- Scroll: keep module cadence steady; do not invent pinned motion if no scroll phase was recorded.",
    hasMediaSequence ? "- Media queue: implement first-load/hero images as an ordered queue; separate loading animation, first stable image, and scroll handoff." : "",
    hasMediaLiquidDistortion ? "- Media liquid distortion: make the hovered image/card a local displacement field with blur, mask, and refraction highlights; do not reduce it to a generic scale hover." : "",
    hasPointerDistortion ? "- Pointer distortion: use pointer x/y/speed/direction/decay as inputs for ripple, displacement, mask, or shader motion; specify whether it belongs to the light stage, dark typography stage, or media layer, and do not reduce it to cursor scale." : "",
    hasPointerTrailField ? "- Pointer trail field: stretch the wake from previous pointer coordinates and speed vector; use broad blur, mid ribbon, and sharp leading edge layers, then verify occlusion on the dark typography stage." : "",
    hasTypographyPhase ? "- Dark typography phase: large type is structural; preserve line-height, breaks, fixed anchors, clip reveal, blend mode, and pointer-layer crossing rules." : "",
    hasNavigation ? "- Navigation: rebuild hover direction, icon/text micro-shifts, pointer cursor, and current-path feedback." : "- Navigation: at least implement visible hover/focus feedback.",
    hasHover ? "- Hover: use transform + opacity + clip-path on cards and links; avoid layout properties that cause jank." : "- Hover: if hover was not recorded, implement only accessible focus/active basics and avoid inventing hero effects.",
    hasScene ? "- Work scenes: cards are not a static grid; include pointer spotlight, media morph, title contrast, and click/open detail states." : "- Work scenes: if you add cards, include hover/focus/click states.",
    hasClip ? "- Reveal: keep clip-path/mask reveals as a primary rhythm; do not substitute plain opacity fades." : "",
    hasBlend ? "- Contrast layer: use mix-blend-mode only where nav/title readability has been verified across light/dark surfaces." : "",
    hasInput ? "- Forms: include focus, required/error, submitting, and success states, not just static fields." : "- Forms: if present in the new product, keep feedback aligned with the captured density/radius system.",
    "- Performance: animate transform/opacity/filter only; throttle scroll listeners or use ScrollTrigger/IntersectionObserver."
  ].filter(Boolean).join("\n");
}

function countValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

function formatCounts(counts: Array<[string, number]>, empty: string) {
  if (!counts.length) return empty;
  return counts.map(([value, count]) => `${value} (${count})`).join(", ");
}

function findDensityTag(tags: string[], locale: Locale) {
  return (
    tags.find((tag) => tag.includes("spacing") || tag.includes("compact") || tag.includes("间距") || tag.includes("紧凑") || tag.includes("密度")) ??
    (locale === "zh" ? "均衡间距节奏" : "balanced spacing rhythm")
  );
}
