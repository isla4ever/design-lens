import type { Locale } from "../shared/i18n";
import type { DesignCapture } from "../shared/schema";
import { buildEvidencePack, type EvidencePack } from "../evidence/evidence-pack";
import { formatDesignBriefForPrompt, type DesignBrief } from "../shared/design-brief";

export type AiAnalysisPayload = {
  version: 1;
  locale: Locale;
  task: "page-design-reference" | "component-reference";
  capture: {
    source: {
      title: string;
      url: string;
      scope: DesignCapture["scope"];
      viewport: string;
    };
    tokens: {
      colors: string[];
      backgrounds: string[];
      typography: string[];
      spacing: string[];
      radii: string[];
      shadows: string[];
    };
    layout: string[];
    components: string[];
    interactions: string[];
    motion: string[];
    timelinePatterns: string[];
    implementation: string[];
    evidenceMetrics: Record<string, number>;
    evidencePack: EvidencePack;
  };
};

export function buildAiAnalysisPayload(capture: DesignCapture, locale: Locale): AiAnalysisPayload {
  const timeline = capture.interactionTimeline;
  const evidencePack = buildEvidencePack(capture);
  return {
    version: 1,
    locale,
    task: capture.scope === "component" ? "component-reference" : "page-design-reference",
    capture: {
      source: {
        title: capture.page.title,
        url: capture.page.url,
        scope: capture.scope ?? "page",
        viewport: `${capture.viewport.width}x${capture.viewport.height}@${capture.viewport.devicePixelRatio}`
      },
      tokens: {
        colors: capture.tokens.colors.slice(0, 10).map((token) => token.value),
        backgrounds: capture.tokens.backgrounds.slice(0, 8).map((token) => token.value),
        typography: capture.tokens.typography.slice(0, 8).map((token) => `${token.family} ${token.size}/${token.lineHeight} w${token.weight}`),
        spacing: capture.tokens.spacing.slice(0, 10).map((token) => token.value),
        radii: capture.tokens.radii.slice(0, 8).map((token) => token.value),
        shadows: capture.tokens.shadows.slice(0, 8).map((token) => token.value)
      },
      layout: [
        ...capture.layoutProfile.structure,
        ...capture.layoutProfile.cadence,
        ...capture.layoutProfile.emphasis,
        ...capture.layout.slice(0, 8).map((item) => `${item.display} ${item.width}x${item.height} gap:${item.gap} align:${item.alignItems}`)
      ].slice(0, 20),
      components: capture.components.slice(0, 12).map((item) => `${item.name} ${item.tagName} ${item.layout.display} ${item.layout.width}x${item.layout.height} ${item.selector}`),
      interactions: capture.interactions.slice(0, 12).map((item) => `${item.trigger} ${item.affordance} cursor:${item.cursor} ${item.selector}`),
      motion: capture.motion.slice(0, 12).map((item) => `${item.type} ${item.name} ${item.durationMs}ms ${item.easing} props:${item.properties.join("+")}`),
      timelinePatterns: timeline?.patterns.slice(0, 10).map((pattern) => `${pattern.kind} ${pattern.confidence}% evidence:${pattern.evidence.join("; ")}`) ?? [],
      implementation: [
        ...(capture.implementationTrace?.frameworkSignals.slice(0, 8).map((item) => `framework:${item}`) ?? []),
        ...(capture.implementationTrace?.librarySignals.slice(0, 10).map((item) => `library:${item}`) ?? []),
        ...(capture.implementationTrace?.eventModelHints.slice(0, 6).map((item) => `event:${item}`) ?? []),
        ...(capture.implementationTrace?.styleRuntimeHints.slice(0, 6).map((item) => `style:${item}`) ?? []),
        ...(capture.implementationTrace?.sourceMapHints.slice(0, 4).map((item) => `sourcemap:${item}`) ?? []),
        ...(capture.implementationTrace?.assets.slice(0, 12).map((asset) => `asset:${asset.kind}:${asset.label}:${asset.signals.join("+")}`) ?? [])
      ].slice(0, 36),
      evidenceMetrics: {
        pointerSamples: timeline?.pointerSamples.length ?? 0,
        frameSamples: timeline?.frameSamples.length ?? 0,
        runtimeAnimations: timeline?.runtimeAnimations?.length ?? 0,
        domMutations: timeline?.domMutations?.length ?? 0,
        visualSurfaces: timeline?.visualSurfaces?.length ?? 0,
        performanceEvents: timeline?.performanceEvents?.length ?? 0
      },
      evidencePack
    }
  };
}

