// Modelos suportados e preços (US$ por milhão de tokens).
// "confirmed": conferido na página oficial do provedor. "secondary": só fontes secundárias (confirmar antes de contratar).
// O identificador é "provedor:modelo". Valores antigos sem prefixo ("claude-...") são tratados como Anthropic.

export type ProviderKind = "anthropic" | "openai" | "gemini" | "groq" | "openrouter";

export type ModelInfo = {
  spec: string;
  provider: ProviderKind;
  model: string;
  label: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  priceSource: "confirmed" | "secondary";
  checkedAt: string;
};

const m = (
  spec: string,
  label: string,
  p: [input: number, output: number, cacheRead: number, cacheWrite: number],
  priceSource: ModelInfo["priceSource"],
): ModelInfo => {
  const [provider, ...rest] = spec.split(":");
  return {
    spec,
    provider: provider as ProviderKind,
    model: rest.join(":"),
    label,
    input: p[0],
    output: p[1],
    cacheRead: p[2],
    cacheWrite: p[3],
    priceSource,
    checkedAt: "2026-11-26",
  };
};

export const MODELS: ModelInfo[] = [
  // Página oficial de preços da Anthropic (platform.claude.com), lida em 2026-11-26.
  m("anthropic:claude-haiku-5-5", "Claude Haiku 5.5", [0.1, 0.5, 0.01, 0.125], "confirmed"),
  m("anthropic:claude-sonnet-5-5", "Claude Sonnet 5.5", [2, 10, 0.1, 2.5], "confirmed"),
  m("anthropic:claude-opus-5-5", "Claude Opus 5.5", [4, 20, 0.2, 5], "confirmed"),
  // Sites oficiais bloqueados neste ambiente: valores de fontes secundárias de nov/2026.
  m("openai:gpt-5-mini", "OpenAI GPT-5 mini", [0.25, 2, 0.025, 0.25], "secondary"),
  m("openai:gpt-5-nano", "OpenAI GPT-5 nano", [0.05, 0.4, 0.005, 0.05], "secondary"),
  m("gemini:gemini-2.5-flash", "Gemini 2.5 Flash", [0.3, 2.5, 0.3, 0.3], "secondary"),
  m("gemini:gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite", [0.1, 0.4, 0.1, 0.1], "secondary"),
  m("groq:openai/gpt-oss-120b", "GPT-OSS 120B (Groq)", [0.15, 0.6, 0.075, 0.15], "secondary"),
  m("groq:openai/gpt-oss-20b", "GPT-OSS 20B (Groq)", [0.075, 0.3, 0.075, 0.075], "secondary"),
];

/** Sem preço conhecido (ex.: modelo do OpenRouter fora do catálogo): usa a tabela mais cara do catálogo, para não subestimar. */
const UNKNOWN_PRICE = MODELS.find((x) => x.spec === "anthropic:claude-opus-5-5")!;

export function parseSpec(spec: string): { provider: ProviderKind; model: string } {
  const s = spec.trim();
  if (/^claude-/.test(s)) return { provider: "anthropic", model: s };
  const [provider, ...rest] = s.split(":");
  if (!["anthropic", "openai", "gemini", "groq", "openrouter"].includes(provider) || !rest.length)
    throw new Error(`Modelo inválido: "${spec}". Use provedor:modelo (ex.: anthropic:claude-haiku-5-5).`);
  return { provider: provider as ProviderKind, model: rest.join(":") };
}

export const normalizeSpec = (spec: string) => {
  const p = parseSpec(spec);
  return `${p.provider}:${p.model}`;
};

export function priceOf(spec: string): ModelInfo {
  const key = normalizeSpec(spec);
  return MODELS.find((x) => x.spec === key) ?? UNKNOWN_PRICE;
}

/** Modelo padrão do servidor. AI_MODEL tem prioridade; ANTHROPIC_MODEL é aceito por compatibilidade. */
export function defaultModelSpec(): string {
  const raw = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || "anthropic:claude-haiku-5-5";
  return normalizeSpec(raw);
}

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** Custo em milionésimos de dólar. OpenRouter cobra ~5,5% sobre a compra de créditos (somado aqui). */
export function costMicroUsd(spec: string, u: Usage): number {
  const p = priceOf(spec);
  const fee = parseSpec(spec).provider === "openrouter" ? 1.055 : 1;
  return Math.round((u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) * fee);
}
