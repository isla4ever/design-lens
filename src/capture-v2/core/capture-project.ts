import { z } from "zod";

export const CAPTURE_PROJECT_VERSION = 2 as const;

const timestampSchema = z.string().min(1);
const stringRecordSchema = z.record(z.string(), z.string());

export const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive()
});

export const sceneTriggerSchema = z.object({
  kind: z.enum(["initial", "scroll", "hover", "focus", "click", "open", "wait"]),
  nodeId: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  value: z.union([z.string(), z.number()]).optional()
});

export const captureSceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  viewport: viewportSchema,
  triggers: z.array(sceneTriggerSchema),
  scroll: z.object({ x: z.number(), y: z.number() }),
  capture: z.object({
    fullPage: z.boolean(),
    maskNodeIds: z.array(z.string())
  }),
  screenshotArtifactId: z.string().min(1).optional(),
  domSnapshotArtifactId: z.string().min(1).optional(),
  rrwebEventRange: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).optional(),
  capturedAt: timestampSchema.optional(),
  status: z.enum(["planned", "capturing", "captured", "failed", "not-applicable"])
});

export const capturedRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative()
});

export const capturedNodeSchema = z.object({
  id: z.string().min(1),
  sceneIds: z.array(z.string()),
  backendNodeId: z.number().int().positive().optional(),
  selector: z.string().min(1).optional(),
  tagName: z.string().min(1),
  textSample: z.string().optional(),
  parentNodeId: z.string().min(1).optional(),
  rectByScene: z.record(z.string(), capturedRectSchema),
  matchConfidence: z.number().min(0).max(1)
});

export const styleEvidenceSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  sceneId: z.string().min(1),
  computed: stringRecordSchema,
  matchedRules: z.array(z.object({
    selector: z.string(),
    declarations: stringRecordSchema,
    sourceUrl: z.string().optional(),
    origin: z.string().optional(),
    styleSheetId: z.string().optional()
  })),
  cssVariables: stringRecordSchema,
  pseudoStates: z.array(z.string()),
  source: z.enum(["content", "cdp", "legacy"])
});

export const assetEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  url: z.string().optional(),
  origin: z.string(),
  mediaType: z.string().optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  hash: z.string().optional(),
  signals: z.array(z.string()),
  bundled: z.boolean()
});

export const interactionGraphSchema = z.object({
  states: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    sceneId: z.string().min(1).optional()
  })),
  transitions: z.array(z.object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    trigger: z.string().min(1),
    nodeId: z.string().min(1).optional(),
    evidenceIds: z.array(z.string()),
    source: z.enum(["observed", "inferred"])
  }))
});

export const animationEvidenceSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  selector: z.string().optional(),
  sceneId: z.string().min(1),
  name: z.string().min(1),
  source: z.string().min(1),
  durationMs: z.number().nonnegative(),
  delayMs: z.number(),
  easing: z.string(),
  properties: z.array(z.string()),
  keyframes: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional()
});

export const motionCheckpointSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  progress: z.number().min(0).max(1),
  animations: z.array(z.object({
    animationId: z.string().min(1),
    name: z.string().min(1),
    nodeId: z.string().min(1).optional(),
    selector: z.string().min(1).optional(),
    durationMs: z.number().nonnegative(),
    currentTimeMs: z.number().nonnegative()
  })),
  maskNodeIds: z.array(z.string()),
  screenshotArtifactId: z.string().min(1).optional(),
  capturedAt: timestampSchema.optional(),
  status: z.enum(["captured", "failed", "not-applicable"]),
  error: z.string().optional()
});

export const canvasFrameSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  selector: z.string().min(1),
  index: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  cssWidth: z.number().nonnegative(),
  cssHeight: z.number().nonnegative(),
  status: z.enum(["readable", "tainted", "unavailable", "skipped", "requires-companion"]),
  artifactId: z.string().min(1).optional(),
  scale: z.number().positive().optional(),
  context: z.enum(["2d", "webgl", "unknown"]).optional(),
  capturedAt: timestampSchema.optional(),
  error: z.string().optional()
});

export const artifactDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["capture", "screenshot", "dom-snapshot", "rrweb", "style", "asset", "canvas-frame", "report", "other"]),
  name: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  hash: z.string().optional(),
  createdAt: timestampSchema
});

export const coverageItemSchema = z.object({
  area: z.enum(["structure", "styles", "assets", "canvas", "interactions", "animations", "screenshots", "responsive"]),
  status: z.enum(["complete", "partial", "missing", "not-applicable"]),
  evidenceIds: z.array(z.string()),
  message: z.string()
});

export const captureProjectSchema = z.object({
  version: z.literal(CAPTURE_PROJECT_VERSION),
  id: z.string().min(1),
  mode: z.enum(["reference", "rebuild"]),
  source: z.object({
    title: z.string(),
    url: z.string().min(1),
    scope: z.enum(["page", "component"]),
    capturedAt: timestampSchema
  }),
  policy: z.object({
    assetMode: z.enum(["manifest-only", "bundle-authorized"]),
    captureCanvas: z.boolean(),
    maskInputs: z.boolean(),
    includeText: z.boolean(),
    blockSelectors: z.array(z.string())
  }),
  capabilities: z.object({
    content: z.boolean(),
    rrweb: z.boolean(),
    cdp: z.boolean(),
    screenshots: z.boolean(),
    multiViewport: z.boolean(),
    matchedStyles: z.boolean(),
    animationTimeline: z.boolean(),
    canvas: z.boolean()
  }),
  scenes: z.array(captureSceneSchema),
  nodes: z.record(z.string(), capturedNodeSchema),
  styles: z.record(z.string(), styleEvidenceSchema),
  assets: z.array(assetEvidenceSchema),
  interactions: interactionGraphSchema,
  animations: z.array(animationEvidenceSchema),
  motionCheckpoints: z.array(motionCheckpointSchema).optional(),
  canvasFrames: z.array(canvasFrameSchema).optional(),
  artifacts: z.record(z.string(), artifactDescriptorSchema),
  coverage: z.object({
    readiness: z.enum(["draft", "usable", "complete"]),
    items: z.array(coverageItemSchema),
    gaps: z.array(z.string())
  }),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

export type CaptureViewport = z.infer<typeof viewportSchema>;
export type CaptureScene = z.infer<typeof captureSceneSchema>;
export type CapturedRect = z.infer<typeof capturedRectSchema>;
export type CapturedNode = z.infer<typeof capturedNodeSchema>;
export type StyleEvidenceV2 = z.infer<typeof styleEvidenceSchema>;
export type AssetEvidenceV2 = z.infer<typeof assetEvidenceSchema>;
export type InteractionGraphV2 = z.infer<typeof interactionGraphSchema>;
export type AnimationEvidenceV2 = z.infer<typeof animationEvidenceSchema>;
export type MotionCheckpointV2 = z.infer<typeof motionCheckpointSchema>;
export type CanvasFrameV2 = z.infer<typeof canvasFrameSchema>;
export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>;
export type CaptureProjectV2 = z.infer<typeof captureProjectSchema>;

export function parseCaptureProject(value: unknown): CaptureProjectV2 {
  return captureProjectSchema.parse(value);
}

export function safeParseCaptureProject(value: unknown) {
  return captureProjectSchema.safeParse(value);
}

export function serializeCaptureProject(project: CaptureProjectV2) {
  return JSON.stringify(parseCaptureProject(project), null, 2);
}
