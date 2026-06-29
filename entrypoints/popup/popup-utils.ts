import type { AiProviderProfile } from "../../src/shared/ai-settings";
import { DEFAULT_AI_MODEL } from "../../src/shared/ai-settings";
import type { DesignCapture } from "../../src/shared/schema";

export function captureHost(url: string) {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function hasSignals(capture: DesignCapture) {
  return capture.components.length + capture.motion.length + capture.interactions.length + (capture.interactionTimeline?.patterns.length ?? 0) > 0;
}

export function evidenceScore(capture: DesignCapture) {
  const timeline = capture.interactionTimeline;
  const score =
    Math.min(20, capture.components.length * 3) +
    Math.min(16, capture.motion.length * 4) +
    Math.min(14, capture.interactions.length * 5) +
    Math.min(14, (timeline?.pointerSamples.length ?? 0) * 1.2) +
    Math.min(10, (timeline?.scrollSamples.length ?? 0) * 3) +
    Math.min(12, (timeline?.runtimeAnimations?.length ?? 0) * 1.5) +
    Math.min(8, (timeline?.visualSurfaces?.length ?? 0) * 4) +
    Math.min(6, (capture.implementationTrace?.assets.length ?? 0) * 1.2);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function formatAiModelLabel(profile: AiProviderProfile) {
  const provider = profile.name?.trim() || profile.presetId || profile.id || "AI";
  const model = profile.model?.trim() || DEFAULT_AI_MODEL;
  return `${provider} / ${model}`;
}
