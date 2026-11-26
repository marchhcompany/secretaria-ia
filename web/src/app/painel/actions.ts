"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  APPOINTMENT_STATUS,
  AUTOMATION_KINDS,
  LEAD_STAGES,
  appointments,
  automationRules,
  businessHours,
  businessMembers,
  businesses,
  conversations,
  customers,
  faqs,
  messages,
  services,
  staff,
  user as userTable,
} from "@/db/schema";
import { addCustomerMessage, runAssistant, type AssistantOutcome } from "@/lib/assistant/engine";
import { optOut } from "@/lib/assistant/tools";
import {
  cancelAppointmentReminders,
  processDueAutomations,
  queueReactivation,
  scheduleAppointmentReminder,
} from "@/lib/automations";
import { BUSINESS_COOKIE, requireBusiness } from "@/lib/business";
import { encryptSecret } from "@/lib/crypto";
import { book } from "@/lib/scheduling";
import { insideServiceWindow, sendText } from "@/lib/whatsapp/client";
import { withConversationLock } from "@/lib/whatsapp/inbound";

// Toda ação filtra por business.id: é isso que impede um negócio de mexer nos dados de outro.

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// ---------- Serviços ----------

export async function saveService(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const id = text(form, "id");
  const row = {
    name: text(form, "name"),
    description: text(form, "description"),
    durationMin: Math.min(600, Math.max(5, Number(text(form, "duration_min")) || 60)),
    priceCents: parsePrice(text(form, "price")),
    priceNote: text(form, "price_note"),
    active: form.get("active") === "on",
  };
  if (!row.name) return;
  if (id && isUuid(id))
    await db.update(services).set(row).where(and(eq(services.id, id), eq(services.businessId, business.id)));
  else await db.insert(services).values({ ...row, businessId: business.id });
  revalidatePath("/painel/servicos");
}

export async function deleteService(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const id = text(form, "id");
  if (isUuid(id)) await db.delete(services).where(and(eq(services.id, id), eq(services.businessId, business.id)));
  revalidatePath("/painel/servicos");
}

// ---------- Horários e equipe ----------

export async function saveHours(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const rows: { businessId: string; weekday: number; opens: string; closes: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (form.get(`open_${d}`) !== "on") continue;
    for (const slot of ["a", "b"]) {
      const opens = text(form, `opens_${d}_${slot}`);
      const closes = text(form, `closes_${d}_${slot}`);
      if (/^\d{2}:\d{2}$/.test(opens) && /^\d{2}:\d{2}$/.test(closes) && closes > opens)
        rows.push({ businessId: business.id, weekday: d, opens, closes });
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(businessHours).where(eq(businessHours.businessId, business.id));
    if (rows.length) await tx.insert(businessHours).values(rows);
  });
  revalidatePath("/painel/horarios");
}

export async function addStaff(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const name = text(form, "name");
  if (name) await db.insert(staff).values({ businessId: business.id, name });
  revalidatePath("/painel/horarios");
}

export async function removeStaff(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const id = text(form, "id");
  if (isUuid(id)) await db.delete(staff).where(and(eq(staff.id, id), eq(staff.businessId, business.id)));
  revalidatePath("/painel/horarios");
}

// ---------- Assistente ----------

export async function saveAssistant(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const bookingMode = (["direct", "request", "off"] as const).find((m) => m === text(form, "booking_mode")) ?? business.bookingMode;
  const budget = Math.max(0, Math.round(Number(text(form, "ai_budget_usd").replace(",", ".")) * 100) || 0);
  await db
    .update(businesses)
    .set({
      name: text(form, "name") || business.name,
      assistantName: text(form, "assistant_name") || "Assistente",
      tone: text(form, "tone"),
      about: text(form, "about"),
      instructions: text(form, "instructions"),
      paymentInfo: text(form, "payment_info"),
      conversionGoal: text(form, "conversion_goal"),
      qualificationQuestions: text(form, "qualification_questions"),
      hidePrices: form.get("hide_prices") === "on",
      aiEnabled: form.get("ai_enabled") === "on",
      bookingMode,
      aiModel: text(form, "ai_model"),
      aiMonthlyBudgetCents: budget,
      notifyEmails: text(form, "notify_emails"),
    })
    .where(eq(businesses.id, business.id));
  revalidatePath("/painel", "layout");
}

