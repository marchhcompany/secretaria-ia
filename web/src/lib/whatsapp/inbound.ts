import { and, desc, eq, gte } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { businesses, conversations, customers, messages, whatsappInbound, type Business } from "@/db/schema";
import { handleCustomerMessage } from "@/lib/assistant/engine";
import {
  describeKind,
  markReadAndTyping,
  messageText,
  sendText,
  type InboundMessage,
  type WebhookPayload,
} from "./client";

// Depois de 24 horas sem mensagens, uma nova mensagem do cliente abre uma conversa nova.
// Mantém o histórico enviado à IA curto (e barato) e coincide com a janela de 24 horas do WhatsApp.
const CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function processWebhook(payload: WebhookPayload) {
  if (payload.object !== "whatsapp_business_account") return;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const message of change.value?.messages ?? []) {
        try {
          await processMessage(phoneNumberId, message);
        } catch (err) {
          console.error("[whatsapp] erro ao processar mensagem", message.id, err);
        }
      }
    }
  }
}

async function processMessage(phoneNumberId: string, message: InboundMessage) {
  const [business] = await db.select().from(businesses).where(eq(businesses.whatsappPhoneNumberId, phoneNumberId));
  if (!business) {
    console.warn(`[whatsapp] número ${phoneNumberId} não está ligado a nenhum negócio`);
    return;
  }
  if (!message.id || !message.from) return;

  const fresh = await db
    .insert(whatsappInbound)
    .values({ id: message.id, businessId: business.id })
    .onConflictDoNothing()
    .returning({ id: whatsappInbound.id });
  if (!fresh.length) return; // a Meta reenviou uma mensagem que já tratamos

  const phone = message.from.replace(/\D/g, "");
  const [customer] = await db
    .insert(customers)
    .values({ businessId: business.id, phone })
    .onConflictDoUpdate({ target: [customers.businessId, customers.phone], set: { phone } })
    .returning();

  const conversationId = await currentConversation(business.id, customer.id);

  // Uma mensagem por vez em cada conversa: quem manda várias mensagens seguidas
  // recebe as respostas em ordem, e o histórico da IA não se perde.
  await withConversationLock(conversationId, async () => {
    const text = messageText(message);
    if (text === null) return replyToNonText(business, conversationId, phone, message.type);

    void markReadAndTyping(phoneNumberId, message.id);
    const outcome = await handleCustomerMessage(conversationId, text);

    if (outcome.status === "replied") {
      const sent = await sendText(phoneNumberId, phone, outcome.text);
      if (!sent.ok) await flag(business.id, conversationId, `A resposta da assistente não foi enviada pelo WhatsApp. ${sent.reason}`);
    } else if (outcome.status === "not_configured") {
      await flag(business.id, conversationId, "A assistente não respondeu: falta a chave da Anthropic.");
    } else if (outcome.status === "error") {
      await flag(business.id, conversationId, `A assistente não conseguiu responder: ${outcome.message}`);
    }
  });
}

async function currentConversation(businessId: string, customerId: string): Promise<string> {
  const [recent] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
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

async function replyToNonText(business: Business, conversationId: string, phone: string, type: string) {
  const kind = describeKind(type);
  await db.insert(messages).values({ businessId: business.id, conversationId, role: "customer", content: `[Cliente enviou ${kind}]` });
  const [conv] = await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning({ mode: conversations.mode });
  if (conv?.mode === "human") {
    await db.update(conversations).set({ needsAttention: true }).where(eq(conversations.id, conversationId));
    return;
  }
  const reply = "Por enquanto eu só consigo ler mensagens de texto 🙂 Pode me escrever o que precisa?";
  const sent = await sendText(business.whatsappPhoneNumberId!, phone, reply);
  if (sent.ok) await db.insert(messages).values({ businessId: business.id, conversationId, role: "assistant", content: reply });
  else await flag(business.id, conversationId, `A resposta não foi enviada pelo WhatsApp. ${sent.reason}`);
}

/** Registra um aviso no painel e marca a conversa para a equipe olhar. */
async function flag(businessId: string, conversationId: string, content: string) {
  await db.insert(messages).values({ businessId, conversationId, role: "system", content });
  await db.update(conversations).set({ needsAttention: true }).where(eq(conversations.id, conversationId));
}

// Conexões só para as travas. Ficam separadas das do `db` para que várias conversas
// esperando a vez não ocupem as conexões que a assistente usa para responder.
const globalForLocks = globalThis as unknown as { lockPool?: Pool };
const lockPool = globalForLocks.lockPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForLocks.lockPool = lockPool;

/**
 * Trava por conversa no próprio Postgres. Usa a trava de transação (pg_advisory_xact_lock)
 * porque o pooler do Neon pode trocar a conexão entre comandos fora de uma transação.
 */
async function withConversationLock(conversationId: string, fn: () => Promise<void>) {
  const client = await lockPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [conversationId]);
    try {
      await fn();
    } finally {
      await client.query("COMMIT");
    }
  } finally {
    client.release();
  }
}
