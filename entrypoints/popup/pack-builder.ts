import { buildAiAnalysisPayload } from "../../src/ai/context";
import { generateCompactSkillMarkdown } from "../../src/generators/skill/skill";
import { briefBorrowLabel, type DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import type { ZipTextFile } from "../../src/shared/zip";
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

function buildEvidencePackFiles(capture: DesignCapture, brief: DesignBrief, locale: Locale, packKind: PackKind, aiState: "generated" | "failed" | "not-requested"): ZipTextFile[] {
  const payload = buildAiAnalysisPayload(capture, locale);
  const skill = generateCompactSkillMarkdown(capture, locale);
  const evidence = {
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
    { name: "evidence.json", content: JSON.stringify(evidence, null, 2) }
  ];
}
