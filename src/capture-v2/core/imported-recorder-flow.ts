import { parse, StepType, type Selector, type Step, type UserFlow } from "@puppeteer/replay";
import { z } from "zod";
import type { DesignCapture } from "../../shared/schema";

export const MAX_RECORDER_FLOW_BYTES = 2 * 1024 * 1024;
export const MAX_RECORDER_FLOW_STEPS = 500;
export const MAX_IMPORTED_FLOW_SCENES = 120;

const importedTriggerSchema = z.object({
  kind: z.enum(["initial", "scroll", "hover", "click", "wait"]),
  selector: z.string().min(1).max(500).optional(),
  value: z.number().finite().optional()
});

const importedSceneSchema = z.object({
  id: z.string().min(1),
  stepIndex: z.number().int().nonnegative(),
  name: z.string().min(1).max(180),
  viewport: z.object({
    width: z.number().int().min(240).max(7680),
    height: z.number().int().min(240).max(4320),
    deviceScaleFactor: z.number().min(0.5).max(8)
  }),
  trigger: importedTriggerSchema,
  url: z.string().max(2_000).optional(),
  status: z.literal("planned"),
  requiresEvidence: z.literal(true)
});

export const importedRecorderFlowPlanSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1).max(180),
  source: z.literal("chrome-devtools-recorder"),
  importedAt: z.string().min(1),
  totalStepCount: z.number().int().nonnegative().max(MAX_RECORDER_FLOW_STEPS),
  supportedStepCount: z.number().int().nonnegative(),
  redactedStepCount: z.number().int().nonnegative(),
  ignoredStepCount: z.number().int().nonnegative(),
  routeCount: z.number().int().nonnegative(),
  origins: z.array(z.string().max(500)).max(8),
  warnings: z.array(z.enum([
    "multiple-origins",
    "non-css-selectors-omitted",
    "scene-limit-reached",
    "sensitive-input-redacted",
    "unsafe-steps-omitted"
  ])).max(5),
  scenes: z.array(importedSceneSchema).max(MAX_IMPORTED_FLOW_SCENES)
});

export type ImportedRecorderFlowPlan = z.infer<typeof importedRecorderFlowPlanSchema>;
export type ImportedRecorderFlowScene = z.infer<typeof importedSceneSchema>;
export type ImportedRecorderWarning = ImportedRecorderFlowPlan["warnings"][number];

const importedFlowMatchSceneSchema = z.object({
  sceneId: z.string().min(1),
  status: z.enum(["matched", "partial", "missing"]),
  confidence: z.number().min(0).max(1),
  evidenceSceneIds: z.array(z.string()).max(12),
  reason: z.string().min(1).max(300)
});

export const importedRecorderFlowMatchSchema = z.object({
  version: z.literal(1),
  flowId: z.string().min(1),
  matchedAt: z.string().min(1),
  counts: z.object({ matched: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), missing: z.number().int().nonnegative() }),
  scenes: z.array(importedFlowMatchSceneSchema).max(MAX_IMPORTED_FLOW_SCENES)
});

export type ImportedRecorderFlowMatch = z.infer<typeof importedRecorderFlowMatchSchema>;

