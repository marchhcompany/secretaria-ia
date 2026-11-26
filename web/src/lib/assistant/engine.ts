import { APIError, AuthenticationError, RateLimitError } from "@anthropic-ai/sdk";
import OpenAI from "openai";
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
import { costMicroUsd, modelSpecFor, providerFor, type HistoryItem, type StepResult, type ToolResult } from "@/lib/ai";
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
  /^\s*(parar|pare|sair|stop|descadastrar)\s*[.!]*\s*$/i,
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
export async function runAssistant(conversationId: string, opts: { modelSpec?: string } = {}): Promise<AssistantOutcome> {
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
  const { provider, model, spec } = providerFor(opts.modelSpec || modelSpecFor(business));

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

  // Histórico no formato do provedor atual. Se o negócio trocou de provedor, reconstrói a partir das mensagens.
  const transcript: unknown[] =
    conversation.transcriptProvider === provider.kind
      ? (conversation.transcript as unknown[])
      : provider.rebuild(await historyOf(conversationId, pending.map((m) => m.id)));
  const baseLength = transcript.length;
  const known = customer.name ? ` Cliente: ${customer.name}.` : " Cliente ainda sem nome cadastrado.";
  const userTexts: string[] = [];
  if (staffSince.length)
    userTexts.push(`[A equipe escreveu para o cliente enquanto você estava pausada:\n${staffSince.map((s) => `- ${s.content}`).join("\n")}]`);
  userTexts.push(
    `[Recebida em ${formatLong(pending.at(-1)!.createdAt, business.timezone)}.${known}${
      pending.length > 1 ? ` O cliente mandou ${pending.length} mensagens seguidas; responda todas juntas.` : ""
    }]`,
  );
  for (const m of pending) userTexts.push(m.content);
  provider.addUser(transcript, userTexts);

  // Sem chave do provedor: guarda a mensagem no histórico (a próxima resposta a considera) e avisa a equipe.
  const saveUserTurnOnly = async () => {
    transcript.length = baseLength;
    provider.addUser(transcript, userTexts);
    await db
      .update(conversations)
      .set({ transcript, transcriptProvider: provider.kind, aiContextUntil: now, needsAttention: true })
      .where(eq(conversations.id, conversationId));
    await markHandled();
  };
  if (!provider.configured()) {
    await saveUserTurnOnly();
    await db.insert(messages).values({
      businessId,
      conversationId,
      role: "system",
      content: `A assistente não respondeu: falta a chave do provedor de IA (${provider.kind}).`,
    });
    return { status: "not_configured" };
  }

  const ctx = { business, services: serviceRows, staff: staffRows, hours: hourRows, faqs: faqRows };
  const directBooking = canBookDirectly(ctx);
  const system = buildSystemPrompt(ctx);
  const tools = toolsFor(directBooking, business.bookingMode);

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

  let reply = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const r: StepResult = await provider.step({ model, system, tools, transcript });
      await recordUsage(businessId, conversationId, spec, r);

      if (r.refused) {
        reply = "Vou pedir para alguém da equipe te responder, tudo bem? Já já falam com você.";
        await runTool("chamar_atendente", { motivo: "A assistente não conseguiu responder a esta mensagem." }, toolCtx);
        break;
      }
      if (r.pause) continue;
      if (!r.toolCalls.length) {
        reply = r.text;
        break;
      }
      const results: ToolResult[] = [];
      for (const call of r.toolCalls) {
        const out = await runTool(call.name, call.input, toolCtx);
        results.push({ id: call.id, content: out.content, isError: out.isError });
      }
      provider.addToolResults(transcript, results);
    }
  } catch (err) {
    // Falha da IA: guarda só a mensagem do cliente no histórico (sem a volta incompleta),
    // para a próxima resposta já levar em conta o que ele escreveu.
    await saveUserTurnOnly();
    const message = describeError(err);
    await db.insert(messages).values({ businessId, conversationId, role: "system", content: `A assistente não respondeu: ${message}` });
    return { status: "error", message };
  }

  if (!reply) reply = "Desculpe, não consegui responder agora. Pode repetir, por favor?";

  await db
    .update(conversations)
    .set({
      transcript,
      transcriptProvider: provider.kind,
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

async function recordUsage(businessId: string, conversationId: string, spec: string, r: StepResult) {
  // Em fallback, o modelo que respondeu pode ser outro: cobra pelo que respondeu.
  const served = r.servedModel.includes(":") ? r.servedModel : `${spec.split(":")[0]}:${r.servedModel}`;
  await db.insert(aiUsage).values({
    businessId,
    conversationId,
    model: served,
    inputTokens: r.usage.input,
    outputTokens: r.usage.output,
    cacheReadTokens: r.usage.cacheRead,
    cacheWriteTokens: r.usage.cacheWrite,
    costMicroUsd: costMicroUsd(served, r.usage),
  });
}

/** Histórico em texto (para trocar de provedor no meio de uma conversa). */
async function historyOf(conversationId: string, excludeIds: string[]): Promise<HistoryItem[]> {
  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
  const items: HistoryItem[] = [];
  for (const m of rows) {
    if (excludeIds.includes(m.id) || m.role === "system") continue;
    const role = m.role === "customer" ? "user" : "assistant";
    const text = m.role === "staff" ? `[Equipe] ${m.content}` : m.content;
    const last = items.at(-1);
    if (last?.role === role) last.text += `\n${text}`;
    else items.push({ role, text });
  }
  // A conversa precisa começar pelo cliente.
  while (items[0]?.role === "assistant") items.shift();
  return items;
}

function describeError(err: unknown): string {
  if (err instanceof AuthenticationError || err instanceof OpenAI.AuthenticationError) return "chave do provedor de IA inválida.";
  if (err instanceof RateLimitError || err instanceof OpenAI.RateLimitError) return "limite de uso do provedor de IA atingido. Tente de novo em instantes.";
  if (err instanceof APIError || err instanceof OpenAI.APIError) return `erro da API do provedor de IA (${err.status ?? "sem status"}).`;
  return `falha inesperada (${(err as Error)?.message ?? "erro desconhecido"}).`;
}
