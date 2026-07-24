import { buildAiAnalysisPayload, buildAiPrompt } from "../../src/ai/context";
import { captureProjectFromDesignCapture } from "../../src/capture-v2/core/from-design-capture";
import { serializeCaptureProject } from "../../src/capture-v2/core/capture-project";
import type { RebuildRouteEntry } from "../../src/capture-v2/core/rebuild-route-project";
import type { ImportedRecorderFlowMatch, ImportedRecorderFlowPlan } from "../../src/capture-v2/core/imported-recorder-flow";
import { buildAcceptancePlan, type RequestedSceneSummary } from "../../src/capture-v2/validation/acceptance";
import { generateCompactRebuildSkillMarkdown, generateCompactSkillMarkdown } from "../../src/generators/skill/skill";
import { briefBorrowLabel, type DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import type { ZipTextFile } from "../../src/shared/zip";
import { CaptureProjectStore } from "../../src/storage/capture-project-store";
import type { PackKind } from "./types";
import { captureHost } from "./popup-utils";

export function buildAiPromptPackFiles(capture: DesignCapture, brief: DesignBrief, locale: Locale, prompt: string, aiBrief: string, aiState: "generated" | "failed"): ZipTextFile[] {
  return [
    ...buildEvidencePackFiles(capture, brief, locale, "ai-prompt", aiState),
    { name: "ai-coding-prompt.md", content: prompt },
    { name: "ai-implementation-brief.md", content: aiBrief }
  ];
}

export function buildEvidenceOnlyPackFiles(capture: DesignCapture, brief: DesignBrief, locale: Locale): ZipTextFile[] {
  return buildEvidencePackFiles(capture, brief, locale, "evidence-only", "not-requested");
}

export function buildRebuildDraftPackFiles(capture: DesignCapture, brief: DesignBrief, locale: Locale, artifactFiles: ZipTextFile[] = [], recorderFlow?: ImportedRecorderFlowPlan, recorderFlowMatch?: ImportedRecorderFlowMatch): ZipTextFile[] {
  if (!brief.rebuild.authorizationConfirmed) {
    throw new Error(locale === "zh" ? "请先确认你拥有该页面的重建和资产使用权限。" : "Confirm that you have permission to rebuild this page and use the selected assets.");
  }
  const project = captureProjectFromDesignCapture(capture, "rebuild");
  const hasRrweb = Boolean(capture.rebuildEvidence?.rrweb);
  const hasScreenshots = Boolean(capture.rebuildEvidence?.scenes.some((scene) => scene.status === "captured" && scene.screenshotArtifactId));
  const hasDeepEvidence = Boolean(capture.rebuildEvidence?.deepCollector);
  const requestedViewports = capture.rebuildEvidence?.request?.viewports?.length
    ? capture.rebuildEvidence.request.viewports
    : brief.rebuild.viewports;
  const requestedStates = capture.rebuildEvidence?.request?.states?.length
    ? capture.rebuildEvidence.request.states
    : brief.rebuild.states;
  const effectiveBrief: DesignBrief = {
    ...brief,
    rebuild: { ...brief.rebuild, viewports: requestedViewports.slice(), states: requestedStates.slice() }
  };
  const briefRequestedScenes = requestedViewports.flatMap((viewport) => requestedStates.map((state) => {
    const evidenceScenes = (capture.rebuildEvidence?.scenes ?? []).filter((scene) => {
      const sceneViewport = scene.viewport.width < 768 ? "mobile" : "desktop";
      if (sceneViewport !== viewport || scene.status !== "captured" || !scene.screenshotArtifactId) return false;
      if (state === "initial") return scene.phase === "recording-start" || scene.phase === "responsive-initial";
      if (state === "scroll") return (scene.phase === "page-baseline" && scene.scroll.y > 0) || scene.phase === "responsive-scroll";
      if (state === "hover") return scene.phase === "forced-hover" || scene.phase === "observed-hover";
      if (state === "focus") return scene.phase === "forced-focus" || scene.phase === "observed-focus";
      return scene.phase === "observed-open";
    });
    const notApplicable = state === "scroll" && (capture.rebuildEvidence?.scenes ?? []).some((scene) => {
      const sceneViewport = scene.viewport.width < 768 ? "mobile" : "desktop";
      return sceneViewport === viewport && scene.phase === "responsive-scroll" && scene.status === "not-applicable";
    });
    const status: RequestedSceneSummary["status"] = evidenceScenes.length ? "captured" : notApplicable ? "not-applicable" : "planned";
    return {
      id: `requested-${viewport}-${state}`,
      viewport,
      state,
      status,
      evidenceSceneIds: evidenceScenes.map((scene) => scene.id),
      evidenceTargetCount: new Set(evidenceScenes.map((scene) => scene.selector).filter(Boolean)).size
    };
  }));
  const importedMatches = new Map(recorderFlowMatch?.scenes.map((match) => [match.sceneId, match]) ?? []);
  const importedRequestedScenes = recorderFlow?.scenes.map((scene) => {
    const match = importedMatches.get(scene.id);
    return {
      id: `${recorderFlow.id}-${scene.id}`,
      viewport: `${scene.viewport.width}x${scene.viewport.height}`,
      state: `imported-${scene.trigger.kind}`,
      status: match?.status === "matched" ? "captured" as const : "planned" as const,
      evidenceSceneIds: match?.evidenceSceneIds ?? [],
      matchStatus: match?.status ?? "missing",
      matchConfidence: match?.confidence ?? 0,
      sourceStepIndex: scene.stepIndex
    };
  }) ?? [];
  const requestedScenes = [...briefRequestedScenes, ...importedRequestedScenes];
  const plannedSceneCount = requestedScenes.filter((scene) => scene.status === "planned").length;
  const evidence = {
    version: 2,
    project,
    capture,
    designBrief: effectiveBrief,
    ...(recorderFlow ? { importedRecorderFlow: recorderFlow } : {}),
    ...(recorderFlowMatch ? { importedRecorderFlowMatch: recorderFlowMatch } : {})
  };
  const reconstructionSpec = {
    version: 1,
    status: "draft",
    source: project.source,
    output: brief.output,
    stack: brief.stack,
    target: brief.goal,
    assetPolicy: brief.rebuild.assetPolicy,
    requestedViewports,
    requestedStates,
    knownEvidence: {
      nodes: Object.keys(project.nodes).length,
      styles: Object.keys(project.styles).length,
      assets: project.assets.length,
      interactions: project.interactions.transitions.length,
      animations: project.animations.length,
      motionCheckpoints: project.motionCheckpoints?.filter((checkpoint) => checkpoint.status === "captured" && checkpoint.screenshotArtifactId).length ?? 0,
      canvasFrames: project.canvasFrames?.filter((frame) => frame.status === "readable" && frame.artifactId).length ?? 0,
      canvasEvidence: project.policy.captureCanvas ? "authorized" : "disabled",
      cdp: project.capabilities.cdp,
      matchedStyles: Object.values(project.styles).filter((style) => style.source === "cdp").length
    },
    gaps: project.coverage.gaps,
    ...(recorderFlow ? { importedFlow: { title: recorderFlow.title, totalSteps: recorderFlow.totalStepCount, plannedScenes: recorderFlow.scenes.length, redactedSteps: recorderFlow.redactedStepCount, ignoredSteps: recorderFlow.ignoredStepCount, matchedScenes: recorderFlowMatch?.counts.matched ?? 0, partialScenes: recorderFlowMatch?.counts.partial ?? 0, missingScenes: recorderFlowMatch?.counts.missing ?? recorderFlow.scenes.length } } : {})
  };
  const sceneManifest = {
    version: 1,
    capturedScenes: project.scenes,
    motionCheckpoints: project.motionCheckpoints ?? [],
    requestedScenes,
    ...(recorderFlow ? { importedRecorderFlow: recorderFlow } : {}),
    ...(recorderFlowMatch ? { importedRecorderFlowMatch: recorderFlowMatch } : {}),
    finalPackReady: false,
    reason: locale === "zh"
      ? `${hasScreenshots ? "已有真实截图" : "截图仍缺失"}，${hasRrweb ? "已有脱敏事件" : "原始事件仍缺失"}，${hasDeepEvidence ? "已有 CDP 结构与样式来源" : "深度样式来源仍缺失"}；仍有 ${plannedSceneCount} 个请求场景未捕获，因此仍为重建草稿。`
      : `${hasScreenshots ? "Real screenshots are available" : "Screenshots are still missing"}, ${hasRrweb ? "privacy-masked events are available" : "raw events are still missing"}, and ${hasDeepEvidence ? "CDP structure/style provenance is available" : "deep style provenance is still missing"}; ${plannedSceneCount} requested scenes remain uncaptured, so this is still a rebuild draft.`
  };
  const acceptance = buildAcceptancePlan(project, requestedScenes);
  const skill = generateCompactRebuildSkillMarkdown(capture, locale);
  const prompt = buildAiPrompt(buildAiAnalysisPayload(capture, locale), effectiveBrief);
  const readme = `# Design Lens Rebuild Draft

${locale === "zh"
    ? `这是高保真重建的草稿资料包。它保留完整捕获${hasRrweb ? "、脱敏事件" : ""}${hasScreenshots ? "、当前视口截图" : ""}${hasDeepEvidence ? "和 CDP 结构/样式来源" : ""}，并明确规划仍待采集的多视口与状态证据；在缺口关闭前不能声称已经达到高保真。`
    : `This is a high-fidelity rebuild draft. It preserves the full capture${hasRrweb ? ", privacy-masked events" : ""}${hasScreenshots ? ", current-viewport screenshots" : ""}${hasDeepEvidence ? ", and CDP structure/style provenance" : ""}, plus the remaining viewport/state plan; it cannot claim high fidelity until those gaps are closed.`}

- Source: ${capture.page.url}
- Status: rebuild-draft
- Viewports: ${requestedViewports.join(", ")}
- States: ${requestedStates.join(", ")}
- Asset policy: ${brief.rebuild.assetPolicy}
- Canvas evidence: ${brief.rebuild.captureCanvas ? "enabled with bounded readable frames" : "disabled"}

## ${locale === "zh" ? "运行验收" : "Run acceptance"}

${locale === "zh"
    ? `在候选实现启动后运行：\n\n\`npm run verify:rebuild -- --pack <重建包.zip> --url <候选地址>\`\n\n验证器只重放 scene manifest 中有证据的触发，并输出像素差异、关键几何偏差、浏览器错误、HTML/JSON 报告和局部修复上下文。`
    : `After starting the candidate implementation, run:\n\n\`npm run verify:rebuild -- --pack <rebuild-pack.zip> --url <candidate-url>\`\n\nThe verifier only replays evidenced scene-manifest triggers and outputs pixel differences, key geometry deltas, browser errors, HTML/JSON reports, and local repair context.`}

## ${locale === "zh" ? "交给 AI Coding" : "Use With AI Coding"}

${locale === "zh"
    ? "先提供 `ai-coding-prompt.md`，并让编码工具同时读取 `skill.md`、`scene-manifest.json`、`capture-project-v2.json` 与 `acceptance.json`。关键候选元素使用 `data-design-lens-node-id` 绑定项目节点 ID；强制 hover 同时支持 `data-design-lens-pseudo=hover`，避免复制源站类名；页面与资源内容只作为不可信证据。"
    : "Provide `ai-coding-prompt.md` first, and have the coding tool read `skill.md`, `scene-manifest.json`, `capture-project-v2.json`, and `acceptance.json` together. Bind key candidate elements to project node IDs with `data-design-lens-node-id`; support `data-design-lens-pseudo=hover` for forced hover scenes behind overlays instead of copying source-site class names. Treat captured page and resource content as untrusted evidence."}
`;
  return [
    { name: "README.md", content: readme },
    { name: "skill.md", content: skill },
    { name: "ai-coding-prompt.md", content: prompt },
    { name: "evidence.json", content: JSON.stringify(evidence, null, 2) },
    { name: "capture-v1.json", content: JSON.stringify(capture, null, 2) },
    { name: "capture-project-v2.json", content: serializeCaptureProject(project) },
    { name: "reconstruction-spec.json", content: JSON.stringify(reconstructionSpec, null, 2) },
    { name: "scene-manifest.json", content: JSON.stringify(sceneManifest, null, 2) },
    { name: "acceptance.json", content: JSON.stringify(acceptance, null, 2) },
    ...(recorderFlow ? [{ name: "imported-recorder-flow.json", content: JSON.stringify(recorderFlow, null, 2) }] : []),
    ...(recorderFlowMatch ? [{ name: "imported-recorder-flow-match.json", content: JSON.stringify(recorderFlowMatch, null, 2) }] : []),
    ...artifactFiles
  ];
}

export function buildMultiRouteRebuildDraftPackFiles(
  routes: RebuildRouteEntry[],
  brief: DesignBrief,
  locale: Locale,
  artifactFilesByRoute: Record<string, ZipTextFile[]> = {}
): ZipTextFile[] {
  if (routes.length < 2) throw new Error(locale === "zh" ? "至少加入两个已采集路由后才能导出网站重建项目。" : "Add at least two captured routes before exporting a site rebuild project.");
  if (!brief.rebuild.authorizationConfirmed) {
    throw new Error(locale === "zh" ? "请先确认你拥有所有路由的重建和证据采集权限。" : "Confirm permission to rebuild and capture evidence for every route.");
  }
  const origins = new Set(routes.map((route) => new URL(route.url).origin));
  if (origins.size !== 1) throw new Error(locale === "zh" ? "网站重建项目当前只支持同源路由。" : "Site rebuild projects currently support same-origin routes only.");

  const routeFiles: ZipTextFile[] = [];
  const routeManifest = routes.map((route) => {
    if (!/^route-[a-z0-9._-]+$/i.test(route.id)) throw new Error(`Unsafe route id: ${route.id}`);
    const folder = `routes/${route.id}`;
    const files = buildRebuildDraftPackFiles(route.capture, brief, locale, artifactFilesByRoute[route.id] ?? [], route.recorderFlow, route.recorderFlowMatch);
    for (const file of files) routeFiles.push({ ...file, name: `${folder}/${file.name}` });
    const project = captureProjectFromDesignCapture(route.capture, "rebuild");
    return {
      id: route.id,
      title: route.title,
      sourceUrl: route.url,
      path: route.path,
      folder,
      capturedScenes: project.scenes.filter((scene) => scene.status === "captured" && scene.screenshotArtifactId).length,
      motionCheckpoints: project.motionCheckpoints?.filter((checkpoint) => checkpoint.status === "captured" && checkpoint.screenshotArtifactId).length ?? 0,
      canvasFrames: project.canvasFrames?.filter((frame) => frame.status === "readable" && frame.artifactId).length ?? 0,
      verifyCommand: `npm run verify:rebuild -- --pack <site-rebuild.zip> --route ${route.id} --url <candidate-route-url>`
    };
  });
  const manifest = {
    version: 1,
    status: "draft",
    origin: routes[0] ? new URL(routes[0].url).origin : "",
    routeCount: routeManifest.length,
    routeLimit: 8,
    navigationPolicy: "manual-explicit-capture",
    routes: routeManifest
  };
  const readme = `# Design Lens Site Rebuild Draft

${locale === "zh"
    ? "这是同源多路由重建草稿。每条路由都有独立证据、场景清单和验收配置；它不会自动爬站，也不会把一个路由的验收结果外推到其他路由。"
    : "This is a same-origin multi-route rebuild draft. Every route has independent evidence, scene manifests, and acceptance config. It does not crawl automatically or extrapolate one route's result to another."}

- Origin: ${manifest.origin}
- Routes: ${manifest.routeCount}
- Status: site-rebuild-draft

## ${locale === "zh" ? "逐路由验收" : "Per-route acceptance"}

${routeManifest.map((route) => `- ${route.path}: \`${route.verifyCommand}\``).join("\n")}
`;
  return [
    { name: "README.md", content: readme },
    { name: "route-manifest.json", content: JSON.stringify(manifest, null, 2) },
    ...routeFiles
  ];
}

export async function loadRebuildArtifactFiles(capture: DesignCapture, locale: Locale): Promise<ZipTextFile[]> {
  const evidence = capture.rebuildEvidence;
  if (!evidence?.artifacts.length) return [];
  const expectedIds = new Set(evidence.artifacts.map((artifact) => artifact.id));
  const store = new CaptureProjectStore();
  try {
    const artifacts = await store.listArtifacts(evidence.storageProjectId);
    const available = artifacts.filter((artifact) => expectedIds.has(artifact.artifactId));
    const availableIds = new Set(available.map((artifact) => artifact.artifactId));
    const missingIds = Array.from(expectedIds).filter((artifactId) => !availableIds.has(artifactId));
    if (missingIds.length) {
      throw new Error(locale === "zh"
        ? `部分重建证据文件已不可用（${missingIds.join(", ")}），请重新录制后再导出。`
        : `Captured rebuild artifacts are unavailable (${missingIds.join(", ")}). Record the page again before exporting.`);
    }
    return Promise.all(available
      .map(async (artifact) => ({ name: artifact.name, content: await artifact.blob.arrayBuffer() })));
  } finally {
    await store.close();
  }
}

export async function loadMultiRouteRebuildArtifactFiles(routes: RebuildRouteEntry[], locale: Locale) {
  return Object.fromEntries(await Promise.all(routes.map(async (route) => [route.id, await loadRebuildArtifactFiles(route.capture, locale)] as const)));
}

export function buildFailedAiBrief(prompt: string, providerName: string, locale: Locale, error: string) {
  return [
    `# ${locale === "zh" ? "AI 实施 Brief 生成失败" : "AI Implementation Brief Generation Failed"}`,
    ``,
    locale === "zh"
      ? `远程模型生成失败。服务商：${providerName || "unknown"}。错误：${error}`
      : `Remote model generation failed. Provider: ${providerName || "unknown"}. Error: ${error}`,
    ``,
    locale === "zh" ? "下面的 Prompt 已经包含压缩后的 Skill、Token、动效证据和用户目标，可以直接复制给任意兼容的 AI 编程工具。" : "The prompt below already contains compressed Skill, tokens, motion evidence, and user intent. Copy it into any compatible AI coding tool.",
    ``,
    prompt
  ].join("\n");
}