export function compileImportedRecorderFlow(value: unknown, options: {
  importedAt?: string;
  viewport?: { width: number; height: number; deviceScaleFactor: number };
} = {}): ImportedRecorderFlowPlan {
  assertRawStepLimit(value);
  const flow = parse(value);
  const importedAt = options.importedAt ?? new Date().toISOString();
  let viewport = normalizeViewport(options.viewport ?? { width: 1440, height: 900, deviceScaleFactor: 1 });
  let supportedStepCount = 0;
  let redactedStepCount = 0;
  let ignoredStepCount = 0;
  let routeCount = 0;
  let omittedSelectorCount = 0;
  let reachedSceneLimit = false;
  let omittedUnsafeStep = false;
  const scenes: ImportedRecorderFlowScene[] = [];
  const origins = new Set<string>();

  const appendScene = (scene: Omit<ImportedRecorderFlowScene, "id" | "status" | "requiresEvidence">) => {
    if (scenes.length >= MAX_IMPORTED_FLOW_SCENES) {
      reachedSceneLimit = true;
      return;
    }
    scenes.push({
      ...scene,
      id: `imported-${String(scene.stepIndex + 1).padStart(3, "0")}-${scene.trigger.kind}`,
      status: "planned",
      requiresEvidence: true
    });
  };

  flow.steps.forEach((step, stepIndex) => {
    if (step.type === StepType.SetViewport) {
      viewport = normalizeViewport(step);
      supportedStepCount += 1;
      return;
    }
    if (step.type === StepType.Navigate) {
      const url = sanitizeImportedUrl(step.url);
      if (!url) {
        ignoredStepCount += 1;
        omittedUnsafeStep = true;
        return;
      }
      routeCount += 1;
      const origin = getOrigin(url);
      if (origin) origins.add(origin);
      appendScene({
        stepIndex,
        name: `Open ${formatUrlLabel(url)}`,
        viewport,
        trigger: { kind: "initial" },
        url
      });
      supportedStepCount += 1;
      return;
    }
    if (step.type === StepType.Scroll) {
      const selectors = "selectors" in step ? step.selectors : undefined;
      const selector = getCssSelector(selectors);
      if (selectors?.length && !selector) omittedSelectorCount += 1;
      appendScene({
        stepIndex,
        name: selector ? "Scroll element" : "Scroll page",
        viewport,
        trigger: { kind: "scroll", ...(selector ? { selector } : {}), value: clampFinite(step.y ?? 0, -1_000_000, 1_000_000) }
      });
      supportedStepCount += 1;
      return;
    }
    if (step.type === StepType.Hover || step.type === StepType.Click || step.type === StepType.DoubleClick || step.type === StepType.WaitForElement) {
      const selector = getCssSelector(step.selectors);
      if (!selector) omittedSelectorCount += 1;
      const kind = step.type === StepType.Hover ? "hover" : step.type === StepType.WaitForElement ? "wait" : "click";
      appendScene({
        stepIndex,
        name: step.type === StepType.DoubleClick ? "Double click target" : step.type === StepType.Click ? "Click target" : step.type === StepType.Hover ? "Hover target" : "Wait for target",
        viewport,
        trigger: { kind, ...(selector ? { selector } : {}) }
      });
      supportedStepCount += 1;
      return;
    }
    if (step.type === StepType.Change) {
      redactedStepCount += 1;
      return;
    }
    if (isUnsafeStep(step)) {
      ignoredStepCount += 1;
      omittedUnsafeStep = true;
      return;
    }
    ignoredStepCount += 1;
  });

  const warnings: ImportedRecorderFlowPlan["warnings"] = [];
  if (origins.size > 1) warnings.push("multiple-origins");
  if (omittedSelectorCount) warnings.push("non-css-selectors-omitted");
  if (reachedSceneLimit) warnings.push("scene-limit-reached");
  if (redactedStepCount) warnings.push("sensitive-input-redacted");
  if (omittedUnsafeStep) warnings.push("unsafe-steps-omitted");

  return parseImportedRecorderFlowPlan({
    version: 1,
    id: `recorder-${shortHash(`${flow.title}|${flow.steps.length}|${scenes.map((scene) => scene.id).join("|")}`)}`,
    title: sanitizeLabel(flow.title, "Imported Recorder flow"),
    source: "chrome-devtools-recorder",
    importedAt,
    totalStepCount: flow.steps.length,
    supportedStepCount,
    redactedStepCount,
    ignoredStepCount,
    routeCount,
    origins: Array.from(origins).slice(0, 8),
    warnings,
    scenes
  });
}

export function parseImportedRecorderFlowPlan(value: unknown) {
  return importedRecorderFlowPlanSchema.parse(value);
}

export function parseImportedRecorderFlowMatch(value: unknown) {
  return importedRecorderFlowMatchSchema.parse(value);
}

export function matchImportedRecorderFlowPlan(plan: ImportedRecorderFlowPlan, capture: DesignCapture, matchedAt = new Date().toISOString()): ImportedRecorderFlowMatch {
  const evidenceScenes = capture.rebuildEvidence?.scenes ?? [];
  const capturedScenes = evidenceScenes.filter((scene) => scene.status === "captured" && scene.screenshotArtifactId);
  const interactions = capture.interactions ?? [];
  const results = plan.scenes.map((planned) => {
    const candidates = capturedScenes.filter((evidence) => matchesViewport(planned.viewport.width, planned.viewport.height, evidence.viewport.width, evidence.viewport.height));
    const related = candidates.filter((evidence) => matchesPlannedUrl(planned.url, capture.page.url) && matchesTrigger(planned, evidence));
    if (related.length) {
      return {
        sceneId: planned.id,
        status: "matched" as const,
        confidence: planned.trigger.selector ? 0.96 : 0.88,
        evidenceSceneIds: related.map((scene) => scene.id).slice(0, 12),
        reason: "A captured screenshot matches the imported viewport and trigger."
      };
    }

    const hasInteractionClue = planned.trigger.selector
      ? interactions.some((interaction) => selectorsEqual(interaction.selector, planned.trigger.selector))
      : planned.trigger.kind === "initial" && matchesPlannedUrl(planned.url, capture.page.url);
    if (hasInteractionClue) {
      return {
        sceneId: planned.id,
        status: "partial" as const,
        confidence: planned.trigger.selector ? 0.62 : 0.45,
        evidenceSceneIds: [],
        reason: "A related interaction or page clue exists, but no matching screenshot baseline was captured."
      };
    }
    return {
      sceneId: planned.id,
      status: "missing" as const,
      confidence: 0,
      evidenceSceneIds: [],
      reason: "No captured evidence matches this imported trigger yet."
    };
  });
  return parseImportedRecorderFlowMatch({
    version: 1,
    flowId: plan.id,
    matchedAt,
    counts: {
      matched: results.filter((scene) => scene.status === "matched").length,
      partial: results.filter((scene) => scene.status === "partial").length,
      missing: results.filter((scene) => scene.status === "missing").length
    },
    scenes: results
  });
}

