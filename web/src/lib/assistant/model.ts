import Anthropic from "@anthropic-ai/sdk";

// Ponto único de acesso ao modelo. Em testes, setModelClient troca por um modelo roteirizado
// (nenhuma chamada paga é feita).

export type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type ModelClient = { create(params: CreateParams): Promise<Anthropic.Beta.BetaMessage> };

let override: ModelClient | null = null;
export function setModelClient(client: ModelClient | null) {
  override = client;
}

export function modelConfigured(): boolean {
  return !!override || !!process.env.ANTHROPIC_API_KEY;
}

export function modelClient(): ModelClient {
  if (override) return override;
  // maxRetries: o SDK já repete 429, 5xx e falhas de rede com espera crescente.
  const client = new Anthropic({ maxRetries: 3, timeout: 60_000 });
  return { create: (params) => client.beta.messages.create(params) };
}

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Preço oficial da API da Anthropic (US$ por milhão de tokens), consultado em 2026-11.
// cacheWrite = escrita de cache de 5 minutos (1,25x a entrada).
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export function usageOf(message: Anthropic.Beta.BetaMessage): Usage {
  const u = message.usage;
  return {
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    cacheWrite: u?.cache_creation_input_tokens ?? 0,
  };
}

/** Custo em milionésimos de dólar. Modelo desconhecido usa a tabela do Opus (estimativa conservadora). */
export function costMicroUsd(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return Math.round(u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite);
}

/** Fallback automático do servidor quando o modelo recusa. O Haiku não tem fallback no servidor. */
export function fallbackParams(model: string): Partial<CreateParams> {
  if (/^claude-(opus-5|sonnet-5-5|fable-5)/.test(model)) {
    return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as Partial<CreateParams>;
  }
  return {};
}