export function buildPackFilename(capture: DesignCapture, kind: PackKind) {
  const host = captureHost(capture.page.url).replace(/^www\./, "");
  const safeHost = host.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "site";
  const date = new Date().toISOString().slice(0, 10);
  return `design-lens-${kind}-${safeHost}-${date}.zip`;
}

export function buildMultiRoutePackFilename(routes: RebuildRouteEntry[]) {
  const host = routes[0] ? captureHost(routes[0].url).replace(/^www\./, "") : "site";
  const safeHost = host.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "site";
  return `design-lens-site-rebuild-${safeHost}-${new Date().toISOString().slice(0, 10)}.zip`;
}

function buildEvidencePackFiles(capture: DesignCapture, brief: DesignBrief, locale: Locale, packKind: PackKind, aiState: "generated" | "failed" | "not-requested"): ZipTextFile[] {
  const payload = buildAiAnalysisPayload(capture, locale);
  const skill = generateCompactSkillMarkdown(capture, locale);
  const project = captureProjectFromDesignCapture(capture, "reference");
  const evidence = {
    version: 2,
    project,
    capture,
    page: capture.page,
    scope: capture.scope,
    viewport: capture.viewport,
    analysis: capture.analysis,
    designBrief: brief,
    tokens: capture.tokens,
    evidencePack: payload.capture.evidencePack,
    implementationTrace: capture.implementationTrace ?? {},
    evidenceMetrics: payload.capture.evidenceMetrics,
    layoutProfile: capture.layoutProfile,
    counts: {
      components: capture.components.length,
      motion: capture.motion.length,
      interactions: capture.interactions.length
    }
  };
  const readme = `# Design Lens Pack

${packKind === "ai-prompt"
    ? (locale === "zh" ? "这是一次捕获得到的 AI Prompt 资料包：Prompt、Skill、Token、证据和实现链路已经分文件放好。" : "This is an AI prompt delivery pack from one capture: prompt, Skill, tokens, evidence, and implementation trace are separated into clear files.")
    : (locale === "zh" ? "这是一次捕获得到的基础资料包：包含 Skill、Token、证据和实现链路，不包含 AI Prompt。" : "This is an evidence-only pack from one capture: Skill, tokens, evidence, and implementation trace are included. No AI prompt is included.")}

## ${locale === "zh" ? "如何使用" : "How to use"}

${packKind === "ai-prompt"
    ? `1. ${locale === "zh" ? "先打开 ai-coding-prompt.md，将它交给你常用的 AI 编程工具。" : "Open ai-coding-prompt.md and give it to your AI coding tool."}
2. ${locale === "zh" ? "需要完整参考时，把 skill.md 和 evidence.json 一起提供。" : "For richer reference, provide skill.md and evidence.json as well."}
3. ${locale === "zh" ? "ai-implementation-brief.md 是模型返回或失败兜底说明。" : "ai-implementation-brief.md contains the model result or fallback notes."}`
    : `1. ${locale === "zh" ? "先打开 skill.md，查看网站/组件参考书。" : "Open skill.md first as the site/component reference guide."}
2. ${locale === "zh" ? "查看 evidence.json，里面合并了 Token、证据、实现链路和摘要。" : "Open evidence.json for tokens, evidence, implementation trace, and summary."}
3. ${locale === "zh" ? "如果后续要生成 Prompt，请回到插件配置 API Key 后重新生成 Prompt 包。" : "To generate a prompt later, configure an API key in the extension and generate a prompt pack."}`}

## ${locale === "zh" ? "完整证据" : "Complete evidence"}

- \`capture-v1.json\`: ${locale === "zh" ? "本次采集的完整原始 DesignCapture，不做摘要裁剪。" : "The complete raw DesignCapture without summary truncation."}
- \`capture-project-v2.json\`: ${locale === "zh" ? "版本化项目清单、能力和证据覆盖缺口。" : "Versioned project manifest, capabilities, and evidence coverage gaps."}
- \`evidence.json\`: ${locale === "zh" ? "兼容现有使用方式的合并文件，并包含上述完整捕获。" : "Merged backward-compatible evidence that also includes the complete capture."}

## ${locale === "zh" ? "生成状态" : "Generation status"}

- Pack: ${packKind}
- AI: ${aiState}
- Page: ${capture.page.title}
- URL: ${capture.page.url}
- Scope: ${capture.scope}
- Viewport: ${capture.viewport.width}x${capture.viewport.height}@${capture.viewport.devicePixelRatio}
`;

  return [
    { name: "README.md", content: readme },
    { name: "skill.md", content: skill },
    { name: "evidence.json", content: JSON.stringify(evidence, null, 2) },
    { name: "capture-v1.json", content: JSON.stringify(capture, null, 2) },
    { name: "capture-project-v2.json", content: serializeCaptureProject(project) }
  ];
}
