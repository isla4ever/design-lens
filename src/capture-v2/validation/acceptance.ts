import type { CaptureProjectV2, CapturedRect } from "../core/capture-project";

export const DEFAULT_ACCEPTANCE_RULES = {
  stablePixelMismatchRatio: 0.03,
  pixelColorThreshold: 0.1,
  keyElementGeometryToleranceCssPx: 4,
  requiredStateCoverage: 1,
  motionCheckpoints: [0.25, 0.5, 0.75]
} as const;

export type AcceptanceRules = {
  stablePixelMismatchRatio: number;
  pixelColorThreshold: number;
  keyElementGeometryToleranceCssPx: number;
  requiredStateCoverage: number;
  motionCheckpoints: number[];
};

export type RequestedSceneSummary = {
  id: string;
  viewport: string;
  state: string;
  status: "captured" | "planned" | "not-applicable";
};

export type AcceptancePlan = {
  version: 1;
  status: "not-run";
  rules: AcceptanceRules;
  dynamicMasksRequired: true;
  runnable: boolean;
  baseline: {
    capturedSceneCount: number;
    requestedSceneCount: number;
    missingSceneCount: number;
    capturedMotionCheckpointCount: number;
    motionVerificationRequired: boolean;
    capturedCanvasFrameCount: number;
    canvasVerificationRequired: boolean;
  };
  blockers: string[];
  runner: {
    command: string;
    requiredInputs: ["pack", "url"];
    outputs: string[];
  };
};

export type GeometryDiffItem = {
  nodeId: string;
  selector?: string;
  expected: CapturedRect;
  actual?: CapturedRect;
  delta: CapturedRect;
  maxDelta: number;
  passed: boolean;
  reason?: string;
};

export type AcceptanceSceneResult = {
  id: string;
  name: string;
  status: "passed" | "failed" | "skipped" | "error";
  kind?: "scene" | "motion-checkpoint" | "canvas-frame";
  checkpointProgress?: number;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  referenceArtifactId?: string;
  candidateScreenshot?: string;
  diffScreenshot?: string;
  maskedRegionCount: number;
  browserErrors: string[];
  reason?: string;
  pixel?: {
    dimensionsMatch: boolean;
    mismatchPixels: number;
    mismatchRatio: number;
    threshold: number;
    passed: boolean;
    hotspot?: CapturedRect;
  };
  geometry?: {
    checked: number;
    failed: number;
    toleranceCssPx: number;
    passed: boolean;
    items: GeometryDiffItem[];
  };
};

export type AcceptanceReport = {
  version: 1;
  status: "passed" | "failed" | "incomplete" | "error";
  generatedAt: string;
  sourceUrl: string;
  candidateUrl: string;
  rules: AcceptanceRules;
  summary: {
    requestedScenes: number;
    baselineScenes: number;
    evaluatedScenes: number;
    passedScenes: number;
    failedScenes: number;
    skippedScenes: number;
    errorScenes: number;
    missingBaselineScenes: number;
    stateCoverage: number;
    averagePixelMismatchRatio: number;
    failedGeometryNodes: number;
    motionCheckpoints: number;
    failedMotionCheckpoints: number;
    missingMotionCheckpointBaseline: boolean;
    canvasFrames: number;
    failedCanvasFrames: number;
    missingCanvasFrameBaseline: boolean;
  };
  scenes: AcceptanceSceneResult[];
};

