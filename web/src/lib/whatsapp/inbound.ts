import { and, desc, eq, gte } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { businesses, conversations, customers, messages, whatsappInbound, type Business } from "@/db/schema";
import { HOLDING_TEXT, addCustomerMessage, runAssistant, type AssistantOutcome } from "@/lib/assistant/engine";
import { cancelOnCustomerReply, scheduleFollowUp } from "@/lib/automations";
import { notifyTeam } from "@/lib/notify";
import {
  describeKind,
  markReadAndTyping,
  messageText,
  sendText,
  type InboundMessage,
  type MessageEcho,
  type Sender,
  type StatusUpdate,
  type WebhookPayload,
} from "./client";

// Depois de 24 horas sem mensagens, uma nova mensagem do cliente abre uma conversa nova.
// Mantém o histórico enviado à IA curto (e barato) e coincide com a janela de 24 horas do WhatsApp.
const CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;
// Espera antes de responder: quem manda várias mensagens seguidas recebe uma resposta só.
const DEBOUNCE_MS = Number(process.env.WHATSAPP_DEBOUNCE_MS ?? 4000);
// Aviso "recebi sua mensagem" quando a IA falha: no máximo um a cada 2 horas por conversa.
const HOLDING_INTERVAL_MS = 2 * 60 * 60 * 1000;

const senderOf = (b: Business): Sender => ({ phoneNumberId: b.whatsappPhoneNumberId!, accessTokenEnc: b.whatsappAccessTokenEnc });

export async function processWebhook(payload: WebhookPayload) {
  if (payload.object !== "whatsapp_business_account") return;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      if (change.field === "smb_message_echoes") {
        for (const echo of change.value?.message_echoes ?? []) {
          await processEcho(phoneNumberId, echo).catch((err) => console.error("[whatsapp] echo", echo.id, err));
        }
        continue;
      }
      if (change.field !== "messages") continue;
      const profileName = change.value?.contacts?.[0]?.profile?.name ?? "";
      for (const status of change.value?.statuses ?? []) {
        await processStatus(phoneNumberId, status).catch((err) => console.error("[whatsapp] status", status.id, err));
      }
      for (const message of change.value?.messages ?? []) {
        try {
          await processMessage(phoneNumberId, message, profileName);
        } catch (err) {
          console.error("[whatsapp] erro ao processar mensagem", message.id, err);
        }
      }
    }
  }
}

async function businessByPhone(phoneNumberId: string) {
  const [business] = await db.select().from(businesses).where(eq(businesses.whatsappPhoneNumberId, phoneNumberId));
  return business ?? null;
}

/** Confirmações de entrega/leitura/falha das mensagens que enviamos. */
async function processStatus(phoneNumberId: string, status: StatusUpdate) {
  const business = await businessByPhone(phoneNumberId);
  if (!business || !status.id) return;
  const [msg] = await db
    .update(messages)
    .set({ deliveryStatus: status.status })
    .where(and(eq(messages.waMessageId, status.id), eq(messages.businessId, business.id)))
    .returning({ conversationId: messages.conversationId });
  if (msg && status.status === "failed") {
    const reason = status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? "motivo não informado";
    await flag(business, msg.conversationId, `Uma mensagem não foi entregue pelo WhatsApp: ${reason}`);
  }
}

/**
 * Coexistência: alguém da equipe respondeu pelo app do celular. Registra no histórico como "Equipe"
 * e pausa a IA nesta conversa, para ela nunca responder junto com a pessoa.
 */
async function processEcho(phoneNumberId: string, echo: MessageEcho) {
  const business = await businessByPhone(phoneNumberId);
  if (!business || !echo.id || !echo.to) return;
  const fresh = await db
    .insert(whatsappInbound)
    .values({ id: echo.id, businessId: business.id })
    .onConflictDoNothing()
    .returning({ id: whatsappInbound.id });
  if (!fresh.length) return;
  // Mensagens que a própria API enviou (IA/painel) já estão registradas.
  const [known] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.waMessageId, echo.id), eq(messages.businessId, business.id)));
  if (known) return;
  const phone = echo.to.replace(/\D/g, "");
  const [customer] = await db
    .insert(customers)
    .values({ businessId: business.id, phone })
    .onConflictDoUpdate({ target: [customers.businessId, customers.phone], set: { phone } })
    .returning();
  const conversationId = await currentConversation(business.id, customer.id);
  const at = echo.timestamp ? new Date(Number(echo.timestamp) * 1000) : new Date();
  await db.insert(messages).values({
    businessId: business.id,
    conversationId,
    role: "staff",
    content: echo.text?.body?.trim() || `[A equipe enviou ${describeKind(echo.type ?? "")} pelo celular]`,
    source: "whatsapp_app",
    deliveryStatus: "sent",
    waMessageId: echo.id,
    createdAt: at,
  });
  const [conv] = await db.select({ mode: conversations.mode }).from(conversations).where(eq(conversations.id, conversationId));
  await db.update(conversations).set({ mode: "human", needsAttention: false, lastMessageAt: at }).where(eq(conversations.id, conversationId));
  if (conv?.mode !== "human")
    await db.insert(messages).values({
      businessId: business.id,
      conversationId,
      role: "system",
      content: "A equipe respondeu pelo celular. A IA foi pausada nesta conversa.",
      createdAt: new Date(at.getTime() + 1),
    });
}

