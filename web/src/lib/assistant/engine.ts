import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours, businesses, conversations, customers, faqs, messages, services, staff } from "@/db/schema";
import { formatLong } from "@/lib/time";
import { buildSystemPrompt } from "./prompt";
import { TOOLS, runTool } from "./tools";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_STEPS = 8;

export type AssistantOutcome =
  | { status: "replied"; text: string; handoff: boolean }
  | { status: "human" } // conversa está com a equipe: a assistente não responde
  | { status: "not_configured" }
  | { status: "error"; message: string };

/**
 * Recebe uma mensagem do cliente, roda a assistente e grava tudo no banco.
 * O histórico enviado à API (`conversations.transcript`) só cresce: nunca é editado,
 * para manter válidos os blocos de raciocínio do modelo entre as mensagens.
 */
export async function handleCustomerMessage(conversationId: string, text: string): Promise<AssistantOutcome> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conversation) return { status: "error", message: "Conversa não encontrada." };

  const businessId = conversation.businessId;
  const [[business], [customer], serviceRows, staffRows, hourRows, faqRows] = await Promise.all([
    db.select().from(businesses).where(eq(businesses.id, businessId)),
    db.select().from(customers).where(eq(customers.id, conversation.customerId)),
    db.select().from(services).where(eq(services.businessId, businessId)).orderBy(asc(services.name)),
    db.select().from(staff).where(eq(staff.businessId, businessId)).orderBy(asc(staff.name)),
    db.select().from(businessHours).where(eq(businessHours.businessId, businessId)),
    db.select().from(faqs).where(eq(faqs.businessId, businessId)).orderBy(asc(faqs.createdAt)),
  ]);
  if (!business || !customer) return { status: "error", message: "Negócio ou cliente não encontrado." };

  const now = new Date();
  await db.insert(messages).values({ businessId, conversationId, role: "customer", content: text });
  await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));

  if (conversation.mode === "human") return { status: "human" };
  if (!process.env.ANTHROPIC_API_KEY) return { status: "not_configured" };

  const transcript = conversation.transcript as Anthropic.Beta.BetaMessageParam[];
  const known = customer.name ? ` Cliente: ${customer.name}.` : " Cliente ainda sem nome cadastrado.";
  transcript.push({
    role: "user",
    content: [
      { type: "text", text: `[Recebida em ${formatLong(now, business.timezone)}.${known}]` },
      { type: "text", text },
    ],
  });

  const system = buildSystemPrompt({ business, services: serviceRows, staff: staffRows, hours: hourRows, faqs: faqRows });

  let handoff = false;
  const toolCtx = {
    business,
    customer,
    conversationId,
    services: serviceRows,
    staff: staffRows,
    onHandoff: () => {
      handoff = true;
    },
  };

  const client = new Anthropic();
  let reply = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages: transcript,
      });

      transcript.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") {
        reply = "Vou pedir para alguém da equipe te responder, tudo bem? Já já falam com você.";
        await runTool("chamar_atendente", { motivo: "A assistente não conseguiu responder a esta mensagem." }, toolCtx);
        break;
      }

      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        reply = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const r = await runTool(use.name, (use.input ?? {}) as Record<string, unknown>, toolCtx);
        results.push({ type: "tool_result", tool_use_id: use.id, content: r.content, is_error: r.isError });
      }
      transcript.push({ role: "user", content: results });
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { status: "error", message: "Chave da Anthropic inválida." };
    if (err instanceof Anthropic.RateLimitError) return { status: "error", message: "Muitas mensagens ao mesmo tempo. Tente de novo em instantes." };
    if (err instanceof Anthropic.APIError) return { status: "error", message: `Erro da API (${err.status}): ${err.message}` };
    throw err;
  }

  if (!reply) reply = "Desculpe, não consegui responder agora. Pode repetir, por favor?";

  await db
    .update(conversations)
    .set({ transcript, lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));
  await db.insert(messages).values({ businessId, conversationId, role: "assistant", content: reply });

  return { status: "replied", text: reply, handoff };
}
