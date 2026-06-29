import type { Locale } from "./i18n";

const DESIGN_BRIEF_KEY = "designLensDesignBrief";

export type BorrowMode = "visual" | "layout" | "motion" | "interaction" | "media" | "content-structure";

export type DesignBrief = {
  siteType: string;
  goal: string;
  borrow: BorrowMode[];
  avoid: string;
  output: "homepage" | "component" | "full-site" | "prototype";
  stack: "html" | "react" | "vue" | "next";
  similarity: "inspired" | "strong-reference" | "high-fidelity-structure";
};

export const DEFAULT_DESIGN_BRIEF: DesignBrief = {
  siteType: "",
  goal: "",
  borrow: ["visual", "layout", "motion", "interaction"],
  avoid: "",
  output: "homepage",
  stack: "html",
  similarity: "strong-reference"
};

export async function getStoredDesignBrief(): Promise<DesignBrief> {
  try {
    const result = await browser.storage.local.get(DESIGN_BRIEF_KEY);
    return normalizeDesignBrief(result[DESIGN_BRIEF_KEY]);
  } catch {
    return DEFAULT_DESIGN_BRIEF;
  }
}

export async function setStoredDesignBrief(brief: DesignBrief) {
  await browser.storage.local.set({ [DESIGN_BRIEF_KEY]: normalizeDesignBrief(brief) });
}

export function normalizeDesignBrief(value: unknown): DesignBrief {
  if (!value || typeof value !== "object") return DEFAULT_DESIGN_BRIEF;
  const maybe = value as Partial<DesignBrief>;
  return {
    siteType: typeof maybe.siteType === "string" ? maybe.siteType.slice(0, 240) : "",
    goal: typeof maybe.goal === "string" ? maybe.goal.slice(0, 600) : "",
    borrow: normalizeBorrow(maybe.borrow),
    avoid: typeof maybe.avoid === "string" ? maybe.avoid.slice(0, 400) : "",
    output: isOutput(maybe.output) ? maybe.output : DEFAULT_DESIGN_BRIEF.output,
    stack: isStack(maybe.stack) ? maybe.stack : DEFAULT_DESIGN_BRIEF.stack,
    similarity: isSimilarity(maybe.similarity) ? maybe.similarity : DEFAULT_DESIGN_BRIEF.similarity
  };
}

export function formatDesignBriefForPrompt(brief: DesignBrief, locale: Locale) {
  const zh = locale === "zh";
  const normalized = normalizeDesignBrief(brief);
  const borrowLabels = normalized.borrow.map((item) => briefBorrowLabel(item, locale)).join(zh ? "、" : ", ");
  if (zh) {
    return [
      "## 用户创作意图",
      `- 网站/产品类型：${normalized.siteType || "未填写"}`,
      `- 目标项目：${normalized.goal || "未填写；请先基于捕捉网站生成通用设计参考，不要假设具体业务。"}`,
      `- 希望借鉴：${borrowLabels || "未指定"}`,
      `- 不希望像：${normalized.avoid || "未填写"}`,
      `- 输出目标：${briefOutputLabel(normalized.output, locale)}`,
      `- 技术栈：${briefStackLabel(normalized.stack)}`,
      `- 相似度：${briefSimilarityLabel(normalized.similarity, locale)}`,
      "",
      "硬性要求：输出必须围绕“用户目标项目”展开，而不是复述参考网站。每个布局、组件、动效、特效和技术路线都要说明如何迁移到该网站/产品类型中。优先生成原创方案；只借鉴被勾选的维度；没有被证据支持的复杂动效必须标注需要补录。"
    ].join("\n");
  }
  return [
    "## User Build Intent",
    `- Site/product type: ${normalized.siteType || "Not provided"}`,
    `- Target project: ${normalized.goal || "Not provided; generate a general design reference from the captured site without assuming a specific business."}`,
    `- Borrow from reference: ${borrowLabels || "Not specified"}`,
    `- Avoid looking like: ${normalized.avoid || "Not provided"}`,
    `- Output target: ${briefOutputLabel(normalized.output, locale)}`,
    `- Tech stack: ${briefStackLabel(normalized.stack)}`,
    `- Similarity: ${briefSimilarityLabel(normalized.similarity, locale)}`,
    "",
    "Hard requirement: output must center the user's target project, not repeat a reference-site summary. Every layout, component, motion, effect, and technical route must explain how it transfers to that site/product type. Produce an original solution; borrow only the selected dimensions; mark unsupported complex motion as needing another recording pass."
  ].join("\n");
}

export function briefBorrowLabel(mode: BorrowMode, locale: Locale) {
  const zh: Record<BorrowMode, string> = {
    visual: "视觉风格",
    layout: "布局结构",
    motion: "动效节奏",
    interaction: "交互状态",
    media: "图片/媒体特效",
    "content-structure": "内容组织"
  };
  const en: Record<BorrowMode, string> = {
    visual: "visual style",
    layout: "layout structure",
    motion: "motion rhythm",
    interaction: "interaction states",
    media: "image/media effects",
    "content-structure": "content structure"
  };
  return locale === "zh" ? zh[mode] : en[mode];
}

export function briefOutputLabel(output: DesignBrief["output"], locale: Locale) {
  const zh: Record<DesignBrief["output"], string> = {
    homepage: "首页",
    component: "组件/模块",
    "full-site": "完整网站",
    prototype: "可验证原型"
  };
  const en: Record<DesignBrief["output"], string> = {
    homepage: "homepage",
    component: "component/module",
    "full-site": "full site",
    prototype: "verifiable prototype"
  };
  return locale === "zh" ? zh[output] : en[output];
}

export function briefStackLabel(stack: DesignBrief["stack"]) {
  const labels: Record<DesignBrief["stack"], string> = {
    html: "HTML/CSS/JS",
    react: "React",
    vue: "Vue",
    next: "Next.js"
  };
  return labels[stack];
}

export function briefSimilarityLabel(similarity: DesignBrief["similarity"], locale: Locale) {
  const zh: Record<DesignBrief["similarity"], string> = {
    inspired: "气质启发",
    "strong-reference": "明显参考",
    "high-fidelity-structure": "高保真结构学习"
  };
  const en: Record<DesignBrief["similarity"], string> = {
    inspired: "inspired by the reference",
    "strong-reference": "strong reference",
    "high-fidelity-structure": "high-fidelity structure study"
  };
  return locale === "zh" ? zh[similarity] : en[similarity];
}

function normalizeBorrow(value: unknown): BorrowMode[] {
  if (!Array.isArray(value)) return DEFAULT_DESIGN_BRIEF.borrow;
  const allowed = new Set<BorrowMode>(["visual", "layout", "motion", "interaction", "media", "content-structure"]);
  const next = value.filter((item): item is BorrowMode => allowed.has(item));
  return next.length ? Array.from(new Set(next)) : DEFAULT_DESIGN_BRIEF.borrow;
}

function isOutput(value: unknown): value is DesignBrief["output"] {
  return value === "homepage" || value === "component" || value === "full-site" || value === "prototype";
}

function isStack(value: unknown): value is DesignBrief["stack"] {
  return value === "html" || value === "react" || value === "vue" || value === "next";
}

function isSimilarity(value: unknown): value is DesignBrief["similarity"] {
  return value === "inspired" || value === "strong-reference" || value === "high-fidelity-structure";
}
