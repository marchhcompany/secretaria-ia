import type Anthropic from "@anthropic-ai/sdk";
import { APIError, AuthenticationError, RateLimitError } from "@anthropic-ai/sdk";
import { and, asc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiUsage,
  businessHours,
  businesses,
  conversations,
  customers,
  faqs,
  messages,
  services,
  staff,
  type Business,
} from "@/db/schema";
import { formatLong } from "@/lib/time";
import { DEFAULT_MODEL, costMicroUsd, fallbackParams, modelClient, modelConfigured, usageOf } from "./model";
import { buildSystemPrompt, canBookDirectly } from "./prompt";
import { optOut, runTool, toolsFor } from "./tools";

const MAX_STEPS = 8;
// Proteção contra loops e abuso: acima disso a conversa vai para a equipe.
const MAX_REPLIES_PER_CONVERSATION_DAY = 40;

export const HOLDING_TEXT = "Recebi sua mensagem! Já já alguém da equipe te responde por aqui.";
export const OPT_OUT_TEXT = "Tudo bem, não vou mais te enviar mensagens. Se precisar de algo, é só chamar por aqui.";

export type AssistantOutcome =
  | { status: "replied"; text: string; parts: { id: string; text: string }[]; handoff: boolean }
  | { status: "nothing" } // não havia mensagem pendente (já respondida junto com outra)
  | { status: "human" } // conversa está com a equipe: a assistente não responde
  | { status: "disabled" } // IA desligada no negócio
  | { status: "not_configured" }
  | { status: "blocked"; message: string } // teto de custo ou limite de respostas atingido
  | { status: "error"; message: string };

/** Grava uma mensagem do cliente como pendente de resposta da IA. */
export async function addCustomerMessage(conversationId: string, content: string, at = new Date()) {
  const [conv] = await db
    .update(conversations)
    .set({ lastMessageAt: at })
    .where(eq(conversations.id, conversationId))
    .returning({ businessId: conversations.businessId, customerId: conversations.customerId });
  if (!conv) throw new Error("Conversa não encontrada.");
  await db.insert(messages).values({
    businessId: conv.businessId,
    conversationId,
    role: "customer",
    content,
    pendingAi: true,
    createdAt: at,
  });
  await db.update(customers).set({ lastInboundAt: at }).where(eq(customers.id, conv.customerId));
}

// Pedidos explícitos de descadastro: tratados sem depender da IA (funcionam mesmo com a IA fora do ar).
const OPT_OUT = [
  /^\s*(parar|pare|sair|stop|descadastrar|cancelar)\s*[.!]*\s*$/i,
  /n[ãa]o\s+(quero|desejo)\s+(mais\s+)?receber/i,
  /pare[m]?\s+de\s+(me\s+)?(mandar|enviar)/i,
  /n[ãa]o\s+me\s+(mande[m]?|envie[m]?)\s+mais/i,
  /(me\s+)?(tire|tirem|remova|removam)\s+(o\s+meu\s+n[úu]mero\s+|meu\s+n[úu]mero\s+)?(da|de)\s+(sua\s+|vossa\s+)?lista/i,
];
export const isOptOutRequest = (text: string) => OPT_OUT.some((re) => re.test(text));

