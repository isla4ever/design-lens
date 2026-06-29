import type { DesignAnalysis, DesignCapture } from "../../shared/schema";
import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n";

export function analyzeDesign(capture: Omit<DesignCapture, "analysis">, locale: Locale = DEFAULT_LOCALE): DesignAnalysis {
  const tags = new Set<string>();
  const recommendations: string[] = [];
  const zh = locale === "zh";

  if (capture.tokens.colors.length <= 8) tags.add(zh ? "克制配色" : "restrained palette");
  if (capture.tokens.colors.length > 16) tags.add(zh ? "宽色彩系统" : "broad color system");
  if (capture.tokens.radii.some((radius) => parseFloat(radius.value) >= 16)) tags.add(zh ? "柔和圆角表面" : "soft rounded surfaces");
  if (capture.tokens.shadows.length > 0) tags.add(zh ? "层级化表面" : "elevated surfaces");
  if (capture.motion.length > 0) tags.add(zh ? "动效驱动交互" : "motion-led interactions");
  if (capture.interactions.length > 0) tags.add(zh ? "可交互界面线索" : "interactive affordance cues");
  if (capture.layoutProfile.composition.includes("grid")) tags.add(zh ? "网格化布局语法" : "grid layout grammar");
  if (capture.layoutProfile.composition.includes("card")) tags.add(zh ? "卡片/列表驱动结构" : "card/list structure");
  if (capture.components.some((component) => component.name === "Card")) tags.add(zh ? "卡片式构图" : "card-based composition");
  if (capture.components.some((component) => component.name === "Hero Section")) tags.add(zh ? "首屏主视觉结构" : "hero-led landing structure");
  if (capture.layoutProfile.cadence.some((item) => item.includes("hero"))) tags.add(zh ? "首屏优先节奏" : "hero-first cadence");
  if (capture.layoutProfile.emphasis.some((item) => item.includes("navigation"))) tags.add(zh ? "持续导航强调" : "persistent navigation emphasis");
  if (capture.interactions.some((item) => item.trigger === "navigation")) tags.add(zh ? "导航驱动路径" : "navigation-driven flow");
  if (capture.interactions.some((item) => item.trigger === "input")) tags.add(zh ? "表单转化流程" : "form-driven conversion flow");
  if (capture.interactionTimeline?.patterns.some((item) => item.kind === "media-liquid-distortion")) tags.add(zh ? "液态媒体扰动" : "liquid media distortion");

  const density = estimateDensity(capture, locale);
  tags.add(density);

  if (capture.motion.length === 0) {
    recommendations.push(
      zh ? "当前可见视口未检测到明显动效线索；建议继续检查 hover 状态或滚动交互。" : "No active motion cues were detected in the visible viewport; inspect hover states or scroll interactions next."
    );
  }
  if (capture.components.length < 4) {
    recommendations.push(zh ? "建议选择具体区块再次捕捉，以提升组件层面的证据质量。" : "Capture a specific section to improve component-level evidence.");
  }
  if (capture.interactions.length === 0) {
    recommendations.push(zh ? "当前未捕捉到足够交互状态；建议选择导航、按钮组或表单区域继续采集。" : "Not enough interaction states were captured; pick a navigation, button group, or form area next.");
  }
  if (capture.layoutProfile.structure.length > 0) {
    recommendations.push(
      zh
        ? `实现时优先复用布局结构：${capture.layoutProfile.structure.join("、")}。`
        : `Prioritize these layout structures in implementation: ${capture.layoutProfile.structure.join(", ")}.`
    );
  }
  if (capture.layoutProfile.cadence.length > 0) {
    recommendations.push(zh ? `页面节奏可参考：${capture.layoutProfile.cadence.join("、")}。` : `Use this cadence as a reference: ${capture.layoutProfile.cadence.join(", ")}.`);
  }
  if (capture.layoutProfile.emphasis.length > 0) {
    recommendations.push(zh ? `层级重点：${capture.layoutProfile.emphasis.join("、")}。` : `Hierarchy emphasis: ${capture.layoutProfile.emphasis.join(", ")}.`);
  }
  if (capture.interactionTimeline?.patterns.some((item) => item.kind === "media-liquid-distortion")) {
    recommendations.push(zh ? "媒体交互不是普通 hover；优先按液态位移、局部扰动和焦点扩散去实现。" : "Media interaction is not ordinary hover; implement it as liquid displacement, localized distortion, and focal spread.");
  }

  const character = buildCharacter(Array.from(tags), capture, locale);

  return {
    character,
    tags: Array.from(tags).slice(0, 8),
    recommendations
  };
}

export type CaptureValueSummary = {
  readiness: "seed" | "usable" | "strong";
  coverage: string[];
  focusAreas: string[];
  missing: string[];
  note: string;
};

