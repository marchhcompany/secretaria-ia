import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";

export * from "./auth-schema";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  segment: text("segment").notNull().default("outro"),
  assistantName: text("assistant_name").notNull().default("Assistente"),
  tone: text("tone").notNull().default("simpático e profissional"),
  about: text("about").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  whatsappNumber: text("whatsapp_number"),
  // "Identificação do número de telefone" na Meta: é por ela que o webhook descobre de qual negócio é a mensagem.
  whatsappPhoneNumberId: text("whatsapp_phone_number_id").unique(),
  // WABA (WhatsApp Business Account) do número. Necessário para templates e para o onboarding de clientes.
  whatsappWabaId: text("whatsapp_waba_id"),
  // Token de acesso próprio do negócio (Embedded Signup), cifrado com AES-256-GCM (lib/crypto.ts).
  // Vazio: usa o WHATSAPP_ACCESS_TOKEN global (número da própria March / testes).
  whatsappAccessTokenEnc: text("whatsapp_access_token_enc"),

  // ---- Comportamento comercial (editável no painel, sem mexer em código) ----
  // Liga/desliga a IA no negócio inteiro. Desligada, as mensagens chegam no painel e só a equipe responde.
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  // Nunca informar preços por mensagem (os serviços continuam cadastrados para a equipe).
  hidePrices: boolean("hide_prices").notNull().default(false),
  paymentInfo: text("payment_info").notNull().default(""),
  // Objetivo da conversa. Ex.: "levar o interessado a marcar uma reunião presencial".
  conversionGoal: text("conversion_goal").notNull().default(""),
  qualificationQuestions: text("qualification_questions").notNull().default(""),
  // direct: a IA agenda sozinha na agenda real. request: só registra a preferência e chama a equipe. off: não agenda.
  bookingMode: text("booking_mode", { enum: ["direct", "request", "off"] }).notNull().default("direct"),
  // Modelo de IA deste negócio, "provedor:modelo" (ex.: anthropic:claude-haiku-5-5). Vazio: AI_MODEL do servidor.
  aiModel: text("ai_model").notNull().default(""),
  // Teto mensal de gasto com IA, em centavos de dólar. 0 = sem teto.
  aiMonthlyBudgetCents: integer("ai_monthly_budget_cents").notNull().default(0),
  // Trava de segurança: enquanto false, automações só simulam (dry-run) e nada é enviado.
  automationsLive: boolean("automations_live").notNull().default(false),
  // Divide respostas em até 3 mensagens (mais natural). Cada mensagem pode ser cobrada pela Meta.
  splitReplies: boolean("split_replies").notNull().default(true),
  // E-mail(s) que recebem aviso quando uma conversa precisa da equipe. Vazio: e-mail dos donos.
  notifyEmails: text("notify_emails").notNull().default(""),
  createdAt: createdAt(),
});

export const businessMembers = pgTable(
  "business_members",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "staff"] }).notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.userId] }), index().on(t.userId)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    durationMin: integer("duration_min").notNull().default(60),
    priceCents: integer("price_cents"),
    priceNote: text("price_note").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.businessId),
    check("duration_range", sql`${t.durationMin} between 5 and 600`),
    check("price_positive", sql`${t.priceCents} >= 0`),
  ],
);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId)],
);

export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    opens: time("opens").notNull(),
    closes: time("closes").notNull(),
  },
  (t) => [
    index().on(t.businessId),
    check("weekday_range", sql`${t.weekday} between 0 and 6`),
    check("closes_after_opens", sql`${t.closes} > ${t.opens}`),
  ],
);

export const faqs = pgTable(
  "faqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId)],
);

export const LEAD_STAGES = ["novo", "qualificando", "qualificado", "reuniao", "cliente", "perdido"] as const;

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    phone: text("phone").notNull(),
    notes: text("notes").notNull().default(""),
    // ---- Lead ----
    leadStage: text("lead_stage", { enum: LEAD_STAGES }).notNull().default("novo"),
    interest: text("interest", { enum: ["desconhecido", "frio", "morno", "quente"] }).notNull().default("desconhecido"),
    businessType: text("business_type").notNull().default(""),
    need: text("need").notNull().default(""),
    summary: text("summary").notNull().default(""),
    // ---- Consentimento (LGPD / política da Meta) ----
    // Pediu para não receber mais mensagens: nenhuma automação dispara para ele.
    optedOut: boolean("opted_out").notNull().default(false),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    // Aceitou receber mensagens de marketing (reativação). Sem isso, reativação não dispara.
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    // Última mensagem recebida do cliente: abre a janela de 24 horas do WhatsApp.
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.businessId, t.phone), index().on(t.businessId, t.leadStage)],
);

