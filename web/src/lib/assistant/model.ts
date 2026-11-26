import Anthropic from "@anthropic-ai/sdk";

// Cliente da Anthropic. Em testes, setModelClient troca por um modelo roteirizado (nenhuma chamada paga).

export type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type ModelClient = { create(params: CreateParams): Promise<Anthropic.Beta.BetaMessage> };

let override: ModelClient | null = null;
export function setModelClient(client: ModelClient | null) {
  override = client;
}
export const hasModelOverride = () => !!override;

export function modelClient(): ModelClient {
  if (override) return override;
  // maxRetries: o SDK já repete 429, 5xx e falhas de rede com espera crescente.
  const client = new Anthropic({ maxRetries: 3, timeout: 60_000 });
  return { create: (params) => client.beta.messages.create(params) };
}

/** Fallback automático do servidor quando o modelo recusa. O Haiku não tem fallback no servidor. */
export function fallbackParams(model: string): Partial<CreateParams> {
  if (/^claude-(opus-5|sonnet-5-5|fable-5)/.test(model)) {
    return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as Partial<CreateParams>;
  }
  return {};
}
