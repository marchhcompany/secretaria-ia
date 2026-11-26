import { anthropicProvider } from "./anthropic";
import { defaultModelSpec, parseSpec } from "./catalog";
import { compatProvider } from "./compat";
import type { ChatProvider } from "./types";

export * from "./catalog";
export * from "./types";

export function providerFor(spec: string): { provider: ChatProvider; model: string; spec: string } {
  const { provider, model } = parseSpec(spec);
  return { provider: provider === "anthropic" ? anthropicProvider : compatProvider(provider), model, spec: `${provider}:${model}` };
}

/** Modelo de um negócio: o escolhido no painel ou o padrão do servidor. */
export const modelSpecFor = (business: { aiModel: string }) => business.aiModel || defaultModelSpec();
