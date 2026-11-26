import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  automationRules,
  businesses,
  conversations,
  customers,
  messages,
  scheduledMessages,
  type AutomationKind,
  type AutomationRule,
  type Business,
  type Customer,
} from "@/db/schema";
import { formatLong } from "@/lib/time";
import { insideServiceWindow, sendTemplate, sendText, type SendResult } from "@/lib/whatsapp/client";

// Follow-up, lembretes e reativação.
// Segurança: enquanto business.automationsLive = false, nada é enviado (status "dry_run").
// Ninguém que pediu descadastro recebe mensagem. Fora da janela de 24 horas só sai template aprovado.

export const AUTOMATION_LABELS: Record<AutomationKind, string> = {
  follow_up: "Follow-up de interessados",
  appointment_reminder: "Lembrete de compromisso",
  reactivation: "Reativação de clientes",
};

export const DEFAULT_RULES: Record<AutomationKind, { delay: number; message: string }> = {
  follow_up: { delay: 20, message: "Oi{, nome}! Passando para saber se ficou alguma dúvida. Posso te ajudar com mais alguma coisa?" },
  appointment_reminder: { delay: 24, message: "Oi{, nome}! Lembrando do seu horário: {quando}. Até lá!" },
  reactivation: { delay: 60, message: "" },
};

export async function getRules(businessId: string): Promise<Record<AutomationKind, AutomationRule | null>> {
  const rows = await db.select().from(automationRules).where(eq(automationRules.businessId, businessId));
  return {
    follow_up: rows.find((r) => r.kind === "follow_up") ?? null,
    appointment_reminder: rows.find((r) => r.kind === "appointment_reminder") ?? null,
    reactivation: rows.find((r) => r.kind === "reactivation") ?? null,
  };
}

/** Preenche {nome} e {quando}. "{, nome}" vira ", Ana" ou some quando não há nome. */
export function render(text: string, vars: { nome?: string; quando?: string }): string {
  const first = (vars.nome ?? "").trim().split(/\s+/)[0] ?? "";
  return text
    .replace(/\{, nome\}/g, first ? `, ${first}` : "")
    .replace(/\{nome\}/g, first)
    .replace(/\{quando\}/g, vars.quando ?? "");
}

/** Cancela automações pendentes que dependem de o cliente não ter respondido. */
export async function cancelOnCustomerReply(customerId: string) {
  await db
    .update(scheduledMessages)
    .set({ status: "canceled", result: "Cliente respondeu antes do envio.", processedAt: new Date() })
    .where(
      and(
        eq(scheduledMessages.customerId, customerId),
        eq(scheduledMessages.status, "pending"),
        eq(scheduledMessages.cancelOnReply, true),
      ),
    );
}

export async function cancelAllForCustomer(customerId: string, reason: string) {
  await db
    .update(scheduledMessages)
    .set({ status: "canceled", result: reason, processedAt: new Date() })
    .where(and(eq(scheduledMessages.customerId, customerId), eq(scheduledMessages.status, "pending")));
}

/** Depois de cada resposta da assistente: agenda (ou reagenda) o follow-up. */
export async function scheduleFollowUp(business: Business, customer: Customer, conversationId: string) {
  if (customer.optedOut) return;
  const { follow_up: rule } = await getRules(business.id);
  if (!rule?.enabled) return;
  await db
    .update(scheduledMessages)
    .set({ status: "canceled", result: "Substituído por um follow-up mais recente.", processedAt: new Date() })
    .where(
      and(
        eq(scheduledMessages.customerId, customer.id),
        eq(scheduledMessages.kind, "follow_up"),
        eq(scheduledMessages.status, "pending"),
      ),
    );
  await db.insert(scheduledMessages).values({
    businessId: business.id,
    customerId: customer.id,
    conversationId,
    kind: "follow_up",
    runAt: new Date(Date.now() + rule.delay * 3_600_000),
    text: render(rule.message || DEFAULT_RULES.follow_up.message, { nome: customer.name }),
    templateName: rule.templateName,
    templateLanguage: rule.templateLanguage,
    templateParams: customer.name ? [customer.name.split(" ")[0]] : [],
    cancelOnReply: true,
  });
}