function matchesViewport(plannedWidth: number, plannedHeight: number, evidenceWidth: number, evidenceHeight: number) {
  const plannedMobile = plannedWidth < 768;
  const evidenceMobile = evidenceWidth < 768;
  return plannedMobile === evidenceMobile && Math.abs(plannedWidth - evidenceWidth) <= 48 && Math.abs(plannedHeight - evidenceHeight) <= 96;
}

function matchesTrigger(planned: ImportedRecorderFlowScene, evidence: NonNullable<DesignCapture["rebuildEvidence"]>["scenes"][number]) {
  if (planned.trigger.kind === "initial") return evidence.phase === "recording-start" || evidence.phase === "responsive-initial";
  if (planned.trigger.kind === "scroll") {
    const phaseMatches = evidence.phase === "page-baseline" || evidence.phase === "responsive-scroll";
    return phaseMatches && Math.abs(evidence.scroll.y - (planned.trigger.value ?? 0)) <= 120;
  }
  if (planned.trigger.kind === "hover") return (evidence.phase === "forced-hover" || evidence.phase === "observed-hover") && selectorsEqual(evidence.selector, planned.trigger.selector);
  if (planned.trigger.kind === "click") return evidence.phase === "observed-open" && selectorsEqual(evidence.selector, planned.trigger.selector);
  return evidence.phase === "observed-open" && (!planned.trigger.selector || selectorsEqual(evidence.selector, planned.trigger.selector));
}

function selectorsEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

function matchesPlannedUrl(planned: string | undefined, captured: string) {
  if (!planned) return true;
  try {
    const left = new URL(planned);
    const right = new URL(captured);
    return left.protocol === right.protocol && left.host === right.host && left.pathname === right.pathname;
  } catch {
    return false;
  }
}

function assertRawStepLimit(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Recorder flow must be a JSON object.");
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) throw new Error("Recorder flow must contain a steps array.");
  if (steps.length > MAX_RECORDER_FLOW_STEPS) throw new Error(`Recorder flow exceeds the ${MAX_RECORDER_FLOW_STEPS}-step limit.`);
}

function normalizeViewport(value: { width: number; height: number; deviceScaleFactor: number }) {
  const width = Math.round(value.width);
  const height = Math.round(value.height);
  const deviceScaleFactor = value.deviceScaleFactor;
  if (width < 240 || width > 7680 || height < 240 || height > 4320 || deviceScaleFactor < 0.5 || deviceScaleFactor > 8) {
    throw new Error("Recorder viewport is outside the supported range.");
  }
  return { width, height, deviceScaleFactor };
}

function getCssSelector(selectors: Selector[] | undefined) {
  for (const candidate of selectors ?? []) {
    const selector = Array.isArray(candidate) ? candidate.at(-1) : candidate;
    if (!selector || !isCssSelector(selector)) continue;
    const normalized = selector.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
    if (!normalized || hasSuspiciousQuotedValue(normalized)) continue;
    return normalized;
  }
  return undefined;
}

function isCssSelector(value: string) {
  return !/^(aria|text|xpath|pierce)\//i.test(value) && !value.includes("\0");
}

function hasSuspiciousQuotedValue(value: string) {
  return /["'][^"']{80,}["']/.test(value);
}

function isUnsafeStep(step: Step) {
  return step.type === StepType.WaitForExpression || step.type === StepType.CustomStep || step.type === StepType.Close;
}

function sanitizeImportedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:") return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href.slice(0, 2_000);
  } catch {
    return "";
  }
}

function getOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "file:" ? "file://" : url.origin;
  } catch {
    return "";
  }
}

function formatUrlLabel(value: string) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`.slice(0, 150) || url.protocol;
  } catch {
    return "recorded route";
  }
}

function sanitizeLabel(value: string, fallback: string) {
  const sanitized = String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 180);
  return sanitized || fallback;
}

function clampFinite(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
