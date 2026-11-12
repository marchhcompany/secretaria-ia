"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  APPOINTMENT_STATUS,
  appointments,
  businessHours,
  businesses,
  conversations,
  customers,
  faqs,
  messages,
  services,
  staff,
} from "@/db/schema";
import { handleCustomerMessage, type AssistantOutcome } from "@/lib/assistant/engine";
import { requireBusiness } from "@/lib/business";
import { book } from "@/lib/scheduling";
import { sendText } from "@/lib/whatsapp/client";

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
  const { business } = await requireBusiness();
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
  const { business } = await requireBusiness();
  const id = text(form, "id");
  if (isUuid(id)) await db.delete(services).where(and(eq(services.id, id), eq(services.businessId, business.id)));
  revalidatePath("/painel/servicos");
}

// ---------- Horários e equipe ----------

export async function saveHours(form: FormData) {
  const { business } = await requireBusiness();
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
  const { business } = await requireBusiness();
  const name = text(form, "name");
  if (name) await db.insert(staff).values({ businessId: business.id, name });
  revalidatePath("/painel/horarios");
}

export async function removeStaff(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form, "id");
  if (isUuid(id)) await db.delete(staff).where(and(eq(staff.id, id), eq(staff.businessId, business.id)));
  revalidatePath("/painel/horarios");
}

// ---------- Assistente ----------

export async function saveAssistant(form: FormData) {
  const { business } = await requireBusiness();
  await db
    .update(businesses)
    .set({
      name: text(form, "name") || business.name,
      assistantName: text(form, "assistant_name") || "Assistente",
      tone: text(form, "tone"),
      about: text(form, "about"),
      instructions: text(form, "instructions"),
    })
    .where(eq(businesses.id, business.id));
  revalidatePath("/painel", "layout");
}

export async function addFaq(form: FormData) {
  const { business } = await requireBusiness();
  const question = text(form, "question");
  const answer = text(form, "answer");
  if (question && answer) await db.insert(faqs).values({ businessId: business.id, question, answer });
  revalidatePath("/painel/assistente");
}

export async function removeFaq(form: FormData) {
  const { business } = await requireBusiness();
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
  await db
    .update(appointments)
    .set({ status })
    .where(and(eq(appointments.id, id), eq(appointments.businessId, business.id)));
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
  revalidatePath("/painel", "layout");
  return { ok: true };
}

// ---------- Conversas ----------

export async function setConversationMode(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form, "id");
  if (!isUuid(id)) return;
  const mode = text(form, "mode") === "human" ? "human" : "assistant";
  await db
    .update(conversations)
    .set({ mode, needsAttention: false })
    .where(and(eq(conversations.id, id), eq(conversations.businessId, business.id)));
  revalidatePath("/painel", "layout");
}

export async function sendStaffMessage(form: FormData) {
  const { business } = await requireBusiness();
  const conversationId = text(form, "id");
  const content = text(form, "content");
  if (!content || !isUuid(conversationId)) return;
  const [conv] = await db
    .update(conversations)
    .set({ mode: "human", needsAttention: false, lastMessageAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, business.id)))
    .returning({ channel: conversations.channel, customerId: conversations.customerId });
  if (!conv) return;
  await db.insert(messages).values({ businessId: business.id, conversationId, role: "staff", content });

  if (conv.channel === "whatsapp") {
    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, conv.customerId));
    const sent = business.whatsappPhoneNumberId
      ? await sendText(business.whatsappPhoneNumberId, customer.phone, content)
      : { ok: false as const, reason: "O WhatsApp deste negócio ainda não está conectado." };
    if (!sent.ok)
      await db
        .insert(messages)
        .values({ businessId: business.id, conversationId, role: "system", content: `Mensagem acima não enviada pelo WhatsApp. ${sent.reason}` });
  }
  revalidatePath(`/painel/conversas/${conversationId}`);
}

export async function saveWhatsapp(form: FormData) {
  const { business } = await requireBusiness();
  const phoneNumberId = text(form, "phone_number_id").replace(/\D/g, "") || null;
  const number = text(form, "whatsapp_number") || null;
  try {
    await db
      .update(businesses)
      .set({ whatsappPhoneNumberId: phoneNumberId, whatsappNumber: phoneNumberId ? number : null })
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
  const outcome = await handleCustomerMessage(conversationId, content.trim());
  revalidatePath("/painel", "layout");
  return outcome;
}
