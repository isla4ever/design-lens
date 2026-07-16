import type { Locale } from "../../shared/i18n";
import type { DesignCapture } from "../../shared/schema";
import { buildEvidencePack } from "../../evidence/evidence-pack";
import { formatPatternName } from "./skill-pattern-labels";

export function formatInteractionTimeline(capture: DesignCapture, locale: Locale) {
  const timeline = capture.interactionTimeline;
  if (!timeline) {
    return locale === "zh"
      ? "- 未录制交互时间线。要捕捉鼠标扰动、滚动阶段和媒体队列，请使用手动录制并在页面上真实移动鼠标、滚动和触发状态。"
      : "- No interaction timeline was recorded. To capture pointer distortion, scroll phases, and media queues, use manual recording and actually move the pointer, scroll, and trigger states.";
  }

  const evidencePack = buildEvidencePack(capture);
  const summary = locale === "zh"
    ? [
        `- 录制时长：${timeline.durationMs}ms`,
        `- 鼠标轨迹：${timeline.pointerSamples.length} 个样本`,
        `- 焦点轨迹：${timeline.focusSamples?.length ?? 0} 个样本`,
        `- 滚动轨迹：${timeline.scrollSamples.length} 个样本`,
        `- 帧差样本：${timeline.frameSamples.length} 帧`,
        `- 证据事件：${evidencePack.counts.replayEvents} 条`,
        `- 识别模式：${timeline.patterns.length} 个`,
        timeline.metrics ? `- 质量指标：最大鼠标速度 ${timeline.metrics.maxPointerSpeed}px/s；轨迹距离 ${timeline.metrics.pointerTravel}px；媒体状态 ${timeline.metrics.mediaStateCount} 个；运行时动画 ${timeline.metrics.runtimeAnimationCount ?? 0} 条；DOM 变更 ${timeline.metrics.mutationCount ?? 0} 条；视觉表面 ${timeline.metrics.visualSurfaceStateCount ?? 0} 个；性能事件 ${timeline.metrics.performanceEventCount ?? 0} 个；长任务 ${timeline.metrics.longTaskCount ?? 0} 个；CLS ${timeline.metrics.layoutShiftScore ?? 0}；暗色阶段 ${Math.round(timeline.metrics.darkFrameRatio * 100)}%；阶段 ${timeline.phases?.length ?? 0} 个` : ""
      ]
    : [
        `- Duration: ${timeline.durationMs}ms`,
        `- Pointer samples: ${timeline.pointerSamples.length}`,
        `- Focus samples: ${timeline.focusSamples?.length ?? 0}`,
        `- Scroll samples: ${timeline.scrollSamples.length}`,
        `- Frame samples: ${timeline.frameSamples.length}`,
        `- Evidence events: ${evidencePack.counts.replayEvents}`,
        `- Detected patterns: ${timeline.patterns.length}`,
        timeline.metrics ? `- Quality metrics: max pointer speed ${timeline.metrics.maxPointerSpeed}px/s; travel ${timeline.metrics.pointerTravel}px; media states ${timeline.metrics.mediaStateCount}; runtime animations ${timeline.metrics.runtimeAnimationCount ?? 0}; DOM mutations ${timeline.metrics.mutationCount ?? 0}; visual surfaces ${timeline.metrics.visualSurfaceStateCount ?? 0}; performance events ${timeline.metrics.performanceEventCount ?? 0}; long tasks ${timeline.metrics.longTaskCount ?? 0}; CLS ${timeline.metrics.layoutShiftScore ?? 0}; dark phase ${Math.round(timeline.metrics.darkFrameRatio * 100)}%; phases ${timeline.phases?.length ?? 0}` : ""
      ];

  const phases = timeline.phases?.length
    ? locale === "zh"
      ? `\n\n### 阶段拆解\n\n${timeline.phases.map((phase, index) => `- ${index + 1}. ${phase.label}: ${phase.startMs}-${phase.endMs}ms; scroll ${phase.scrollRange.min}-${phase.scrollRange.max}; surface ${phase.dominantSurface}; signals ${phase.activeSignals.join("、") || "无"}; selectors ${phase.keySelectors.slice(0, 3).map((selector) => `\`${selector}\``).join("、") || "无"}`).join("\n")}`
      : `\n\n### Phase Breakdown\n\n${timeline.phases.map((phase, index) => `- ${index + 1}. ${phase.label}: ${phase.startMs}-${phase.endMs}ms; scroll ${phase.scrollRange.min}-${phase.scrollRange.max}; surface ${phase.dominantSurface}; signals ${phase.activeSignals.join(", ") || "none"}; selectors ${phase.keySelectors.slice(0, 3).map((selector) => `\`${selector}\``).join(", ") || "none"}`).join("\n")}`
    : "";

  const recipe = formatPrototypeRecipe(capture, locale);
  const gaps = formatEvidenceGaps(capture, locale);
  const details = formatTimelineEvidence(timeline, locale);
  const patterns = formatTimelinePatterns(timeline, locale);
  const pointerNote = hasTimelinePattern(timeline, "pointer-distortion")
    ? locale === "zh"
      ? "\n\n> 指针扰动不是普通 hover，也不是装饰性拖影。复刻时必须建模：出现阶段、视觉层位置、pointer x/y、速度、方向、衰减、blend mode、与文字/媒体的遮挡关系；优先用 canvas/WebGL/SVG displacement、mask、filter 或局部形变实现。"
      : "\n\n> Pointer distortion is not ordinary hover or decorative trailing. Model its phase, visual layer position, pointer x/y, speed, direction, decay, blend mode, and occlusion relationship with type/media; implement with canvas/WebGL/SVG displacement, masks, filters, or localized deformation."
    : "";

  return `${summary.filter(Boolean).join("\n")}${phases}${details}${recipe}${gaps}\n\n${patterns}${pointerNote}`;
}