export async function addFaq(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const question = text(form, "question");
  const answer = text(form, "answer");
  if (question && answer) await db.insert(faqs).values({ businessId: business.id, question, answer });
  revalidatePath("/painel/assistente");
}

export async function removeFaq(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const id = text(form, "id");
  if (isUuid(id)) await db.delete(faqs).where(and(eq(faqs.id, id), eq(faqs.businessId, business.id)));
  revalidatePath("/painel/assistente");
}

// ---------- Agenda ----------

export async function setAppointmentStatus(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form, "id");
  const status = APPOINTMENT_STATUS.find((s) => s === text(form, "status"));
  if (!status || !isUuid(id)) return;
  const updated = await db
    .update(appointments)
    .set({ status })
    .where(and(eq(appointments.id, id), eq(appointments.businessId, business.id)))
    .returning({ id: appointments.id });
  if (updated.length && status === "canceled") await cancelAppointmentReminders(id);
  revalidatePath("/painel", "layout");
}

export type ManualBookingState = { error?: string; ok?: boolean };

export async function createManualAppointment(_: ManualBookingState, form: FormData): Promise<ManualBookingState> {
  const { business } = await requireBusiness();
  const phone = text(form, "phone").replace(/\D/g, "");
  const name = text(form, "name");
  const serviceId = text(form, "service_id");
  const staffId = text(form, "staff_id");
  if (!phone || !name) return { error: "Informe nome e telefone do cliente." };
  if (!isUuid(serviceId)) return { error: "Escolha um serviço." };

  const [customer] = await db
    .insert(customers)
    .values({ businessId: business.id, phone, name })
    .onConflictDoUpdate({ target: [customers.businessId, customers.phone], set: { name } })
    .returning();

  const result = await book(business, {
    customerId: customer.id,
    serviceId,
    date: text(form, "date"),
    time: text(form, "time"),
    staffId: isUuid(staffId) ? staffId : null,
    source: "manual",
  });
  if (!result.ok) return { error: result.reason };
  await scheduleAppointmentReminder(business, customer, result.appointment.id, result.appointment.startsAt);
  revalidatePath("/painel", "layout");
  return { ok: true };
}

// ---------- Conversas ----------

export async function setConversationMode(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form, "id");
  if (!isUuid(id)) return;
  const mode = text(form, "mode") === "human" ? "human" : "assistant";
  const [conv] = await db
    .update(conversations)
    .set({ mode, needsAttention: false, ...(mode === "assistant" ? { handoffReason: "" } : {}) })
    .where(and(eq(conversations.id, id), eq(conversations.businessId, business.id)))
    .returning({ id: conversations.id });
  if (conv)
    await db.insert(messages).values({
      businessId: business.id,
      conversationId: id,
      role: "system",
      content: mode === "human" ? "A equipe assumiu a conversa. A IA está pausada." : "Conversa devolvida para a assistente (IA).",
    });
  revalidatePath("/painel", "layout");
}

export async function markConversationSeen(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form, "id");
  if (!isUuid(id)) return;
  await db
    .update(conversations)
    .set({ needsAttention: false })
    .where(and(eq(conversations.id, id), eq(conversations.businessId, business.id)));
  revalidatePath("/painel", "layout");
}

