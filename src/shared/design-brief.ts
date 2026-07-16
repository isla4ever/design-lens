import type { Locale } from "./i18n";

const DESIGN_BRIEF_KEY = "designLensDesignBrief";

export type CaptureMode = "reference" | "rebuild";
export type BorrowMode = "visual" | "layout" | "motion" | "interaction" | "media" | "content-structure";
export type ReferenceStrength = "inspired" | "strong-reference";
export type RebuildViewport = "desktop" | "mobile";
export type RebuildState = "initial" | "scroll" | "hover" | "focus" | "open";
export type RebuildAssetPolicy = "manifest-only" | "bundle-authorized";

export type RebuildBrief = {
  viewports: RebuildViewport[];
  states: RebuildState[];
  assetPolicy: RebuildAssetPolicy;
  captureCanvas: boolean;
  authorizationConfirmed: boolean;
};

export type DesignBrief = {
  mode: CaptureMode;
  siteType: string;
  goal: string;
  borrow: BorrowMode[];
  avoid: string;
  output: "homepage" | "component" | "full-site" | "prototype";
  stack: "html" | "react" | "vue" | "next";
  referenceStrength: ReferenceStrength;
  rebuild: RebuildBrief;
};

export const DEFAULT_DESIGN_BRIEF: DesignBrief = {
  mode: "reference",
  siteType: "",
  goal: "",
  borrow: ["visual", "layout", "motion", "interaction"],
  avoid: "",
  output: "homepage",
  stack: "html",
  referenceStrength: "strong-reference",
  rebuild: {
    viewports: ["desktop"],
    states: ["initial", "scroll", "hover"],
    assetPolicy: "manifest-only",
    captureCanvas: false,
    authorizationConfirmed: false
  }
};

export async function getStoredDesignBrief(): Promise<DesignBrief> {
  try {
    const result = await browser.storage.local.get(DESIGN_BRIEF_KEY);
    return prepareDesignBriefForSession(result[DESIGN_BRIEF_KEY]);
  } catch {
    return DEFAULT_DESIGN_BRIEF;
  }
}

export function prepareDesignBriefForSession(value: unknown) {
  const brief = normalizeDesignBrief(value);
  return { ...brief, rebuild: { ...brief.rebuild, authorizationConfirmed: false } };
}

export async function setStoredDesignBrief(brief: DesignBrief) {
  await browser.storage.local.set({ [DESIGN_BRIEF_KEY]: normalizeDesignBrief(brief) });
}

export function normalizeDesignBrief(value: unknown): DesignBrief {
  if (!value || typeof value !== "object") return DEFAULT_DESIGN_BRIEF;
  const maybe = value as Record<string, unknown>;
  const legacySimilarity = typeof maybe.similarity === "string" ? maybe.similarity : "";
  const mode = isCaptureMode(maybe.mode) ? maybe.mode : legacySimilarity === "high-fidelity-structure" ? "rebuild" : "reference";
  const referenceStrength = isReferenceStrength(maybe.referenceStrength)
    ? maybe.referenceStrength
    : legacySimilarity === "inspired" ? "inspired" : DEFAULT_DESIGN_BRIEF.referenceStrength;
  const rebuild = normalizeRebuildBrief(maybe.rebuild);

  return {
    mode,
    siteType: typeof maybe.siteType === "string" ? maybe.siteType.slice(0, 240) : "",
    goal: typeof maybe.goal === "string" ? maybe.goal.slice(0, 600) : "",
    borrow: normalizeBorrow(maybe.borrow),
    avoid: typeof maybe.avoid === "string" ? maybe.avoid.slice(0, 400) : "",
    output: isOutput(maybe.output) ? maybe.output : DEFAULT_DESIGN_BRIEF.output,
    stack: isStack(maybe.stack) ? maybe.stack : DEFAULT_DESIGN_BRIEF.stack,
    referenceStrength,
    rebuild
  };
}

