# AI Provider Research

This research looked for high-star multi-provider projects and gateway projects
that can inform Design Lens' AI integration.

## Studied Projects

- [LiteLLM](https://github.com/BerriAI/litellm): 50k+ stars. Strong global
  reference for 100+ providers, routing, proxy mode, provider adapters, and
  OpenAI-compatible gateways. Full dependency is too heavy for a browser
  extension, but its provider-directory model validates our preset approach.
- [Vercel AI SDK](https://github.com/vercel/ai): 25k+ stars. Best TypeScript
  reference for provider packages and frontend-friendly model abstraction. Good
  architecture reference, but importing it would add unnecessary weight because
  Design Lens only needs one analysis request.
- [One API](https://github.com/songquanpeng/one-api): 35k+ stars. Strong China
  provider reference. Source confirms providers such as DeepSeek, Qwen,
  Zhipu GLM, Baidu ERNIE/Qianfan, Xunfei Spark, Tencent Hunyuan, Moonshot,
  Baichuan, MiniMax, Doubao/Volcengine, SiliconFlow, and OpenRouter.
- [New API](https://github.com/QuantumNous/new-api): 40k+ stars. Modern fork /
  successor-style gateway with OpenAI/Claude/Gemini-compatible distribution.
  Useful as a self-hosted gateway target, but not something to embed in the
  extension.
- [TanStack AI](https://github.com/TanStack/ai): Type-safe provider-agnostic TS
  SDK. Useful architecture signal, but still early and broader than this
  extension's needs.

## Product Decision

Do not embed a heavyweight SDK or gateway into the extension. The browser
extension only needs:

1. Provider presets.
2. Endpoint mode selection.
3. A small request adapter.
4. A privacy-clear API key storage model.

This keeps the extension lightweight, auditable, and easy to open-source.

## Implemented Presets

Presets live in `src/ai/provider-presets.ts`.

- OpenAI
- OpenRouter
- DeepSeek
- Alibaba Qwen / DashScope
- SiliconFlow
- Zhipu GLM
- Moonshot / Kimi
- Volcengine Ark / Doubao
- Baidu Qianfan
- MiniMax
- Baichuan
- Ollama Local
- One API / New API Gateway

## Key Principle

There is no universal API key. Keys are provider-specific. A gateway such as
OpenRouter, One API, New API, or LiteLLM can create a single key for its own
gateway, but that is because the gateway handles upstream provider keys on the
server side.