export async function monthSpendMicroUsd(businessId: string, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint` })
    .from(aiUsage)
    .where(and(eq(aiUsage.businessId, businessId), gte(aiUsage.createdAt, start)));
  return Number(r?.total ?? 0);
}

/** Divide a resposta em até 3 mensagens (blocos separados por linha em branco), como uma pessoa faria. */
export function splitReply(text: string): string[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length <= 3) return blocks.length ? blocks : [text.trim()];
  return [blocks[0], blocks[1], blocks.slice(2).join("\n\n")];
}

/**
 * Responde todas as mensagens pendentes do cliente nesta conversa de uma vez.
 * Precisa rodar dentro da trava da conversa (withConversationLock) quando há concorrência.
 * O histórico enviado à API (`conversations.transcript`) só cresce: nunca é editado,
 * para manter válidos os blocos de raciocínio do modelo entre as mensagens.
 */
export async function runAssistant(conversationId: string): Promise<AssistantOutcome> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conversation) return { status: "error", message: "Conversa não encontrada." };
  const businessId = conversation.businessId;

  const pending = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.pendingAi, true)))
    .orderBy(asc(messages.createdAt));
  if (!pending.length) return { status: "nothing" };
  const markHandled = () =>
    db.update(messages).set({ pendingAi: false }).where(inArray(messages.id, pending.map((m) => m.id)));

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
  const combined = pending.map((m) => m.content).join("\n");

  // Descadastro explícito: registra e confirma, sem IA e mesmo com a conversa com a equipe.
  if (isOptOutRequest(combined)) {
    await markHandled();
    const alreadyOut = customer.optedOut;
    await optOut(businessId, customer.id);
    await db.insert(messages).values({
      businessId,
      conversationId,
      role: "system",
      content: "Cliente pediu para não receber mais mensagens. Automações canceladas.",
    });
    if (alreadyOut || conversation.mode === "human") return { status: "human" };
    const parts = await insertReply(business, conversationId, [OPT_OUT_TEXT], "opt_out");
    return { status: "replied", text: OPT_OUT_TEXT, parts, handoff: false };
  }

  if (conversation.mode === "human") {
    await markHandled();
    await db.update(conversations).set({ needsAttention: true }).where(eq(conversations.id, conversationId));
    return { status: "human" };
  }
  if (!business.aiEnabled) {
    await markHandled();
    await db.update(conversations).set({ needsAttention: true }).where(eq(conversations.id, conversationId));
    return { status: "disabled" };
  }
  if (!modelConfigured()) return { status: "not_configured" };

  const blocked = await usageBlock(business, conversationId, now);
  if (blocked) {
    await markHandled();
    await db
      .update(conversations)
      .set({ mode: "human", needsAttention: true, handoffReason: blocked })
      .where(eq(conversations.id, conversationId));
    await db.insert(messages).values({ businessId, conversationId, role: "system", content: `IA pausada: ${blocked}` });
    return { status: "blocked", message: blocked };
  }

  // O que a equipe escreveu enquanto a IA estava pausada vira contexto, para a IA não repetir nem contradizer.
  const staffSince = await db
    .select({ content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, "staff"),
        conversation.aiContextUntil ? gt(messages.createdAt, conversation.aiContextUntil) : undefined,
      ),
    )
    .orderBy(asc(messages.createdAt));

  const transcript = conversation.transcript as Anthropic.Beta.BetaMessageParam[];
  const baseLength = transcript.length;
  const known = customer.name ? ` Cliente: ${customer.name}.` : " Cliente ainda sem nome cadastrado.";
  const userBlocks: Anthropic.Beta.BetaTextBlockParam[] = [];
  if (staffSince.length)
    userBlocks.push({
      type: "text",
      text: `[A equipe escreveu para o cliente enquanto você estava pausada:\n${staffSince.map((s) => `- ${s.content}`).join("\n")}]`,
    });
  userBlocks.push({
    type: "text",
    text: `[Recebida em ${formatLong(pending.at(-1)!.createdAt, business.timezone)}.${known}${
      pending.length > 1 ? ` O cliente mandou ${pending.length} mensagens seguidas; responda todas juntas.` : ""
    }]`,
  });
  for (const m of pending) userBlocks.push({ type: "text", text: m.content });
  transcript.push({ role: "user", content: userBlocks });

  const ctx = { business, services: serviceRows, staff: staffRows, hours: hourRows, faqs: faqRows };
  const directBooking = canBookDirectly(ctx);
  const system = buildSystemPrompt(ctx);
  const tools = toolsFor(directBooking, business.bookingMode);
  const model = business.aiModel || DEFAULT_MODEL;

  let handoff = false;
  let attention: string | null = null;
  const toolCtx = {
    business,
    customer,
    conversationId,
    services: serviceRows,
    staff: staffRows,
    directBooking,
    onHandoff: () => {
      handoff = true;
    },
    onAttention: (reason: string) => {
      attention = reason;
    },
  };

  const client = modelClient();
  let reply = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.create({
        model,
        max_tokens: 8000,
        ...fallbackParams(model),
        output_config: { effort: "low" },
        // Cache automático do histórico: cada nova mensagem relê o histórico do cache (~10% do preço).
        cache_control: { type: "ephemeral" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools,
        messages: transcript,
      });
      await recordUsage(businessId, conversationId, response, model);
      transcript.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") {
        reply = "Vou pedir para alguém da equipe te responder, tudo bem? Já já falam com você.";
        await runTool("chamar_atendente", { motivo: "A assistente não conseguiu responder a esta mensagem." }, toolCtx);
        break;
      }
      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
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
    // Falha da IA: guarda só a mensagem do cliente no histórico (sem a volta incompleta),
    // para a próxima resposta já levar em conta o que ele escreveu.
    transcript.length = baseLength;
    transcript.push({ role: "user", content: userBlocks });
    await db
      .update(conversations)
      .set({ transcript, aiContextUntil: now, needsAttention: true })
      .where(eq(conversations.id, conversationId));
    await markHandled();
    const message = describeError(err);
    await db.insert(messages).values({ businessId, conversationId, role: "system", content: `A assistente não respondeu: ${message}` });
    return { status: "error", message };
  }

  if (!reply) reply = "Desculpe, não consegui responder agora. Pode repetir, por favor?";

  await db
    .update(conversations)
    .set({
      transcript,
      lastMessageAt: new Date(),
      aiContextUntil: now,
      ...(attention ? { needsAttention: true, handoffReason: attention } : {}),
    })
    .where(eq(conversations.id, conversationId));
  await markHandled();
  const parts = await insertReply(business, conversationId, business.splitReplies ? splitReply(reply) : [reply], "ai");
  return { status: "replied", text: reply, parts, handoff };
}

async function insertReply(business: Business, conversationId: string, texts: string[], source: string) {
  const [conv] = await db.select({ channel: conversations.channel }).from(conversations).where(eq(conversations.id, conversationId));
  const rows = await db
    .insert(messages)
    .values(
      texts.map((content, i) => ({
        businessId: business.id,
        conversationId,
        role: "assistant" as const,
        content,
        source,
        deliveryStatus: conv?.channel === "whatsapp" ? "pending" : null,
        // Garante a ordem de exibição das partes.
        createdAt: new Date(Date.now() + i),
      })),
    )
    .returning({ id: messages.id, text: messages.content });
  return rows;
}

async function usageBlock(business: Business, conversationId: string, now: Date): Promise<string | null> {
  if (business.aiMonthlyBudgetCents > 0) {
    const spent = await monthSpendMicroUsd(business.id, now);
    if (spent >= business.aiMonthlyBudgetCents * 10_000) return "o teto mensal de custo com IA deste negócio foi atingido.";
  }
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, "assistant"),
        gte(messages.createdAt, new Date(now.getTime() - 86_400_000)),
      ),
    );
  if ((r?.n ?? 0) >= MAX_REPLIES_PER_CONVERSATION_DAY)
    return `a conversa passou de ${MAX_REPLIES_PER_CONVERSATION_DAY} respostas automáticas em 24 horas.`;
  return null;
}

async function recordUsage(businessId: string, conversationId: string, response: Anthropic.Beta.BetaMessage, requested: string) {
  const usage = usageOf(response);
  const model = response.model || requested;
  await db.insert(aiUsage).values({
    businessId,
    conversationId,
    model,
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    costMicroUsd: costMicroUsd(model, usage),
  });
}

function describeError(err: unknown): string {
  if (err instanceof AuthenticationError) return "chave da Anthropic inválida.";
  if (err instanceof RateLimitError) return "limite de uso da Anthropic atingido. Tente de novo em instantes.";
  if (err instanceof APIError) return `erro da API da Anthropic (${err.status ?? "sem status"}).`;
  return `falha inesperada (${(err as Error)?.message ?? "erro desconhecido"}).`;
}