export function formatDesignBriefForPrompt(brief: DesignBrief, locale: Locale) {
  const normalized = normalizeDesignBrief(brief);
  return normalized.mode === "rebuild"
    ? formatRebuildBriefForPrompt(normalized, locale)
    : formatReferenceBriefForPrompt(normalized, locale);
}

function formatReferenceBriefForPrompt(brief: DesignBrief, locale: Locale) {
  const zh = locale === "zh";
  const borrowLabels = brief.borrow.map((item) => briefBorrowLabel(item, locale)).join(zh ? "、" : ", ");
  if (zh) {
    return [
      "## 用户创作意图",
      "- 任务模式：设计参照",
      `- 网站/产品类型：${brief.siteType || "未填写"}`,
      `- 目标项目：${brief.goal || "未填写；请先基于捕捉网站生成通用设计参考，不要假设具体业务。"}`,
      `- 希望借鉴：${borrowLabels || "未指定"}`,
      `- 不希望像：${brief.avoid || "未填写"}`,
      `- 输出目标：${briefOutputLabel(brief.output, locale)}`,
      `- 技术栈：${briefStackLabel(brief.stack)}`,
      `- 参考强度：${briefReferenceStrengthLabel(brief.referenceStrength, locale)}`,
      "",
      "硬性要求：输出必须围绕用户目标项目展开，而不是复述参考网站。优先生成原创方案；只借鉴被勾选的维度；没有被证据支持的复杂动效必须标注需要补录。"
    ].join("\n");
  }
  return [
    "## User Build Intent",
    "- Task mode: design reference",
    `- Site/product type: ${brief.siteType || "Not provided"}`,
    `- Target project: ${brief.goal || "Not provided; generate a general design reference without assuming a specific business."}`,
    `- Borrow from reference: ${borrowLabels || "Not specified"}`,
    `- Avoid looking like: ${brief.avoid || "Not provided"}`,
    `- Output target: ${briefOutputLabel(brief.output, locale)}`,
    `- Tech stack: ${briefStackLabel(brief.stack)}`,
    `- Reference strength: ${briefReferenceStrengthLabel(brief.referenceStrength, locale)}`,
    "",
    "Hard requirement: center the user's target project instead of summarizing the reference. Produce an original solution, borrow only selected dimensions, and identify unsupported motion as a capture gap."
  ].join("\n");
}