function formatTimelinePatterns(timeline: NonNullable<DesignCapture["interactionTimeline"]>, locale: Locale) {
  if (!timeline.patterns.length) {
    return locale === "zh"
      ? "- 未识别到稳定模式。请重新录制：等待加载完成、移动鼠标穿过主视觉、滚动到关键 section、悬停作品卡、打开详情状态。"
      : "- No stable patterns detected. Re-record: wait for load, move through the hero, scroll to key sections, hover work cards, and open detail states.";
  }

  return timeline.patterns
    .map((pattern, index) => {
      if (locale === "zh") {
        return `### ${index + 1}. ${formatPatternName(pattern.kind, locale)} (${pattern.confidence}%)

- 证据：${pattern.evidence.join("；") || "无"}
- 实现：${pattern.implementationNotes.join("；") || "按捕捉状态实现"}`;
      }

      return `### ${index + 1}. ${formatPatternName(pattern.kind, locale)} (${pattern.confidence}%)

- Evidence: ${pattern.evidence.join("; ") || "none"}
- Implement: ${pattern.implementationNotes.join("; ") || "follow captured states"}`;
    })
    .join("\n\n");
}

function formatTimelineEvidence(timeline: NonNullable<DesignCapture["interactionTimeline"]>, locale: Locale) {
  const pointerTypes = countValues(timeline.pointerSamples.map((sample) => sample.type ?? "move"));
  const focusTypes = countValues((timeline.focusSamples ?? []).map((sample) => sample.type));
  const focusTargets = [...new Set((timeline.focusSamples ?? []).map((sample) => sample.targetSelector).filter(Boolean))].slice(0, 5);
  const runtimeDetails = (timeline.runtimeAnimations ?? [])
    .slice(0, 5)
    .map((animation) => `${animation.name}:${animation.properties.join("+") || "state"}:${animation.keyframeCount}kf:${animation.durationMs}ms`);
  const performanceDetails = (timeline.performanceEvents ?? [])
    .slice(0, 6)
    .map((event) => `${event.type}:${event.name}:${event.duration}ms${typeof event.value === "number" ? `:${event.value}` : ""}`);
  const surfaceDetails = (timeline.visualSurfaces ?? [])
    .slice(0, 5)
    .map((surface) => `${surface.signal}:${surface.tagName}:${surface.cssWidth}x${surface.cssHeight}`);

  if (locale === "zh") {
    return `\n\n### 细节证据\n\n- Pointer 类型：${formatCounts(pointerTypes, "未捕捉到")}\n- Focus 类型：${formatCounts(focusTypes, "未捕捉到")}；目标：${focusTargets.join("、") || "未捕捉到"}\n- 动画切片：${runtimeDetails.join("；") || "未捕捉到运行时动画"}\n- 性能时间线：${performanceDetails.join("；") || "未捕捉到 paint/layout/longtask"}\n- 视觉表面：${surfaceDetails.join("；") || "未捕捉到 canvas/video/img/svg 表面"}`;
  }

  return `\n\n### Detail Evidence\n\n- Pointer types: ${formatCounts(pointerTypes, "not captured")}\n- Focus types: ${formatCounts(focusTypes, "not captured")}; targets: ${focusTargets.join(", ") || "not captured"}\n- Animation slices: ${runtimeDetails.join("; ") || "no runtime animations captured"}\n- Performance timeline: ${performanceDetails.join("; ") || "no paint/layout/longtask captured"}\n- Visual surfaces: ${surfaceDetails.join("; ") || "no canvas/video/img/svg surface captured"}`;
}

function formatPrototypeRecipe(capture: DesignCapture, locale: Locale) {
  const recipe = buildEvidencePack(capture).prototypeRecipe;
  if (locale === "zh") {
    return `\n\n### 证据到原型计划\n\n- 模板：${recipe.recommendedTemplate}\n- 状态：${recipe.states.join("、") || "stable"}\n- 动效 Hook：${recipe.motionHooks.join("、") || "按捕捉时长/缓动实现"}\n- 验收：${recipe.acceptanceChecks.join("；")}`;
  }

  return `\n\n### Evidence-To-Prototype Plan\n\n- Template: ${recipe.recommendedTemplate}\n- States: ${recipe.states.join(", ") || "stable"}\n- Motion hooks: ${recipe.motionHooks.join(", ") || "captured timing/easing"}\n- Acceptance: ${recipe.acceptanceChecks.join("; ")}`;
}

function formatEvidenceGaps(capture: DesignCapture, locale: Locale) {
  const gaps = buildEvidencePack(capture).gaps;
  if (!gaps.length) {
    return locale === "zh"
      ? "\n\n### 证据缺口\n\n- 暂无关键缺口；可以直接进入原型实现和人工验收。"
      : "\n\n### Evidence Gaps\n\n- No major gaps; proceed to prototype implementation and human review.";
  }

  const lines = gaps.map((gap) => `- ${gap.severity}: ${gap.area} - ${gap.message}`).join("\n");
  return locale === "zh" ? `\n\n### 证据缺口\n\n${lines}` : `\n\n### Evidence Gaps\n\n${lines}`;
}

function hasTimelinePattern(timeline: NonNullable<DesignCapture["interactionTimeline"]>, kind: NonNullable<DesignCapture["interactionTimeline"]>["patterns"][number]["kind"]) {
  return timeline.patterns.some((pattern) => pattern.kind === kind);
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