export function buildAcceptancePlan(project: CaptureProjectV2, requestedScenes: RequestedSceneSummary[]): AcceptancePlan {
  const capturedSceneCount = project.scenes.filter((scene) => scene.status === "captured" && scene.screenshotArtifactId).length;
  const capturedMotionCheckpointCount = (project.motionCheckpoints ?? []).filter((checkpoint) => checkpoint.status === "captured" && checkpoint.screenshotArtifactId).length;
  const motionVerificationRequired = Boolean(project.animations?.length);
  const capturedCanvasFrameCount = (project.canvasFrames ?? []).filter((frame) => frame.status === "readable" && frame.artifactId).length;
  const canvasVerificationRequired = project.policy?.captureCanvas === true;
  const applicable = requestedScenes.filter((scene) => scene.status !== "not-applicable");
  const missingSceneCount = applicable.filter((scene) => scene.status !== "captured").length;
  const blockers = [
    capturedSceneCount ? "" : "No captured screenshot baseline is available.",
    missingSceneCount ? `${missingSceneCount} requested scene baselines are still missing.` : "",
    motionVerificationRequired && !capturedMotionCheckpointCount ? "Animation timing exists, but no seekable motion checkpoint baseline was captured." : "",
    canvasVerificationRequired && !capturedCanvasFrameCount ? "Canvas evidence was authorized, but no readable Canvas frame baseline was captured." : ""
  ].filter(Boolean);

  return {
    version: 1,
    status: "not-run",
    rules: { ...DEFAULT_ACCEPTANCE_RULES, motionCheckpoints: [...DEFAULT_ACCEPTANCE_RULES.motionCheckpoints] },
    dynamicMasksRequired: true,
    runnable: capturedSceneCount > 0,
    baseline: {
      capturedSceneCount,
      requestedSceneCount: applicable.length,
      missingSceneCount,
      capturedMotionCheckpointCount,
      motionVerificationRequired,
      capturedCanvasFrameCount,
      canvasVerificationRequired
    },
    blockers,
    runner: {
      command: "npm run verify:rebuild -- --pack <rebuild-pack.zip> --url <candidate-url>",
      requiredInputs: ["pack", "url"],
      outputs: ["acceptance-report.json", "acceptance-report.html", "agent-fix-context.md", "scenes/*.candidate.png", "scenes/*.diff.png"]
    }
  };
}

export function compareGeometry(
  nodeId: string,
  selector: string | undefined,
  expected: CapturedRect,
  actual: CapturedRect | undefined,
  toleranceCssPx: number
): GeometryDiffItem {
  if (!actual) {
    return {
      nodeId,
      ...(selector ? { selector } : {}),
      expected,
      delta: { x: 0, y: 0, width: 0, height: 0 },
      maxDelta: Number.POSITIVE_INFINITY,
      passed: false,
      reason: "Candidate element was not found or was not visible."
    };
  }
  const delta = {
    x: round(Math.abs(actual.x - expected.x)),
    y: round(Math.abs(actual.y - expected.y)),
    width: round(Math.abs(actual.width - expected.width)),
    height: round(Math.abs(actual.height - expected.height))
  };
  const maxDelta = Math.max(delta.x, delta.y, delta.width, delta.height);
  return {
    nodeId,
    ...(selector ? { selector } : {}),
    expected,
    actual,
    delta,
    maxDelta,
    passed: maxDelta <= toleranceCssPx
  };
}

