import type { Locale } from "../../shared/i18n";
import type { DesignCapture } from "../../shared/schema";

export function formatPatternName(kind: NonNullable<DesignCapture["interactionTimeline"]>["patterns"][number]["kind"], locale: Locale) {
  const zh: Record<typeof kind, string> = {
    "pointer-distortion": "鼠标扰动/水面划过",
    "cursor-follower": "自定义跟随光标",
    "media-sequence": "媒体队列/首屏图片切换",
    "media-liquid-distortion": "媒体液态扰动",
    "stage-state-machine": "阶段状态机",
    "typography-phase": "黑底大字阶段",
    "pointer-trail-field": "鼠标水纹轨迹场",
    "runtime-waapi-animation": "运行时 WAAPI/CSS 动画",
    "dom-mutation-state": "DOM 状态变更流",
    "canvas-bitmap-sequence": "Canvas/位图帧变化",
    "stylesheet-keyframes": "样式表 Keyframes",
    "scroll-pinned-stage": "滚动钉住舞台",
    "element-reveal": "元素进出场",
    "clip-mask-reveal": "Clip/Mask 揭幕",
    "canvas-webgl-motion": "Canvas/WebGL 视觉层",
    "loading-sequence": "加载/预热序列",
    "stateful-detail-surface": "详情面板状态"
  };
  const en: Record<typeof kind, string> = {
    "pointer-distortion": "Pointer Distortion / Water Surface",
    "cursor-follower": "Custom Cursor Follower",
    "media-sequence": "Media Queue / Hero Image Sequence",
    "media-liquid-distortion": "Media Liquid Distortion",
    "stage-state-machine": "Stage State Machine",
    "typography-phase": "Dark Typography Phase",
    "pointer-trail-field": "Pointer Trail Field",
    "runtime-waapi-animation": "Runtime WAAPI/CSS Animation",
    "dom-mutation-state": "DOM Mutation State Flow",
    "canvas-bitmap-sequence": "Canvas/Bitmap Frame Sequence",
    "stylesheet-keyframes": "Stylesheet Keyframes",
    "scroll-pinned-stage": "Pinned Scroll Stage",
    "element-reveal": "Element Entrance/Exit",
    "clip-mask-reveal": "Clip/Mask Reveal",
    "canvas-webgl-motion": "Canvas/WebGL Visual Layer",
    "loading-sequence": "Loading / Pre-entry Sequence",
    "stateful-detail-surface": "Stateful Detail Surface"
  };
  return locale === "zh" ? zh[kind] : en[kind];
}
