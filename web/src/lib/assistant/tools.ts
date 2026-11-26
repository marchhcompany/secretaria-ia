import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  LEAD_STAGES,
  appointments,
  conversations,
  customers,
  messages,
  type Business,
  type Customer,
  type Service,
  type Staff,
} from "@/db/schema";
import { cancelAllForCustomer, cancelAppointmentReminders, scheduleAppointmentReminder } from "@/lib/automations";
import { book, freeSlots } from "@/lib/scheduling";
import { formatLong } from "@/lib/time";

type Tool = Anthropic.Beta.BetaTool;

const BOOKING_TOOLS: Tool[] = [
  {
    name: "ver_horarios_livres",
    description: "Lista os horários livres de um serviço em uma data. Use antes de oferecer qualquer horário ao cliente.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        servico_id: { type: "string", description: "id do serviço" },
        data: { type: "string", description: "data no formato AAAA-MM-DD" },
        profissional_id: {
          type: ["string", "null"],
          description: "id do profissional, se o cliente pediu um específico; senão null",
        },
      },
      required: ["servico_id", "data", "profissional_id"],
      additionalProperties: false,
    },
  },
  {
    name: "agendar",
    description: "Cria o agendamento depois que o cliente confirmou serviço, data e hora. O horário precisa estar livre.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        servico_id: { type: "string" },
        data: { type: "string", description: "AAAA-MM-DD" },
        hora: { type: "string", description: "HH:MM, um dos horários livres" },
        nome_cliente: { type: "string", description: "nome do cliente" },
        profissional_id: { type: ["string", "null"] },
        observacoes: { type: "string", description: "algo que a equipe precise saber; pode ser vazio" },
      },
      required: ["servico_id", "data", "hora", "nome_cliente", "profissional_id", "observacoes"],
      additionalProperties: false,
    },
  },
  {
    name: "meus_agendamentos",
    description: "Lista os próximos agendamentos deste cliente, com os ids para cancelar ou remarcar.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "cancelar_agendamento",
    description: "Cancela um agendamento deste cliente.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { agendamento_id: { type: "string" } },
      required: ["agendamento_id"],
      additionalProperties: false,
    },
  },
];

const REQUEST_TOOL: Tool = {
  name: "solicitar_horario",
  description:
    "Registra que o cliente quer marcar um horário ou reunião e avisa a equipe para confirmar. Não confirma nada sozinho.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      assunto: { type: "string", description: "o que o cliente quer marcar (ex.: reunião sobre loja online)" },
      preferencia: { type: "string", description: "dias, períodos e formato (presencial/online) que o cliente prefere" },
      nome_cliente: { type: "string", description: "nome do cliente, ou vazio se ainda não souber" },
    },
    required: ["assunto", "preferencia", "nome_cliente"],
    additionalProperties: false,
  },
};