export function buildAiPrompt(payload: AiAnalysisPayload, brief?: DesignBrief) {
  const zh = payload.locale === "zh";
  const system = zh
    ? "你是顶级前端产品设计工程师、交互动效架构师和 AI Coding Brief 编译器。你的任务不是总结参考网站，而是把参考网站的结构化证据转译成用户目标网站的原创实施方案。必须可落地、可复用、少废话，不复制源码、品牌、图片或文案。"
    : "You are a senior product-minded frontend design engineer, motion architect, and AI coding brief compiler. Your job is not to summarize the reference site; it is to translate structured evidence into an original implementation plan for the user's target site. Keep it actionable, reusable, concise, and do not copy source code, branding, imagery, or copy.";
  const instruction = zh
    ? [
        "请输出 Markdown，标题使用：目标网站实施 Brief。",
        "重要：如果用户填写了网站/产品类型或目标项目，所有章节都必须围绕该目标，不允许输出“参考网站总结版”。",
        "输入来源说明：本提示词已经把参考站的 token、Skill 片段、motion 线索和证据摘要做了压缩，你需要把它们作为约束条件和证据来源，而不是重复复述。",
        "输出格式必须严格遵守，禁止改写成散文、建议清单或空泛总结。",
        "必须包含：",
        "1. 目标定位：一句话说明用户要做的网站，以及参考站哪些气质可借鉴、哪些不能照搬。",
        "2. 参考证据到目标模块映射表：用表格列出参考证据、目标网站模块、具体落地方式、不要照搬的部分。至少 8 行；如果是 SaaS，必须覆盖 hero、导航、产品价值、功能区、用例/流程、指标/信任、价格/CTA、页脚。",
        "3. 目标页面信息架构：按首屏到页脚给出模块顺序、每个模块的布局比例、内容密度、CTA 位置和响应式变化。",
        "4. Token 转译方案：把颜色、字体、间距、圆角、阴影转成目标项目可用的设计变量，并说明暗/亮背景切换规则。",
        "5. 动效与交互实施蓝图：按 loading、首屏入场、滚动、hover、指针/媒体特效、详情/CTA 状态拆分；每条必须包含触发、时长/缓动、实现方式、降级策略。",
        "6. 技术路线选择：按用户技术栈推荐组件库、动画库、滚动库、媒体/Canvas/WebGL/互动动画特效库路线；按 React/Next、Vue/Nuxt、HTML/CSS/JS 分类说明适配度，并说明何时不该手搓。",
        "7. 可直接交给 AI coding 的详细实现提示词：必须包含目标业务语义、模块列表、组件拆分、CSS/动画关键参数、库选择和验收标准。",
        "8. 原创边界：明确哪些只能借鉴为风格/节奏/模式，哪些不能复制。",
        "9. 证据缺口：只列会影响实现质量的缺口，并说明如何补录。",
        "如果证据不足，请明确哪些状态需要补录，不要臆造；但已捕捉到的证据必须转译成目标网站的具体实现。"
      ].join("\n")
    : [
        "Return Markdown titled: Target Site Implementation Brief.",
        "Important: if the user provided a site/product type or target project, every section must center that target; do not output a reference-site summary.",
        "Input note: the prompt already contains compressed token evidence, Skill fragments, motion cues, and evidence summaries. Treat them as constraints and source evidence, not text to repeat.",
        "Output format must be followed exactly; do not turn this into prose, a loose suggestion list, or a generic summary.",
        "Must include:",
        "1. Target positioning: one sentence describing the user's site and what reference qualities to borrow or avoid.",
        "2. Evidence-to-target module mapping table: reference evidence, target-site module, implementation detail, and what not to copy. At least 8 rows; for SaaS, cover hero, nav, product value, features, use cases/flow, proof/trust, pricing/CTA, and footer.",
        "3. Target page information architecture: module order from hero to footer, layout ratio, content density, CTA placement, and responsive changes.",
        "4. Token translation plan: convert colors, type, spacing, radii, and shadows into target-project design variables, including light/dark surface switching.",
        "5. Motion and interaction blueprint: split loading, hero entrance, scroll, hover, pointer/media effects, and detail/CTA states; each item needs trigger, duration/easing, implementation method, and fallback.",
        "6. Technical route selection: recommend component, animation, scroll, media/canvas/WebGL, and interactive-animation library routes by the user's stack; classify fit for React/Next, Vue/Nuxt, and HTML/CSS/JS, and explain when not to hand-roll.",
        "7. Detailed AI coding prompt: include target business semantics, modules, component decomposition, CSS/animation parameters, library choices, and acceptance criteria.",
        "8. Originality boundary: what can be borrowed as style/rhythm/pattern and what must not be copied.",
        "9. Evidence gaps: only gaps that affect implementation quality, with how to re-record them.",
        "If evidence is insufficient, state what must be re-recorded instead of inventing details; but captured evidence must still be translated into concrete target-site implementation."
      ].join("\n");
  const userIntent = brief ? `\n\n${formatDesignBriefForPrompt(brief, payload.locale)}` : "";
  return `${system}\n\n${instruction}${userIntent}\n\nStructured evidence:\n${JSON.stringify(payload, null, 2)}`;
}