export function finalizeAcceptanceReport(input: {
  project: CaptureProjectV2;
  candidateUrl: string;
  plan: AcceptancePlan;
  rules?: AcceptanceRules;
  scenes: AcceptanceSceneResult[];
  generatedAt?: string;
}): AcceptanceReport {
  const rules = input.rules ?? input.plan.rules;
  const evaluatedScenes = input.scenes.filter((scene) => scene.status === "passed" || scene.status === "failed");
  const motionScenes = input.scenes.filter((scene) => scene.kind === "motion-checkpoint");
  const canvasScenes = input.scenes.filter((scene) => scene.kind === "canvas-frame");
  const pixelRatios = evaluatedScenes.flatMap((scene) => scene.pixel ? [scene.pixel.mismatchRatio] : []);
  const passedScenes = input.scenes.filter((scene) => (!scene.kind || scene.kind === "scene") && scene.status === "passed").length;
  const failedScenes = input.scenes.filter((scene) => (!scene.kind || scene.kind === "scene") && scene.status === "failed").length;
  const skippedScenes = input.scenes.filter((scene) => scene.status === "skipped").length;
  const errorScenes = input.scenes.filter((scene) => scene.status === "error").length;
  const failedMotionCheckpoints = motionScenes.filter((scene) => scene.status === "failed" || scene.status === "error").length;
  const capturedMotionBaselineCount = input.plan.baseline.capturedMotionCheckpointCount
    ?? (input.project.motionCheckpoints ?? []).filter((checkpoint) => checkpoint.status === "captured" && checkpoint.screenshotArtifactId).length;
  const missingMotionCheckpointBaseline = (input.plan.baseline.motionVerificationRequired ?? Boolean(input.project.animations?.length))
    && capturedMotionBaselineCount < 1;
  const failedCanvasFrames = canvasScenes.filter((scene) => scene.status === "failed" || scene.status === "error").length;
  const capturedCanvasBaselineCount = input.plan.baseline.capturedCanvasFrameCount
    ?? (input.project.canvasFrames ?? []).filter((frame) => frame.status === "readable" && frame.artifactId).length;
  const missingCanvasFrameBaseline = (input.plan.baseline.canvasVerificationRequired ?? input.project.policy?.captureCanvas === true)
    && capturedCanvasBaselineCount < 1;
  const stateCoverage = input.plan.baseline.requestedSceneCount
    ? (input.plan.baseline.requestedSceneCount - input.plan.baseline.missingSceneCount) / input.plan.baseline.requestedSceneCount
    : 0;
  const summary = {
    requestedScenes: input.plan.baseline.requestedSceneCount,
    baselineScenes: input.plan.baseline.capturedSceneCount,
    evaluatedScenes: evaluatedScenes.length,
    passedScenes,
    failedScenes,
    skippedScenes,
    errorScenes,
    missingBaselineScenes: input.plan.baseline.missingSceneCount,
    stateCoverage: round(stateCoverage, 4),
    averagePixelMismatchRatio: round(pixelRatios.length ? pixelRatios.reduce((sum, value) => sum + value, 0) / pixelRatios.length : 0, 6),
    failedGeometryNodes: input.scenes.reduce((total, scene) => total + (scene.geometry?.failed ?? 0), 0),
    motionCheckpoints: motionScenes.length,
    failedMotionCheckpoints,
    missingMotionCheckpointBaseline,
    canvasFrames: canvasScenes.length,
    failedCanvasFrames,
    missingCanvasFrameBaseline
  };
  const status = errorScenes
    ? "error"
    : failedScenes || failedMotionCheckpoints || failedCanvasFrames
      ? "failed"
      : input.plan.baseline.missingSceneCount || missingMotionCheckpointBaseline || missingCanvasFrameBaseline || skippedScenes || stateCoverage < rules.requiredStateCoverage
        ? "incomplete"
        : "passed";

  return {
    version: 1,
    status,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceUrl: input.project.source.url,
    candidateUrl: input.candidateUrl,
    rules,
    summary,
    scenes: input.scenes
  };
}

export function buildAgentFixContext(report: AcceptanceReport) {
  const failures = report.scenes.filter((scene) => scene.status !== "passed");
  const lines = failures.flatMap((scene) => {
    const geometry = scene.geometry?.items
      .filter((item) => !item.passed)
      .slice(0, 8)
      .map((item) => `  - ${item.selector ?? item.nodeId}: max geometry delta ${Number.isFinite(item.maxDelta) ? `${item.maxDelta}px` : "missing"}`) ?? [];
    return [
      `- ${scene.kind === "motion-checkpoint" ? "Motion checkpoint" : scene.kind === "canvas-frame" ? "Canvas frame" : "Scene"} ${scene.id}: ${scene.status}${scene.reason ? ` - ${scene.reason}` : ""}`,
      scene.pixel ? `  - Pixel mismatch: ${(scene.pixel.mismatchRatio * 100).toFixed(2)}% (limit ${(scene.pixel.threshold * 100).toFixed(2)}%)` : "",
      scene.pixel?.hotspot ? `  - Diff hotspot: x=${scene.pixel.hotspot.x}, y=${scene.pixel.hotspot.y}, w=${scene.pixel.hotspot.width}, h=${scene.pixel.hotspot.height}` : "",
      ...geometry,
      scene.browserErrors.length ? `  - Browser errors: ${scene.browserErrors.join("; ")}` : ""
    ].filter(Boolean);
  });
  return `# Design Lens Local Fix Context

Overall status: ${report.status}
Candidate: ${report.candidateUrl}
State coverage: ${(report.summary.stateCoverage * 100).toFixed(1)}%
Average pixel mismatch: ${(report.summary.averagePixelMismatchRatio * 100).toFixed(2)}%
Motion checkpoint baseline missing: ${report.summary.missingMotionCheckpointBaseline ? "yes" : "no"}
Canvas frame baseline missing: ${report.summary.missingCanvasFrameBaseline ? "yes" : "no"}

## Failing Scenes

${lines.join("\n") || "- No failing scenes."}

## Repair Rules

- Fix the listed scene and selector only; do not rewrite unaffected regions.
- Resolve geometry deltas before decorative pixel differences.
- Use the diff hotspot as evidence, not as permission to copy source assets or private code.
- Re-run the same scene manifest after each local repair.
`;
}