async function processMessage(phoneNumberId: string, message: InboundMessage, profileName: string) {
  const business = await businessByPhone(phoneNumberId);
  if (!business) {
    console.warn(`[whatsapp] número ${phoneNumberId} não está ligado a nenhum negócio`);
    return;
  }
  if (!message.id || !message.from) return;

  // Deduplicação: a Meta reenvia o mesmo evento se demorarmos; o wamid garante uma vez só.
  const fresh = await db
    .insert(whatsappInbound)
    .values({ id: message.id, businessId: business.id })
    .onConflictDoNothing()
    .returning({ id: whatsappInbound.id });
  if (!fresh.length) return;

  const phone = message.from.replace(/\D/g, "");
  const receivedAt = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
  const [customer] = await db
    .insert(customers)
    .values({ businessId: business.id, phone, name: profileName })
    .onConflictDoUpdate({ target: [customers.businessId, customers.phone], set: { phone } })
    .returning();
  if (!customer.name && profileName) await db.update(customers).set({ name: profileName }).where(eq(customers.id, customer.id));

  const conversationId = await currentConversation(business.id, customer.id);
  await cancelOnCustomerReply(customer.id);

  const text = messageText(message);
  if (text === null) {
    await handleNonText(business, conversationId, phone, message.type, receivedAt);
    return;
  }
  await addCustomerMessage(conversationId, text, receivedAt);
  void markReadAndTyping(senderOf(business), message.id);

  if (DEBOUNCE_MS > 0) await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
  await respond(business, conversationId, phone);
}

/** Roda a assistente (uma por vez por conversa) e entrega a resposta pelo WhatsApp. */
export async function respond(business: Business, conversationId: string, phone: string): Promise<AssistantOutcome> {
  return withConversationLock(conversationId, async () => {
    const attentionBefore = await needsAttention(conversationId);
    const outcome = await runAssistant(conversationId);
    if (outcome.status === "replied") {
      await deliver(business, conversationId, phone, outcome.parts, outcome.handoff);
      if (!outcome.handoff) {
        const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
        const [customer] = await db.select().from(customers).where(eq(customers.id, conv.customerId));
        await scheduleFollowUp(business, customer, conversationId);
      }
    } else if (outcome.status === "error" || outcome.status === "not_configured" || outcome.status === "blocked") {
      await sendHolding(business, conversationId, phone);
    }
    // Um e-mail só quando a conversa passa a precisar da equipe (não a cada mensagem).
    if (!attentionBefore && (await needsAttention(conversationId))) {
      const [conv] = await db.select({ reason: conversations.handoffReason }).from(conversations).where(eq(conversations.id, conversationId));
      const why =
        outcome.status === "not_configured"
          ? "A assistente não respondeu: falta a chave do provedor de IA."
          : outcome.status === "error" || outcome.status === "blocked"
            ? `A assistente não respondeu: ${outcome.message}`
            : outcome.status === "human" || outcome.status === "disabled"
              ? "Nova mensagem do cliente em uma conversa com a equipe."
              : conv?.reason || "A conversa precisa da equipe.";
      await notifyTeam(business, conversationId, why);
    }
    return outcome;
  });
}

async function needsAttention(conversationId: string) {
  const [c] = await db.select({ v: conversations.needsAttention }).from(conversations).where(eq(conversations.id, conversationId));
  return !!c?.v;
}

/**
 * Envia as partes da resposta. Se a equipe assumiu a conversa enquanto a IA pensava,
 * a resposta é descartada: a IA nunca fala junto com um atendente.
 */