function formatRebuildBriefForPrompt(brief: DesignBrief, locale: Locale) {
  const zh = locale === "zh";
  const viewports = brief.rebuild.viewports.map((item) => rebuildViewportLabel(item, locale)).join(zh ? "、" : ", ");
  const states = brief.rebuild.states.map((item) => rebuildStateLabel(item, locale)).join(zh ? "、" : ", ");
  if (zh) {
    return [
      "## 用户重建意图",
      "- 任务模式：高保真重建草稿",
      `- 重建目标：${brief.goal || "当前捕捉页面"}`,
      `- 输出范围：${briefOutputLabel(brief.output, locale)}`,
      `- 技术栈：${briefStackLabel(brief.stack)}`,
      `- 视口：${viewports}`,
      `- 状态：${states}`,
      `- 资产策略：${rebuildAssetPolicyLabel(brief.rebuild.assetPolicy, locale)}`,
      `- Canvas 证据：${brief.rebuild.captureCanvas ? "已开启（受限位图）" : "未开启"}`,
      `- 权限确认：${brief.rebuild.authorizationConfirmed ? "已确认" : "未确认"}`,
      "",
      "硬性要求：当前资料只能生成重建草稿。没有截图基线、响应式场景或状态证据时必须列为缺口，不得声称已经达到高保真。"
    ].join("\n");
  }
  return [
    "## User Rebuild Intent",
    "- Task mode: high-fidelity rebuild draft",
    `- Rebuild target: ${brief.goal || "Current captured page"}`,
    `- Output scope: ${briefOutputLabel(brief.output, locale)}`,
    `- Tech stack: ${briefStackLabel(brief.stack)}`,
    `- Viewports: ${viewports}`,
    `- States: ${states}`,
    `- Asset policy: ${rebuildAssetPolicyLabel(brief.rebuild.assetPolicy, locale)}`,
    `- Canvas evidence: ${brief.rebuild.captureCanvas ? "enabled (bounded bitmap capture)" : "disabled"}`,
    `- Authorization: ${brief.rebuild.authorizationConfirmed ? "confirmed" : "not confirmed"}`,
    "",
    "Hard requirement: the current material can only produce a rebuild draft. Missing screenshot, responsive, or state evidence must remain explicit gaps; do not claim high fidelity."
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

export function briefReferenceStrengthLabel(strength: ReferenceStrength, locale: Locale) {
  const zh: Record<ReferenceStrength, string> = { inspired: "气质启发", "strong-reference": "明显参考" };
  const en: Record<ReferenceStrength, string> = { inspired: "inspired", "strong-reference": "strong reference" };
  return locale === "zh" ? zh[strength] : en[strength];
}

export function rebuildViewportLabel(viewport: RebuildViewport, locale: Locale) {
  const labels: Record<RebuildViewport, [string, string]> = { desktop: ["桌面", "Desktop"], mobile: ["移动端", "Mobile"] };
  return labels[viewport][locale === "zh" ? 0 : 1];
}

export function rebuildStateLabel(state: RebuildState, locale: Locale) {
  const labels: Record<RebuildState, [string, string]> = {
    initial: ["初始完成态", "Initial"],
    scroll: ["滚动状态", "Scroll"],
    hover: ["悬停状态", "Hover"],
    focus: ["键盘焦点", "Focus"],
    open: ["展开/弹层", "Open"]
  };
  return labels[state][locale === "zh" ? 0 : 1];
}

export function rebuildAssetPolicyLabel(policy: RebuildAssetPolicy, locale: Locale) {
  const labels: Record<RebuildAssetPolicy, [string, string]> = {
    "manifest-only": ["只记录资产清单", "Manifest only"],
    "bundle-authorized": ["打包已授权资产", "Bundle authorized assets"]
  };
  return labels[policy][locale === "zh" ? 0 : 1];
}

function normalizeRebuildBrief(value: unknown): RebuildBrief {
  const maybe = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const viewports = normalizeAllowedArray(maybe.viewports, ["desktop", "mobile"] as const, DEFAULT_DESIGN_BRIEF.rebuild.viewports);
  const states = normalizeAllowedArray(maybe.states, ["initial", "scroll", "hover", "focus", "open"] as const, DEFAULT_DESIGN_BRIEF.rebuild.states);
  return {
    viewports,
    states: states.includes("initial") ? states : ["initial", ...states],
    assetPolicy: maybe.assetPolicy === "bundle-authorized" ? "bundle-authorized" : "manifest-only",
    captureCanvas: maybe.captureCanvas === true,
    authorizationConfirmed: maybe.authorizationConfirmed === true
  };
}

function normalizeBorrow(value: unknown): BorrowMode[] {
  return normalizeAllowedArray(value, ["visual", "layout", "motion", "interaction", "media", "content-structure"] as const, DEFAULT_DESIGN_BRIEF.borrow);
}

function normalizeAllowedArray<T extends string>(value: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(value)) return [...fallback];
  const allowedSet = new Set<T>(allowed);
  const next = value.filter((item): item is T => typeof item === "string" && allowedSet.has(item as T));
  return next.length ? Array.from(new Set(next)) : [...fallback];
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return value === "reference" || value === "rebuild";
}

function isReferenceStrength(value: unknown): value is ReferenceStrength {
  return value === "inspired" || value === "strong-reference";
}

function isOutput(value: unknown): value is DesignBrief["output"] {
  return value === "homepage" || value === "component" || value === "full-site" || value === "prototype";
}

function isStack(value: unknown): value is DesignBrief["stack"] {
  return value === "html" || value === "react" || value === "vue" || value === "next";
}