export function renderAcceptanceReportHtml(report: AcceptanceReport) {
  const rows = report.scenes.map((scene) => `<tr>
    <td><strong>${escapeHtml(scene.name)}</strong><small>${scene.kind === "motion-checkpoint" ? `motion ${(scene.checkpointProgress ?? 0) * 100}% · ` : scene.kind === "canvas-frame" ? "canvas · " : ""}${escapeHtml(scene.id)}</small></td>
    <td><span class="status ${scene.status}">${scene.status}</span></td>
    <td>${scene.pixel ? `${(scene.pixel.mismatchRatio * 100).toFixed(2)}%` : "-"}</td>
    <td>${scene.geometry ? `${scene.geometry.failed} failed / ${scene.geometry.checked}` : "-"}</td>
    <td>${escapeHtml(scene.reason ?? (scene.browserErrors.join("; ") || "-"))}</td>
    <td>${scene.diffScreenshot ? `<a href="${escapeHtml(scene.diffScreenshot)}">diff</a>` : "-"}</td>
  </tr>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Design Lens Acceptance Report</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f4f5f2; color: #171a18; }
    main { width: min(1120px, calc(100% - 32px)); margin: 40px auto; }
    header { border-bottom: 2px solid #171a18; padding-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: 0; }
    p { color: #5c635e; }
    .summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; margin: 24px 0; background: #cfd3cf; border: 1px solid #cfd3cf; }
    .metric { background: white; padding: 18px; }
    .metric strong { display: block; font-size: 24px; }
    .metric span, small { color: #68706a; display: block; font-size: 12px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: white; font-size: 14px; }
    th, td { padding: 14px; border-bottom: 1px solid #e1e4e1; text-align: left; vertical-align: top; }
    th { color: #68706a; font-size: 12px; text-transform: uppercase; }
    .status { display: inline-block; padding: 3px 7px; border: 1px solid currentColor; }
    .passed { color: #147442; } .failed, .error { color: #b52828; } .incomplete, .skipped { color: #8a6300; }
    a { color: #12614e; }
    @media (max-width: 720px) { .summary { grid-template-columns: 1fr 1fr; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body><main>
  <header><h1>Rebuild Acceptance Report</h1><span class="status ${report.status}">${report.status}</span><p>${escapeHtml(report.candidateUrl)}</p></header>
  <section class="summary">
    <div class="metric"><strong>${(report.summary.stateCoverage * 100).toFixed(1)}%</strong><span>State coverage</span></div>
    <div class="metric"><strong>${(report.summary.averagePixelMismatchRatio * 100).toFixed(2)}%</strong><span>Average pixel mismatch</span></div>
    <div class="metric"><strong>${report.summary.failedScenes}</strong><span>Failed scenes</span></div>
    <div class="metric"><strong>${report.summary.failedGeometryNodes}</strong><span>Geometry failures</span></div>
    <div class="metric"><strong>${report.summary.failedMotionCheckpoints}/${report.summary.motionCheckpoints}</strong><span>${report.summary.missingMotionCheckpointBaseline ? "Motion baseline missing" : "Failed motion frames"}</span></div>
    <div class="metric"><strong>${report.summary.failedCanvasFrames}/${report.summary.canvasFrames}</strong><span>${report.summary.missingCanvasFrameBaseline ? "Canvas baseline missing" : "Failed Canvas frames"}</span></div>
  </section>
  <table><thead><tr><th>Scene</th><th>Status</th><th>Pixel</th><th>Geometry</th><th>Reason</th><th>Artifact</th></tr></thead><tbody>${rows}</tbody></table>
</main></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