// Enviar como equipe assume a conversa: a IA fica pausada até alguém devolver para ela.
export async function sendStaffMessage(form: FormData) {
  const { business, user } = await requireBusiness();
  const conversationId = text(form, "id");
  const content = text(form, "content");
  if (!content || !isUuid(conversationId)) return;
  const [conv] = await db
    .update(conversations)
    .set({ mode: "human", needsAttention: false, lastMessageAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, business.id)))
    .returning({ channel: conversations.channel, customerId: conversations.customerId });
  if (!conv) return;
  const [msg] = await db
    .insert(messages)
    .values({ businessId: business.id, conversationId, role: "staff", content, authorUserId: user.id, source: "panel" })
    .returning({ id: messages.id });

  if (conv.channel === "whatsapp") {
    const [customer] = await db.select().from(customers).where(eq(customers.id, conv.customerId));
    const sent = !business.whatsappPhoneNumberId
      ? { ok: false as const, reason: "O WhatsApp deste negócio ainda não está conectado." }
      : !insideServiceWindow(customer.lastInboundAt)
        ? {
            ok: false as const,
            reason:
              "Passaram mais de 24 horas desde a última mensagem do cliente. Fora dessa janela o WhatsApp só permite templates aprovados.",
          }
        : await sendText(
            { phoneNumberId: business.whatsappPhoneNumberId, accessTokenEnc: business.whatsappAccessTokenEnc },
            customer.phone,
            content,
          );
    await db
      .update(messages)
      .set(sent.ok ? { deliveryStatus: "sent", waMessageId: sent.messageId } : { deliveryStatus: "failed" })
      .where(eq(messages.id, msg.id));
    if (!sent.ok)
      await db
        .insert(messages)
        .values({ businessId: business.id, conversationId, role: "system", content: `Mensagem acima não enviada pelo WhatsApp. ${sent.reason}` });
  }
  revalidatePath(`/painel/conversas/${conversationId}`);
}

// ---------- Leads ----------

export async function saveLead(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form, "id");
  if (!isUuid(id)) return;
  const stage = LEAD_STAGES.find((s) => s === text(form, "lead_stage"));
  const wantsOut = form.get("opted_out") === "on";
  const [before] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.businessId, business.id)));
  if (!before) return;
  await db
    .update(customers)
    .set({
      name: text(form, "name") || before.name,
      notes: text(form, "notes"),
      ...(stage ? { leadStage: stage } : {}),
      marketingConsent: !wantsOut && form.get("marketing_consent") === "on",
      ...(!wantsOut && before.optedOut ? { optedOut: false, optedOutAt: null } : {}),
    })
    .where(and(eq(customers.id, id), eq(customers.businessId, business.id)));
  if (wantsOut && !before.optedOut) await optOut(business.id, id);
  revalidatePath("/painel/leads");
}

// ---------- Automações ----------

export async function saveAutomationRule(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const kind = AUTOMATION_KINDS.find((k) => k === text(form, "kind"));
  if (!kind) return;
  const row = {
    enabled: form.get("enabled") === "on",
    delay: Math.min(24 * 90, Math.max(1, Number(text(form, "delay")) || 24)),
    message: text(form, "message"),
    templateName: text(form, "template_name").replace(/[^a-z0-9_]/gi, "").toLowerCase(),
    templateLanguage: text(form, "template_language") || "pt_BR",
  };
  await db
    .insert(automationRules)
    .values({ businessId: business.id, kind, ...row })
    .onConflictDoUpdate({ target: [automationRules.businessId, automationRules.kind], set: row });
  revalidatePath("/painel/automacoes");
}

export async function setAutomationsLive(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const live = text(form, "live") === "on" && text(form, "confirm").toUpperCase() === "ENVIAR DE VERDADE";
  await db.update(businesses).set({ automationsLive: live }).where(eq(businesses.id, business.id));
  revalidatePath("/painel/automacoes");
}

export async function queueReactivationAction(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const days = Math.max(7, Number(text(form, "days")) || 60);
  const r = await queueReactivation(business, days);
  revalidatePath("/painel/automacoes");
  redirect(`/painel/automacoes?reativacao=${encodeURIComponent(r.reason ?? `${r.queued} clientes na fila`)}`);
}

export async function processAutomationsNow() {
  const { business } = await requireBusiness({ owner: true });
  await processDueAutomations(new Date(), 50, business.id);
  revalidatePath("/painel/automacoes");
}

// ---------- Empresas e equipe ----------

