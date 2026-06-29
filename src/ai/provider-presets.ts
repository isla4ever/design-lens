import type { AiEndpoint, AiSettings } from "../shared/ai-settings";

export type AiProviderPreset = {
  id: string;
  name: string;
  region: "global" | "china" | "local";
  baseUrl: string;
  endpoint: AiEndpoint;
  model: string;
  note: string;
  source: "native" | "openai-compatible" | "gateway";
};

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    region: "global",
    baseUrl: "https://api.openai.com/v1",
    endpoint: "responses",
    model: "gpt-5.4-mini",
    note: "Official Responses API.",
    source: "native"
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    region: "global",
    baseUrl: "https://openrouter.ai/api/v1",
    endpoint: "chat-completions",
    model: "deepseek/deepseek-r1",
    note: "Aggregates many global and Chinese open models through an OpenAI-compatible API.",
    source: "gateway"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    region: "china",
    baseUrl: "https://api.deepseek.com/v1",
    endpoint: "chat-completions",
    model: "deepseek-chat",
    note: "DeepSeek native OpenAI-compatible endpoint.",
    source: "openai-compatible"
  },
  {
    id: "dashscope",
    name: "Alibaba Qwen / DashScope",
    region: "china",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    endpoint: "chat-completions",
    model: "qwen-plus",
    note: "Qwen OpenAI-compatible mode; also useful for Qwen Coder and some DeepSeek models on Bailian.",
    source: "openai-compatible"
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    region: "china",
    baseUrl: "https://api.siliconflow.cn/v1",
    endpoint: "chat-completions",
    model: "deepseek-ai/DeepSeek-V3",
    note: "Chinese gateway with DeepSeek, Qwen, GLM, Yi, and open models.",
    source: "gateway"
  },
  {
    id: "zhipu",
    name: "Zhipu GLM",
    region: "china",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    endpoint: "chat-completions",
    model: "glm-4-flash",
    note: "GLM OpenAI-compatible v4 endpoint.",
    source: "openai-compatible"
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    region: "china",
    baseUrl: "https://api.moonshot.cn/v1",
    endpoint: "chat-completions",
    model: "moonshot-v1-32k",
    note: "Moonshot OpenAI-compatible endpoint.",
    source: "openai-compatible"
  },
  {
    id: "volcengine",
    name: "Volcengine Ark / Doubao",
    region: "china",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    endpoint: "chat-completions",
    model: "doubao-seed-1-6",
    note: "Volcengine Ark OpenAI-compatible path; replace model with your endpoint/model id if needed.",
    source: "openai-compatible"
  },
  {
    id: "baidu-qianfan",
    name: "Baidu Qianfan",
    region: "china",
    baseUrl: "https://qianfan.baidubce.com/v2",
    endpoint: "chat-completions",
    model: "ernie-4.0-turbo-8k",
    note: "Qianfan v2 chat completions style endpoint.",
    source: "openai-compatible"
  },
  {
    id: "minimax",
    name: "MiniMax",
    region: "china",
    baseUrl: "https://api.minimax.chat/v1",
    endpoint: "chat-completions",
    model: "MiniMax-Text-01",
    note: "MiniMax OpenAI-compatible style endpoint where available.",
    source: "openai-compatible"
  },
  {
    id: "baichuan",
    name: "Baichuan",
    region: "china",
    baseUrl: "https://api.baichuan-ai.com/v1",
    endpoint: "chat-completions",
    model: "Baichuan2-Turbo",
    note: "Baichuan OpenAI-compatible style endpoint where available.",
    source: "openai-compatible"
  },
  {
    id: "ollama",
    name: "Ollama Local",
    region: "local",
    baseUrl: "http://localhost:11434/v1",
    endpoint: "chat-completions",
    model: "qwen2.5-coder:7b",
    note: "Local OpenAI-compatible endpoint.",
    source: "openai-compatible"
  },
  {
    id: "one-api",
    name: "One API / New API Gateway",
    region: "china",
    baseUrl: "http://localhost:3000/v1",
    endpoint: "chat-completions",
    model: "deepseek-chat",
    note: "Self-hosted gateway inspired by One API / New API; replace URL with your deployment.",
    source: "gateway"
  }
];

export function findProviderPreset(settings: Pick<AiSettings, "baseUrl" | "endpoint" | "model">) {
  return AI_PROVIDER_PRESETS.find((preset) => preset.baseUrl === settings.baseUrl && preset.endpoint === settings.endpoint && preset.model === settings.model);
}

export function applyProviderPreset(settings: AiSettings, presetId: string): AiSettings {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === presetId);
  if (!preset) return settings;
  return {
    ...settings,
    baseUrl: preset.baseUrl,
    endpoint: preset.endpoint,
    model: preset.model
  };
}