export const APPOINTMENT_STATUS = ["scheduled", "confirmed", "canceled", "done", "no_show"] as const;

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: APPOINTMENT_STATUS }).notNull().default("scheduled"),
    source: text("source", { enum: ["assistant", "manual"] }).notNull().default("manual"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.businessId, t.startsAt),
    index().on(t.customerId),
    index().on(t.serviceId),
    index().on(t.staffId),
    check("ends_after_starts", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["whatsapp", "simulator"] }).notNull().default("whatsapp"),
    mode: text("mode", { enum: ["assistant", "human"] }).notNull().default("assistant"),
    needsAttention: boolean("needs_attention").notNull().default(false),
    // Histórico enviado à API da Anthropic. Só cresce: nunca editar entradas antigas.
    transcript: jsonb("transcript").$type<unknown[]>().notNull().default([]),
    // Formato do transcript (cada provedor de IA tem o seu). Trocar de provedor reconstrói a partir das mensagens.
    transcriptProvider: text("transcript_provider").notNull().default("anthropic"),
    // Resumo atualizado pela própria assistente (ferramenta atualizar_lead).
    summary: text("summary").notNull().default(""),
    handoffReason: text("handoff_reason").notNull().default(""),
    // Até quando as mensagens da equipe já foram repassadas como contexto para a IA.
    aiContextUntil: timestamp("ai_context_until", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId, t.lastMessageAt), index().on(t.customerId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["customer", "assistant", "staff", "system"] }).notNull(),
    content: text("content").notNull(),
    // Mensagens do cliente ainda não respondidas pela IA. Várias seguidas viram uma resposta só.
    pendingAi: boolean("pending_ai").notNull().default(false),
    // Id da mensagem no WhatsApp (wamid) e status de entrega informado pela Meta.
    waMessageId: text("wa_message_id"),
    deliveryStatus: text("delivery_status"),
    // Quem da equipe escreveu (role = staff) ou qual automação gerou.
    authorUserId: text("author_user_id"),
    source: text("source").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.conversationId, t.createdAt),
    index().on(t.businessId),
    index().on(t.waMessageId),
  ],
);

// Mensagens do WhatsApp já recebidas. A Meta reenvia o mesmo evento se demorarmos a responder;
// o id da mensagem (wamid) como chave garante que cada uma é processada uma vez só.
export const whatsappInbound = pgTable("whatsapp_inbound", {
  id: text("id").primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

// Cada chamada à IA, com tokens e custo estimado. Base para o controle de custo por empresa e conversa.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    // Custo estimado em milionésimos de dólar (evita arredondar centavos a cada chamada).
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId, t.createdAt), index().on(t.conversationId)],
);

export const AUTOMATION_KINDS = ["follow_up", "appointment_reminder", "reactivation"] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

// Regras de automação configuráveis por negócio.
export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: AUTOMATION_KINDS }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    // follow_up: horas depois da última resposta sem retorno. appointment_reminder: horas antes do horário.
    // reactivation: dias sem contato.
    delay: integer("delay").notNull().default(24),
    // Texto livre: só pode ser enviado dentro da janela de 24 horas.
    message: text("message").notNull().default(""),
    // Template aprovado pela Meta: obrigatório fora da janela de 24 horas.
    templateName: text("template_name").notNull().default(""),
    templateLanguage: text("template_language").notNull().default("pt_BR"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.businessId, t.kind)],
);

export const SCHEDULED_STATUS = ["pending", "sent", "dry_run", "canceled", "skipped", "failed"] as const;

export const scheduledMessages = pgTable(
  "scheduled_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: AUTOMATION_KINDS }).notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: SCHEDULED_STATUS }).notNull().default("pending"),
    text: text("text").notNull().default(""),
    templateName: text("template_name").notNull().default(""),
    templateLanguage: text("template_language").notNull().default("pt_BR"),
    templateParams: jsonb("template_params").$type<string[]>().notNull().default([]),
    // Cancela sozinho quando o cliente responde antes do envio.
    cancelOnReply: boolean("cancel_on_reply").notNull().default(true),
    result: text("result").notNull().default(""),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.status, t.runAt),
    index().on(t.businessId, t.createdAt),
    index().on(t.customerId, t.status),
  ],
);

export type Business = typeof businesses.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type BusinessHour = typeof businessHours.$inferSelect;
export type Faq = typeof faqs.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;