async function deliver(
  business: Business,
  conversationId: string,
  phone: string,
  parts: { id: string; text: string }[],
  handoffThisTurn: boolean,
) {
  for (const part of parts) {
    const [stillAssistant] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.mode, "assistant")));
    const [msg] = await db.select({ source: messages.source }).from(messages).where(eq(messages.id, part.id));
    // Exceções: a confirmação de descadastro e o aviso "chamei a equipe" da própria IA, que pausou a conversa nesta volta.
    if (!stillAssistant && msg?.source !== "opt_out" && !handoffThisTurn) {
      await db.update(messages).set({ deliveryStatus: "discarded" }).where(eq(messages.id, part.id));
      continue;
    }
    const sent = await sendText(senderOf(business), phone, part.text);
    await db
      .update(messages)
      .set(sent.ok ? { deliveryStatus: "sent", waMessageId: sent.messageId } : { deliveryStatus: "failed" })
      .where(eq(messages.id, part.id));
    if (!sent.ok) {
      await flag(business, conversationId, `A resposta da assistente não foi enviada pelo WhatsApp. ${sent.reason}`);
      break;
    }
  }
}

async function sendHolding(business: Business, conversationId: string, phone: string) {
  const [recent] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.source, "holding"),
        gte(messages.createdAt, new Date(Date.now() - HOLDING_INTERVAL_MS)),
      ),
    )
    .limit(1);
  if (recent) return;
  const sent = await sendText(senderOf(business), phone, HOLDING_TEXT);
  await db.insert(messages).values({
    businessId: business.id,
    conversationId,
    role: "assistant",
    content: HOLDING_TEXT,
    source: "holding",
    deliveryStatus: sent.ok ? "sent" : "failed",
    waMessageId: sent.ok ? sent.messageId : null,
  });
}

async function currentConversation(businessId: string, customerId: string): Promise<string> {
  const [recent] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.customerId, customerId),
        eq(conversations.channel, "whatsapp"),
        gte(conversations.lastMessageAt, new Date(Date.now() - CONVERSATION_WINDOW_MS)),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  if (recent) return recent.id;
  const [created] = await db
    .insert(conversations)
    .values({ businessId, customerId, channel: "whatsapp" })
    .returning({ id: conversations.id });
  return created.id;
}

/** Áudio, foto, figurinha...: a assistente ainda não interpreta; pede texto ou deixa para a equipe. */
async function handleNonText(business: Business, conversationId: string, phone: string, type: string, at: Date) {
  const kind = describeKind(type);
  await db.insert(messages).values({ businessId: business.id, conversationId, role: "customer", content: `[Cliente enviou ${kind}]`, createdAt: at });
  const [conv] = await db
    .update(conversations)
    .set({ lastMessageAt: at })
    .where(eq(conversations.id, conversationId))
    .returning({ mode: conversations.mode, customerId: conversations.customerId });
  await db.update(customers).set({ lastInboundAt: at }).where(eq(customers.id, conv.customerId));
  if (conv.mode === "human" || !business.aiEnabled) {
    await db.update(conversations).set({ needsAttention: true }).where(eq(conversations.id, conversationId));
    return;
  }
  const reply =
    type === "audio"
      ? "Ainda não consigo ouvir áudios por aqui 🙂 Pode me escrever em texto o que precisa?"
      : "Por enquanto eu só consigo ler mensagens de texto 🙂 Pode me escrever o que precisa?";
  const sent = await sendText(senderOf(business), phone, reply);
  await db.insert(messages).values({
    businessId: business.id,
    conversationId,
    role: "assistant",
    content: reply,
    source: "non_text",
    deliveryStatus: sent.ok ? "sent" : "failed",
    waMessageId: sent.ok ? sent.messageId : null,
  });
  if (!sent.ok) await flag(business, conversationId, `A resposta não foi enviada pelo WhatsApp. ${sent.reason}`);
}

/** Registra um aviso no painel e marca a conversa para a equipe olhar. */
async function flag(business: Business, conversationId: string, content: string) {
  await db.insert(messages).values({ businessId: business.id, conversationId, role: "system", content });
  await db.update(conversations).set({ needsAttention: true }).where(eq(conversations.id, conversationId));
}

// Conexões só para as travas. Ficam separadas das do `db` para que várias conversas
// esperando a vez não ocupem as conexões que a assistente usa para responder.
const globalForLocks = globalThis as unknown as { lockPool?: Pool };
const lockPool = globalForLocks.lockPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForLocks.lockPool = lockPool;

/**
 * Trava por conversa no próprio Postgres. Usa a trava de transação (pg_advisory_xact_lock)
 * porque poolers em modo transação (Neon, Supabase) podem trocar a conexão fora de uma transação.
 */
export async function withConversationLock<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  const client = await lockPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [conversationId]);
    try {
      return await fn();
    } finally {
      await client.query("COMMIT");
    }
  } finally {
    client.release();
  }
}

export async function closeLockPool() {
  await lockPool.end();
}
