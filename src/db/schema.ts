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
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.businessId, t.phone)],
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
    createdAt: createdAt(),
  },
  (t) => [index().on(t.conversationId, t.createdAt), index().on(t.businessId)],
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

export type Business = typeof businesses.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type BusinessHour = typeof businessHours.$inferSelect;
export type Faq = typeof faqs.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