export async function switchBusiness(form: FormData) {
  const { memberships } = await requireBusiness();
  const id = text(form, "id");
  if (memberships.some((m) => m.business.id === id))
    (await cookies()).set(BUSINESS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/painel");
}

export async function addMember(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const email = text(form, "email").toLowerCase();
  const role = text(form, "role") === "owner" ? "owner" : "staff";
  const [u] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email));
  if (!u) redirect("/painel/equipe?erro=" + encodeURIComponent("Essa pessoa precisa criar uma conta antes."));
  await db.insert(businessMembers).values({ businessId: business.id, userId: u.id, role }).onConflictDoUpdate({
    target: [businessMembers.businessId, businessMembers.userId],
    set: { role },
  });
  revalidatePath("/painel/equipe");
}

export async function removeMember(form: FormData) {
  const { business, user } = await requireBusiness({ owner: true });
  const userId = text(form, "user_id");
  if (userId === user.id) return; // o dono não se remove por aqui
  await db.delete(businessMembers).where(and(eq(businessMembers.businessId, business.id), eq(businessMembers.userId, userId)));
  revalidatePath("/painel/equipe");
}

export async function saveWhatsapp(form: FormData) {
  const { business } = await requireBusiness({ owner: true });
  const phoneNumberId = text(form, "phone_number_id").replace(/\D/g, "") || null;
  const number = text(form, "whatsapp_number") || null;
  const wabaId = text(form, "waba_id").replace(/\D/g, "") || null;
  const token = text(form, "access_token");
  let tokenEnc: string | null | undefined = undefined; // undefined = mantém o atual
  if (form.get("clear_token") === "on") tokenEnc = null;
  else if (token) {
    try {
      tokenEnc = encryptSecret(token);
    } catch {
      redirect("/painel/assistente?whatsapp=sem-chave");
    }
  }
  try {
    await db
      .update(businesses)
      .set({
        whatsappPhoneNumberId: phoneNumberId,
        whatsappNumber: phoneNumberId ? number : null,
        whatsappWabaId: wabaId,
        ...(tokenEnc !== undefined ? { whatsappAccessTokenEnc: tokenEnc } : {}),
      })
      .where(eq(businesses.id, business.id));
  } catch {
    // Identificação já usada por outro negócio (coluna única): não troca nada.
    redirect("/painel/assistente?whatsapp=em-uso");
  }
  revalidatePath("/painel", "layout");
  redirect("/painel/assistente?whatsapp=salvo");
}

// ---------- Simulador ----------

async function simulatorConversation(reset: boolean) {
  const { business, user } = await requireBusiness();
  const phone = `simulador-${user.id.slice(0, 8)}`;
  const [customer] = await db
    .insert(customers)
    .values({ businessId: business.id, phone })
    .onConflictDoUpdate({ target: [customers.businessId, customers.phone], set: { phone } })
    .returning();

  if (!reset) {
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.customerId, customer.id), eq(conversations.channel, "simulator")))
      .orderBy(desc(conversations.createdAt))
      .limit(1);
    if (existing) return existing.id;
  } else {
    await db.update(customers).set({ name: "" }).where(eq(customers.id, customer.id));
  }

  const [created] = await db
    .insert(conversations)
    .values({ businessId: business.id, customerId: customer.id, channel: "simulator" })
    .returning({ id: conversations.id });
  return created.id;
}

export type SimMessage = { id: string; role: string; content: string; createdAt: string };

export async function loadSimulator(): Promise<{ conversationId: string; messages: SimMessage[] }> {
  const conversationId = await simulatorConversation(false);
  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
  return { conversationId, messages: rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) };
}

export async function resetSimulator(): Promise<{ conversationId: string; messages: SimMessage[] }> {
  return { conversationId: await simulatorConversation(true), messages: [] };
}

export async function sendSimulatorMessage(conversationId: string, content: string): Promise<AssistantOutcome> {
  const { business } = await requireBusiness();
  if (!isUuid(conversationId)) return { status: "error", message: "Conversa inválida." };
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, business.id)));
  if (!conv) return { status: "error", message: "Conversa não encontrada." };
  const text = content.trim().slice(0, 4000);
  if (!text) return { status: "nothing" };
  await addCustomerMessage(conversationId, text);
  const outcome = await withConversationLock(conversationId, () => runAssistant(conversationId));
  revalidatePath("/painel", "layout");
  return outcome;
}
