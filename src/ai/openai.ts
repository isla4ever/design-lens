import type { Locale } from "../shared/i18n";
import type { DesignCapture } from "../shared/schema";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, type AiEndpoint } from "../shared/ai-settings";
import type { DesignBrief } from "../shared/design-brief";
import { buildAiAnalysisPayload, buildAiPrompt } from "./context";

export type AiAnalysisOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  endpoint?: AiEndpoint;
  locale: Locale;
  brief?: DesignBrief;
};

export async function generateAiDesignAnalysis(capture: DesignCapture, options: AiAnalysisOptions) {
  const payload = buildAiAnalysisPayload(capture, options.locale);
  const prompt = buildAiPrompt(payload, options.brief);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const endpoint = options.endpoint ?? "responses";
  const response = endpoint === "chat-completions"
    ? await callChatCompletions(prompt, options.apiKey, options.model || DEFAULT_AI_MODEL, baseUrl)
    : await callResponses(prompt, options.apiKey, options.model || DEFAULT_AI_MODEL, baseUrl);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI request failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  return extractResponseText(data) || "";
}

function callResponses(prompt: string, apiKey: string, model: string, baseUrl: string) {
  return fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  });
}

function callChatCompletions(prompt: string, apiKey: string, model: string, baseUrl: string) {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2
    })
  });
}

export function extractResponseText(data: unknown): string {
  const maybe = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (typeof maybe.output_text === "string") return maybe.output_text;
  const chatText = maybe.choices?.map((choice) => choice.message?.content ?? "").join("\n").trim();
  if (chatText) return chatText;
  return maybe.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("\n").trim() ?? "";
}

function normalizeBaseUrl(value: string | undefined) {
  const fallback = DEFAULT_AI_BASE_URL;
  const trimmed = (value || fallback).trim().replace(/\/+$/, "");
  return trimmed || fallback;
}