const COMMON_TOOLS: Tool[] = [
  {
    name: "atualizar_lead",
    description:
      "Registra o que você descobriu sobre o cliente (nome, tipo de negócio, necessidade, interesse) e um resumo da conversa. Use sempre que aprender algo novo; não avise o cliente que fez isso.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "nome do cliente, ou vazio se não souber" },
        tipo_negocio: { type: "string", description: "tipo de negócio do cliente, ou vazio" },
        necessidade: { type: "string", description: "o que o cliente precisa ou procura, ou vazio" },
        interesse: {
          type: "string",
          enum: ["desconhecido", "frio", "morno", "quente"],
          description: "quente = quer avançar agora; morno = interessado, avaliando; frio = só curiosidade",
        },
        etapa: { type: "string", enum: [...LEAD_STAGES], description: "etapa do funil" },
        resumo: { type: "string", description: "resumo curto da conversa até agora para a equipe (até 3 frases)" },
      },
      required: ["nome", "tipo_negocio", "necessidade", "interesse", "etapa", "resumo"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_descadastro",
    description: "O cliente pediu para não receber mais mensagens. Cancela automações e registra o descadastro.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "chamar_atendente",
    description:
      "Passa a conversa para a equipe humana e avisa no painel. Depois disso a assistente para de responder nesta conversa.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "resumo curto do motivo para a equipe" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

/** Ferramentas disponíveis para este negócio. A lista é estável por negócio (mantém o cache do prompt). */
export function toolsFor(directBooking: boolean, bookingMode: Business["bookingMode"]): Tool[] {
  if (directBooking) return [...BOOKING_TOOLS, ...COMMON_TOOLS];
  if (bookingMode === "request") return [REQUEST_TOOL, ...COMMON_TOOLS];
  return COMMON_TOOLS;
}

export type ToolContext = {
  business: Business;
  customer: Customer;
  conversationId: string;
  staff: Staff[];
  services: Service[];
  directBooking: boolean;
  onHandoff: (reason: string) => void;
  onAttention: (reason: string) => void;
};

type Result = { content: string; isError?: boolean };

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
const str = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<Result> {
  const { business, customer } = ctx;
  const tz = business.timezone;

  if (["ver_horarios_livres", "agendar", "meus_agendamentos", "cancelar_agendamento"].includes(name) && !ctx.directBooking)
    return { content: "Agendamento direto está desligado para este negócio.", isError: true };

  switch (name) {
    case "ver_horarios_livres": {
      const staffId = isUuid(input.profissional_id) ? input.profissional_id : null;
      if (!isDate(input.data)) return { content: "Data inválida. Use AAAA-MM-DD.", isError: true };
      const service = ctx.services.find((s) => s.id === input.servico_id && s.active);
      if (!service) return { content: "Serviço não encontrado.", isError: true };
      const slots = await freeSlots(business, service.id, input.data, staffId);
      if (!slots.length) return { content: `Sem horários livres para ${service.name} em ${input.data}.` };
      const names = new Map(ctx.staff.map((s) => [s.id, s.name]));
      const lines = slots.map((s) =>
        s.staffIds.length ? `${s.time} (${s.staffIds.map((id) => names.get(id) ?? id).join(", ")})` : s.time,
      );
      return { content: `Horários livres para ${service.name} em ${input.data}:\n${lines.join("\n")}` };
    }

    case "agendar": {
      const staffId = isUuid(input.profissional_id) ? input.profissional_id : null;
      if (!isDate(input.data) || !isTime(input.hora)) return { content: "Data ou hora inválida.", isError: true };
      const service = ctx.services.find((s) => s.id === input.servico_id && s.active);
      if (!service) return { content: "Serviço não encontrado.", isError: true };
      const name = str(input.nome_cliente);
      if (name && name !== customer.name) {
        await db.update(customers).set({ name }).where(eq(customers.id, customer.id));
        customer.name = name;
      }
      const result = await book(business, {
        customerId: customer.id,
        serviceId: service.id,
        date: input.data,
        time: input.hora,
        staffId,
        source: "assistant",
        notes: str(input.observacoes),
      });
      if (!result.ok) return { content: result.reason, isError: true };
      const a = result.appointment;
      await scheduleAppointmentReminder(business, customer, a.id, a.startsAt);
      const who = ctx.staff.find((s) => s.id === a.staffId)?.name;
      return { content: `Agendado: ${service.name}, ${formatLong(a.startsAt, tz)}${who ? `, com ${who}` : ""}. id: ${a.id}` };
    }

    case "meus_agendamentos": {
      const rows = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.customerId, customer.id),
            eq(appointments.businessId, business.id),
            inArray(appointments.status, ["scheduled", "confirmed"]),
            gte(appointments.startsAt, new Date()),
          ),
        )
        .orderBy(asc(appointments.startsAt));
      if (!rows.length) return { content: "Este cliente não tem agendamentos futuros." };
      return {
        content: rows
          .map((a) => {
            const service = ctx.services.find((s) => s.id === a.serviceId)?.name ?? "Serviço";
            const who = ctx.staff.find((s) => s.id === a.staffId)?.name;
            return `- ${service}, ${formatLong(a.startsAt, tz)}${who ? `, com ${who}` : ""} (id: ${a.id})`;
          })
          .join("\n"),
      };
    }

    case "cancelar_agendamento": {
      if (!isUuid(input.agendamento_id)) return { content: "Agendamento não encontrado.", isError: true };
      const updated = await db
        .update(appointments)
        .set({ status: "canceled" })
        .where(
          and(
            eq(appointments.id, input.agendamento_id),
            eq(appointments.customerId, customer.id),
            eq(appointments.businessId, business.id),
          ),
        )
        .returning({ id: appointments.id });
      if (!updated.length) return { content: "Agendamento não encontrado para este cliente.", isError: true };
      await cancelAppointmentReminders(updated[0].id);
      return { content: "Agendamento cancelado." };
    }

    case "solicitar_horario": {
      const name = str(input.nome_cliente);
      if (name && !customer.name) {
        await db.update(customers).set({ name }).where(eq(customers.id, customer.id));
        customer.name = name;
      }
      await db
        .update(customers)
        .set({ leadStage: "reuniao" })
        .where(and(eq(customers.id, customer.id), eq(customers.businessId, business.id)));
      const reason = `Pedido de horário: ${str(input.assunto)}. Preferência: ${str(input.preferencia)}`;
      await systemNote(ctx, reason);
      ctx.onAttention(reason);
      return { content: "Pedido registrado. Diga ao cliente que a equipe vai confirmar o horário com ele em breve." };
    }

    case "atualizar_lead": {
      const interest = ["desconhecido", "frio", "morno", "quente"].find((i) => i === input.interesse) as
        | Customer["interest"]
        | undefined;
      const stage = LEAD_STAGES.find((s) => s === input.etapa);
      const patch: Partial<Customer> = {};
      if (str(input.nome)) patch.name = str(input.nome);
      if (str(input.tipo_negocio)) patch.businessType = str(input.tipo_negocio);
      if (str(input.necessidade)) patch.need = str(input.necessidade);
      if (interest) patch.interest = interest;
      if (stage) patch.leadStage = stage;
      if (str(input.resumo)) patch.summary = str(input.resumo);
      if (Object.keys(patch).length)
        await db.update(customers).set(patch).where(and(eq(customers.id, customer.id), eq(customers.businessId, business.id)));
      Object.assign(customer, patch);
      if (str(input.resumo))
        await db.update(conversations).set({ summary: str(input.resumo) }).where(eq(conversations.id, ctx.conversationId));
      return { content: "Registrado." };
    }

    case "registrar_descadastro": {
      await optOut(business.id, customer.id);
      customer.optedOut = true;
      await systemNote(ctx, "Cliente pediu para não receber mais mensagens. Automações canceladas.");
      return { content: "Descadastro registrado. Confirme em uma frase curta, sem insistir." };
    }

    case "chamar_atendente": {
      const reason = str(input.motivo) || "Cliente precisa de atendimento humano";
      await db
        .update(conversations)
        .set({ mode: "human", needsAttention: true, handoffReason: reason })
        .where(eq(conversations.id, ctx.conversationId));
      await systemNote(ctx, `Conversa passada para a equipe: ${reason}`);
      ctx.onHandoff(reason);
      return { content: "A equipe foi avisada. Diga ao cliente que alguém vai responder em breve." };
    }

    default:
      return { content: `Ferramenta desconhecida: ${name}`, isError: true };
  }
}

async function systemNote(ctx: ToolContext, content: string) {
  await db.insert(messages).values({ businessId: ctx.business.id, conversationId: ctx.conversationId, role: "system", content });
}

export async function optOut(businessId: string, customerId: string) {
  await db
    .update(customers)
    .set({ optedOut: true, optedOutAt: new Date(), marketingConsent: false })
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)));
  await cancelAllForCustomer(customerId, "Cliente pediu para não receber mensagens.");
}
