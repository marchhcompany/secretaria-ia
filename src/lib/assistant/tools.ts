import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  conversations,
  customers,
  messages,
  type Business,
  type Customer,
  type Service,
  type Staff,
} from "@/db/schema";
import { book, freeSlots } from "@/lib/scheduling";
import { formatLong } from "@/lib/time";

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "ver_horarios_livres",
    description:
      "Lista os horários livres de um serviço em uma data. Use antes de oferecer qualquer horário ao cliente.",
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
    description:
      "Cria o agendamento depois que o cliente confirmou serviço, data e hora. O horário precisa estar livre.",
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

export type ToolContext = {
  business: Business;
  customer: Customer;
  conversationId: string;
  staff: Staff[];
  services: Service[];
  onHandoff: (reason: string) => void;
};

type Result = { content: string; isError?: boolean };

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
const str = (s: unknown) => (typeof s === "string" ? s : "");
const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<Result> {
  const { business, customer } = ctx;
  const tz = business.timezone;
  const staffId = isUuid(input.profissional_id) ? input.profissional_id : null;

  switch (name) {
    case "ver_horarios_livres": {
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
      if (!isDate(input.data) || !isTime(input.hora)) return { content: "Data ou hora inválida.", isError: true };
      const service = ctx.services.find((s) => s.id === input.servico_id && s.active);
      if (!service) return { content: "Serviço não encontrado.", isError: true };
      const name = str(input.nome_cliente).trim();
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
      const who = ctx.staff.find((s) => s.id === a.staffId)?.name;
      return {
        content: `Agendado: ${service.name}, ${formatLong(a.startsAt, tz)}${who ? `, com ${who}` : ""}. id: ${a.id}`,
      };
    }

    case "meus_agendamentos": {
      const rows = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.customerId, customer.id),
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
        .where(and(eq(appointments.id, input.agendamento_id), eq(appointments.customerId, customer.id)))
        .returning({ id: appointments.id });
      if (!updated.length) return { content: "Agendamento não encontrado para este cliente.", isError: true };
      return { content: "Agendamento cancelado." };
    }

    case "chamar_atendente": {
      const reason = str(input.motivo) || "Cliente precisa de atendimento humano";
      await db
        .update(conversations)
        .set({ mode: "human", needsAttention: true })
        .where(eq(conversations.id, ctx.conversationId));
      await db.insert(messages).values({
        businessId: business.id,
        conversationId: ctx.conversationId,
        role: "system",
        content: `Conversa passada para a equipe: ${reason}`,
      });
      ctx.onHandoff(reason);
      return { content: "A equipe foi avisada. Diga ao cliente que alguém vai responder em breve." };
    }

    default:
      return { content: `Ferramenta desconhecida: ${name}`, isError: true };
  }
}

