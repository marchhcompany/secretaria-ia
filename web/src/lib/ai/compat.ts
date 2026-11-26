import OpenAI from "openai";
import type { ChatProvider, HistoryItem } from "./types";

// Um adaptador para todos os provedores com endpoint compatível com a API de Chat Completions da OpenAI,
// usando o SDK oficial da OpenAI: OpenAI, Google Gemini, Groq e OpenRouter.

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type CompatKind = "openai" | "gemini" | "groq" | "openrouter";

const CONFIG: Record<CompatKind, { baseURL?: string; keyEnv: string }> = {
  openai: { keyEnv: "OPENAI_API_KEY" },
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", keyEnv: "GEMINI_API_KEY" },
  groq: { baseURL: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
};

export type CompatClient = { create(kind: CompatKind, body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> };

let override: CompatClient | null = null;
/** Testes: troca o cliente por um roteirizado. */
export function setCompatClient(client: CompatClient | null) {
  override = client;
}

function client(): CompatClient {
  if (override) return override;
  return {
    create: (kind, body) =>
      new OpenAI({ apiKey: process.env[CONFIG[kind].keyEnv], baseURL: CONFIG[kind].baseURL, maxRetries: 3, timeout: 60_000 }).chat.completions.create(body),
  };
}

/** Gemini e Groq não aceitam bem tipos união (["string","null"]): vira string, e vazio = sem valor. */
function relax(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(relax);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type" && Array.isArray(v)) out[k] = v.find((t) => t !== "null") ?? "string";
    else out[k] = relax(v);
  }
  return out;
}

export function compatProvider(kind: CompatKind): ChatProvider {
  return {
    kind,
    configured: () => !!override || !!process.env[CONFIG[kind].keyEnv],

    rebuild(history: HistoryItem[]) {
      return history.map((h): Msg => ({ role: h.role, content: h.text }));
    },

    addUser(transcript, texts) {
      (transcript as Msg[]).push({ role: "user", content: texts.join("\n") });
    },

    async step({ model, system, tools, transcript }) {
      const strict = kind === "openai";
      const reasoning = kind === "openai" || kind === "gemini" || kind === "groq";
      const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: [{ role: "system", content: system }, ...(transcript as Msg[])],
        tools: tools.map((t) => ({
          type: "function" as const,
          function: { name: t.name, description: t.description, parameters: strict ? t.parameters : (relax(t.parameters) as Record<string, unknown>), ...(strict ? { strict: true } : {}) },
        })),
        ...(kind === "openai" ? { max_completion_tokens: 8000 } : { max_tokens: 8000 }),
        ...(reasoning ? { reasoning_effort: "low" as const } : {}),
      };
      const res = await client().create(kind, body);
      const choice = res.choices[0];
      const msg = choice?.message;
      (transcript as Msg[]).push({
        role: "assistant",
        content: msg?.content ?? "",
        ...(msg?.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
      } as Msg);
      const calls = (msg?.tool_calls ?? []).filter((c) => c.type === "function");
      return {
        toolCalls: calls.map((c) => ({ id: c.id, name: c.function.name, input: safeJson(c.function.arguments) })),
        text: (msg?.content ?? "").trim(),
        refused: !!msg?.refusal || choice?.finish_reason === "content_filter",
        pause: false,
        servedModel: `${kind}:${res.model || model}`,
        usage: {
          input: (res.usage?.prompt_tokens ?? 0) - (res.usage?.prompt_tokens_details?.cached_tokens ?? 0),
          output: res.usage?.completion_tokens ?? 0,
          cacheRead: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          cacheWrite: 0,
        },
      };
    },

    addToolResults(transcript, results) {
      for (const r of results) (transcript as Msg[]).push({ role: "tool", tool_call_id: r.id, content: r.isError ? `ERRO: ${r.content}` : r.content });
    },
  };
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