export function buildCaptureValueSummary(capture: Omit<DesignCapture, "analysis">, locale: Locale = DEFAULT_LOCALE): CaptureValueSummary {
  const zh = locale === "zh";
  const coverage: string[] = [];
  const focusAreas: string[] = [];
  const missing: string[] = [];
  let score = 0;

  const hasTokens = capture.tokens.colors.length > 0 || capture.tokens.typography.length > 0 || capture.tokens.spacing.length > 0;
  const hasLayout = capture.layoutProfile.structure.length > 0 || capture.layoutProfile.cadence.length > 0 || capture.layoutProfile.emphasis.length > 0;
  const hasMotion = capture.motion.length > 0;
  const hasInteractions = capture.interactions.length > 0;
  const patterns = capture.interactionTimeline?.patterns ?? [];
  const hasTimeline = !!capture.interactionTimeline;
  const hasStage = patterns.some((item) => item.kind === "stage-state-machine" || item.kind === "scroll-pinned-stage" || item.kind === "loading-sequence");
  const hasAdvancedMotion = patterns.some((item) => item.kind === "pointer-distortion" || item.kind === "pointer-trail-field" || item.kind === "media-liquid-distortion");
  const hasMedia = patterns.some((item) => item.kind === "media-sequence" || item.kind === "media-liquid-distortion" || item.kind === "canvas-webgl-motion");

  if (hasTokens) {
    coverage.push(zh ? "Token" : "tokens");
    score += 1;
  } else {
    missing.push(zh ? "Token" : "tokens");
  }

  if (hasLayout) {
    coverage.push(zh ? "布局" : "layout");
    focusAreas.push(zh ? "布局结构" : "layout structure");
    score += 1;
  } else {
    missing.push(zh ? "布局" : "layout");
  }

  if (hasMotion) {
    coverage.push(zh ? "动效" : "motion");
    focusAreas.push(zh ? "入场/过渡" : "entrance / transition");
    score += 1;
  } else {
    missing.push(zh ? "动效" : "motion");
  }

  if (hasInteractions) {
    coverage.push(zh ? "交互" : "interaction");
    focusAreas.push(zh ? "hover / 点击 / 状态" : "hover / click / state");
    score += 1;
  } else {
    missing.push(zh ? "交互" : "interaction");
  }

  if (hasTimeline) {
    coverage.push(zh ? "时间线" : "timeline");
    focusAreas.push(zh ? "阶段切换" : "stage transitions");
    score += 1;
  } else {
    missing.push(zh ? "时间线" : "timeline");
  }

  if (hasStage) {
    coverage.push(zh ? "阶段" : "stages");
    focusAreas.push(zh ? "首屏 / 滚动 / 详情" : "hero / scroll / detail");
    score += 1;
  } else {
    missing.push(zh ? "阶段" : "stages");
  }

  if (hasAdvancedMotion) {
    coverage.push(zh ? "液态动效" : "liquid motion");
    focusAreas.push(zh ? "水纹 / 位移 / 扰动" : "ripple / displacement / distortion");
    score += 1;
  }

  if (hasMedia) {
    coverage.push(zh ? "媒体层" : "media");
    focusAreas.push(zh ? "图片 / 画面切换" : "image / scene sequencing");
  }

  const readiness: CaptureValueSummary["readiness"] = score >= 6 ? "strong" : score >= 4 ? "usable" : "seed";
  const note = zh
    ? "这是一个设计对照表，不是复刻指令。优先看布局、节奏、动效和交互的实现方式，再决定哪些元素要借鉴。"
    : "This is a design reference table, not a source-copy instruction set. Read layout, cadence, motion, and interaction patterns first, then decide what to borrow.";

  return { readiness, coverage, focusAreas, missing, note };
}

export function withLocalizedAnalysis(capture: DesignCapture, locale: Locale = DEFAULT_LOCALE): DesignCapture {
  const { analysis: _analysis, ...captureWithoutAnalysis } = capture;
  return {
    ...capture,
    analysis: analyzeDesign(captureWithoutAnalysis, locale)
  };
}

function estimateDensity(capture: Omit<DesignCapture, "analysis">, locale: Locale) {
  const commonSpacing = capture.tokens.spacing[0]?.value ?? "16px";
  const spacing = parseFloat(commonSpacing);
  if (capture.layoutProfile.density === "compact") return locale === "zh" ? "紧凑界面密度" : "compact interface";
  if (capture.layoutProfile.density === "open") return locale === "zh" ? "开放式编辑排版间距" : "open editorial spacing";
  if (spacing <= 8) return locale === "zh" ? "紧凑界面密度" : "compact interface";
  if (spacing >= 28) return locale === "zh" ? "开放式编辑排版间距" : "open editorial spacing";
  return locale === "zh" ? "均衡间距节奏" : "balanced spacing rhythm";
}

function buildCharacter(tags: string[], capture: Omit<DesignCapture, "analysis">, locale: Locale) {
  const tagText = tags.length ? tags.join(locale === "zh" ? "、" : ", ") : locale === "zh" ? "中性视觉系统" : "neutral visual system";
  if (locale === "zh") {
    return `该页面呈现出${tagText}的设计气质，布局倾向为${capture.layoutProfile.composition}，本次可见捕捉中识别到 ${capture.components.length} 个组件模式、${capture.interactions.length} 条交互线索。`;
  }
  return `The page presents a ${tagText}; its layout leans toward ${capture.layoutProfile.composition}, with ${capture.components.length} component patterns and ${capture.interactions.length} interaction cues in the visible capture.`;
}