export async function scheduleAppointmentReminder(business: Business, customer: Customer, appointmentId: string, startsAt: Date) {
  if (customer.optedOut) return;
  const { appointment_reminder: rule } = await getRules(business.id);
  if (!rule?.enabled) return;
  const runAt = new Date(startsAt.getTime() - rule.delay * 3_600_000);
  if (runAt.getTime() <= Date.now()) return;
  const quando = formatLong(startsAt, business.timezone);
  await db.insert(scheduledMessages).values({
    businessId: business.id,
    customerId: customer.id,
    appointmentId,
    kind: "appointment_reminder",
    runAt,
    text: render(rule.message || DEFAULT_RULES.appointment_reminder.message, { nome: customer.name, quando }),
    templateName: rule.templateName,
    templateLanguage: rule.templateLanguage,
    templateParams: [customer.name.split(" ")[0] || "", quando],
    cancelOnReply: false,
  });
}

export async function cancelAppointmentReminders(appointmentId: string) {
  await db
    .update(scheduledMessages)
    .set({ status: "canceled", result: "Agendamento cancelado.", processedAt: new Date() })
    .where(and(eq(scheduledMessages.appointmentId, appointmentId), eq(scheduledMessages.status, "pending")));
}

/**
 * Prepara uma campanha de reativação: clientes sem contato há `days` dias, com consentimento de marketing
 * e sem descadastro. Só cria a fila; o envio respeita a trava automationsLive.
 */
export async function queueReactivation(business: Business, days: number): Promise<{ queued: number; reason?: string }> {
  const { reactivation: rule } = await getRules(business.id);
  if (!rule?.templateName)
    return { queued: 0, reason: "Reativação exige um template de marketing aprovado pela Meta. Cadastre o nome do template na regra." };
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const targets = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.businessId, business.id),
        eq(customers.optedOut, false),
        eq(customers.marketingConsent, true),
        isNotNull(customers.lastInboundAt),
        lte(customers.lastInboundAt, cutoff),
        sql`${customers.phone} ~ '^[0-9]{10,15}$'`,
        sql`not exists (select 1 from ${scheduledMessages} s where s.customer_id = ${customers.id} and s.kind = 'reactivation' and s.status = 'pending')`,
      ),
    );
  if (!targets.length) return { queued: 0, reason: "Nenhum cliente elegível (sem contato no período, com consentimento e sem descadastro)." };
  await db.insert(scheduledMessages).values(
    targets.map((c) => ({
      businessId: business.id,
      customerId: c.id,
      kind: "reactivation" as const,
      runAt: new Date(),
      templateName: rule.templateName,
      templateLanguage: rule.templateLanguage,
      templateParams: c.name ? [c.name.split(" ")[0]] : [],
      cancelOnReply: true,
    })),
  );
  return { queued: targets.length };
}

type Outcome = { status: "sent" | "dry_run" | "canceled" | "skipped" | "failed"; result: string };

/** Processa as automações vencidas. Chamado pelo cron (/api/cron/automations). */
export async function processDueAutomations(now = new Date(), limit = 50, businessId?: string) {
  const onlyBusiness = businessId ? sql`and business_id = ${businessId}` : sql``;
  // Reserva os itens (processed_at) para que duas execuções simultâneas não peguem o mesmo.
  const claimed = await db.execute<{ id: string }>(sql`
    update scheduled_messages set processed_at = now()
    where id in (
      select id from scheduled_messages
      where status = 'pending' and processed_at is null and run_at <= ${now.toISOString()} ${onlyBusiness}
      order by run_at limit ${limit}
      for update skip locked
    ) returning id`);
  const ids = claimed.rows.map((r) => r.id);
  const results: { id: string; outcome: Outcome }[] = [];
  for (const id of ids) {
    let outcome: Outcome;
    try {
      outcome = await processOne(id, now);
    } catch (err) {
      outcome = { status: "failed", result: `Erro interno: ${(err as Error).message}` };
    }
    await db.update(scheduledMessages).set({ status: outcome.status, result: outcome.result }).where(eq(scheduledMessages.id, id));
    results.push({ id, outcome });
  }
  return results;
}

