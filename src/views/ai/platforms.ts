import { t } from "@/i18n";

export const aiPlatforms = [
  {
    id: "gpt",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [-122.27, 37.6] as [number, number],
    domestic: false,
    traceDomain: "chatgpt.com",
    apiUrl: "https://api.openai.com/v1",
    docsUrl: "https://platform.openai.com/docs/overview",
    name: "ChatGPT",
    domain: "chatgpt.com",
    statusId: "9",
  },
  {
    id: "claude",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [-122.27, 37.6] as [number, number],
    domestic: false,
    traceDomain: "claude.ai",
    apiUrl: "https://api.anthropic.com",
    docsUrl: "https://platform.claude.com/docs/en/api/overview",
    name: "Claude",
    domain: "claude.ai",
    statusId: "4",
  },
  {
    id: "grok",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [-122.27, 37.6] as [number, number],
    domestic: false,
    traceDomain: "grok.com",
    apiUrl: "https://api.x.ai",
    docsUrl: "https://docs.x.ai/",
    statusId: "33",
    name: "Grok",
    domain: "grok.com",
    statusPage: "https://status.x.ai",
  },
  {
    id: "perplexity",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [-122.27, 37.6] as [number, number],
    domestic: false,
    traceDomain: "www.perplexity.ai",
    apiUrl: "https://api.perplexity.ai",
    docsUrl: "https://docs.perplexity.ai/",
    name: "Perplexity",
    domain: "www.perplexity.ai",
    statusId: "10",
  },
  {
    id: "gemini",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [-122.27, 37.6] as [number, number],
    domestic: false,
    apiUrl: "https://generativelanguage.googleapis.com",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    statusId: "31",
    name: "Gemini",
    domain: "gemini.google.com",
    statusPage: "https://aistudio.google.com/status",
    statusLabel: t("AI Studio / Gemini API 状态"),
  },
  {
    id: "deepseek",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [120.15, 30.28] as [number, number],
    domestic: true,
    apiUrl: "https://api.deepseek.com",
    docsUrl: "https://api-docs.deepseek.com/",
    statusId: "32",
    name: "DeepSeek",
    domain: "chat.deepseek.com",
    statusPage: "https://status.deepseek.com",
  },
  {
    id: "qwen",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [120.15, 30.28] as [number, number],
    domestic: true,
    apiUrl: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
    docsUrl:
      "https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope",
    statusId: "34",
    name: t("通义千问"),
    domain: "chat.qwen.ai",
  },
  {
    id: "kimi",
    /** Approximate service region (company HQ area), used only for the map. */
    region: [116.4, 39.9] as [number, number],
    domestic: true,
    apiUrl: "https://api.moonshot.cn/v1",
    docsUrl: "https://platform.moonshot.cn/docs/intro",
    statusId: "35",
    name: "Kimi",
    domain: "www.kimi.com",
  },
];
export type AiPlatform = (typeof aiPlatforms)[number];
