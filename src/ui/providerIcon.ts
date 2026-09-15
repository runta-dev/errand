import type { ModelProviderOption } from "@/domain/types";

// Match the official endpoint catalog in Runta Dashboard, not user-editable names.
export function providerIconId(provider: ModelProviderOption): string {
  if (!provider.baseUrl) return "compatible";
  const endpoint = provider.baseUrl.replace(/\/+$/, "");
  if (endpoint === "https://api.openai.com/v1" && ["openai_chat", "openai_responses"].includes(provider.protocol)) return "openai";
  if (endpoint === "https://api.anthropic.com" && provider.protocol === "anthropic_messages") return "anthropic";
  if (endpoint === "https://api.moonshot.ai/v1" && ["openai_chat", "openai_responses"].includes(provider.protocol)) return "kimi";
  if (endpoint === "https://api.kimi.com/coding" && provider.protocol === "anthropic_messages") return "kimi_code";
  return "compatible";
}