async function processOne(id: string, now: Date): Promise<Outcome> {
  const [item] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id));
  const [business] = await db.select().from(businesses).where(eq(businesses.id, item.businessId));
  const [customer] = await db.select().from(customers).where(eq(customers.id, item.customerId));
  if (!business || !customer) return { status: "canceled", result: "Negócio ou cliente removido." };

  if (customer.optedOut) return { status: "skipped", result: "Cliente pediu para não receber mensagens." };
  if (item.kind === "reactivation" && !customer.marketingConsent)
    return { status: "skipped", result: "Cliente sem consentimento para mensagens de marketing." };
  if (item.cancelOnReply && customer.lastInboundAt && customer.lastInboundAt > item.createdAt)
    return { status: "canceled", result: "Cliente respondeu antes do envio." };
  if (item.appointmentId) {
    const [appt] = await db.select({ status: appointments.status }).from(appointments).where(eq(appointments.id, item.appointmentId));
    if (!appt || !["scheduled", "confirmed"].includes(appt.status)) return { status: "canceled", result: "Agendamento não está mais ativo." };
  }
  if (item.conversationId) {
    const [conv] = await db.select({ mode: conversations.mode }).from(conversations).where(eq(conversations.id, item.conversationId));
    if (item.kind === "follow_up" && conv?.mode === "human")
      return { status: "skipped", result: "A equipe está atendendo esta conversa." };
  }
  if (!/^\d{10,15}$/.test(customer.phone)) return { status: "skipped", result: "Contato sem número de WhatsApp (ex.: simulador)." };
  if (!business.whatsappPhoneNumberId) return { status: "skipped", result: "WhatsApp do negócio não conectado." };

  const inWindow = insideServiceWindow(customer.lastInboundAt, now);
  const useTemplate = !inWindow || !item.text;
  if (useTemplate && !item.templateName)
    return {
      status: "skipped",
      result: inWindow
        ? "Sem texto nem template configurado."
        : "Fora da janela de 24 horas: o WhatsApp exige um template aprovado e nenhum foi configurado.",
    };

  const preview = useTemplate
    ? `template "${item.templateName}" (${item.templateLanguage}) com parâmetros [${item.templateParams.join(", ")}]`
    : `texto: "${item.text}"`;
  if (!business.automationsLive) return { status: "dry_run", result: `Simulação: enviaria ${preview}.` };

  const sender = { phoneNumberId: business.whatsappPhoneNumberId, accessTokenEnc: business.whatsappAccessTokenEnc };
  const sent: SendResult = useTemplate
    ? await sendTemplate(sender, customer.phone, {
        name: item.templateName,
        language: item.templateLanguage,
        bodyParams: item.templateParams.filter(Boolean),
      })
    : await sendText(sender, customer.phone, item.text);
  if (!sent.ok) return { status: "failed", result: sent.reason };

  const conversationId = item.conversationId ?? (await latestConversation(business.id, customer.id));
  if (conversationId) {
    await db.insert(messages).values({
      businessId: business.id,
      conversationId,
      role: "assistant",
      content: useTemplate ? `[Template ${item.templateName}] ${item.text}`.trim() : item.text,
      waMessageId: sent.messageId,
      deliveryStatus: "sent",
      source: `automation:${item.kind}`,
    });
  }
  return { status: "sent", result: `Enviado: ${preview}.` };
}

async function latestConversation(businessId: string, customerId: string) {
  const [c] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.businessId, businessId), eq(conversations.customerId, customerId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return c?.id ?? null;
}

export async function pendingCount(businessId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.businessId, businessId), eq(scheduledMessages.status, "pending")));
  return r?.n ?? 0;
}
