import type Anthropic from "@anthropic-ai/sdk";
import { fallbackParams, hasModelOverride, modelClient } from "@/lib/assistant/model";
import type { ChatProvider, HistoryItem, ToolDef } from "./types";

type Msg = Anthropic.Beta.BetaMessageParam;

export const anthropicProvider: ChatProvider = {
  kind: "anthropic",
  configured: () => hasModelOverride() || !!process.env.ANTHROPIC_API_KEY,

  rebuild(history: HistoryItem[]) {
    return history.map((h): Msg => ({ role: h.role, content: [{ type: "text", text: h.text }] }));
  },

  addUser(transcript, texts) {
    (transcript as Msg[]).push({ role: "user", content: texts.map((text) => ({ type: "text" as const, text })) });
  },

  async step({ model, system, tools, transcript }) {
    const response = await modelClient().create({
      model,
      max_tokens: 8000,
      ...fallbackParams(model),
      output_config: { effort: "low" },
      // Cache automático do histórico: cada nova mensagem relê o histórico do cache (~10% do preço).
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: tools.map(toAnthropicTool),
      messages: transcript as Msg[],
    });
    (transcript as Msg[]).push({ role: "assistant", content: response.content });
    const u = response.usage;
    return {
      toolCalls: response.content
        .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> })),
      text: response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim(),
      refused: response.stop_reason === "refusal",
      pause: response.stop_reason === "pause_turn",
      servedModel: response.model || model,
      usage: {
        input: u?.input_tokens ?? 0,
        output: u?.output_tokens ?? 0,
        cacheRead: u?.cache_read_input_tokens ?? 0,
        cacheWrite: u?.cache_creation_input_tokens ?? 0,
      },
    };
  },

  addToolResults(transcript, results) {
    (transcript as Msg[]).push({
      role: "user",
      content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content, is_error: r.isError })),
    });
  },
};

function toAnthropicTool(t: ToolDef): Anthropic.Beta.BetaTool {
  return { name: t.name, description: t.description, strict: true, input_schema: t.parameters as Anthropic.Beta.BetaTool["input_schema"] };
}
