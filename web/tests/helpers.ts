import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/db";
import { automationRules, businesses, customers, conversations, type AutomationKind } from "@/db/schema";
import { setModelClient, type CreateParams } from "@/lib/assistant/model";
import { setWhatsappTransport } from "@/lib/whatsapp/client";

export async function resetDb() {
  await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
}

// ---------- Modelo roteirizado ----------

let seq = 0;
export function msg(content: Anthropic.Beta.BetaContentBlock[], stop: Anthropic.Beta.BetaMessage["stop_reason"]): Anthropic.Beta.BetaMessage {
  return {
    id: `msg_${++seq}`,
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
}
export const say = (text: string) => msg([{ type: "text", text, citations: null } as Anthropic.Beta.BetaTextBlock], "end_turn");
export const call = (name: string, input: Record<string, unknown>) =>
  msg([{ type: "tool_use", id: `tu_${++seq}`, name, input } as Anthropic.Beta.BetaToolUseBlock], "tool_use");

export type Step = Anthropic.Beta.BetaMessage | Error | ((p: CreateParams) => Promise<Anthropic.Beta.BetaMessage>);
export const model = {
  calls: [] as CreateParams[],
  script: [] as Step[],
};
export function useScriptedModel(steps: Step[]) {
  model.calls = [];
  model.script = [...steps];
  setModelClient({
    async create(params) {
      model.calls.push(structuredClone(params));
      const step = model.script.shift();
      if (!step) throw new Error("Modelo roteirizado sem resposta para esta chamada.");
      if (step instanceof Error) throw step;
      if (typeof step === "function") return step(params);
      return step;
    },
  });
}

/** Texto das mensagens de usuário enviadas ao modelo na chamada i. */
export function userTextOf(params: CreateParams): string {
  return params.messages
    .filter((m) => m.role === "user")
    .flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }]))
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n");
}

// ---------- WhatsApp falso ----------

export const wa = { sent: [] as { url: string; body: Record<string, unknown> }[], fail: null as null | { code: number; message: string } };
export function useFakeWhatsapp() {
  wa.sent = [];
  wa.fail = null;
  let n = 0;
  setWhatsappTransport(async (url, init) => {
    const body = JSON.parse(String(init.body));
    wa.sent.push({ url, body });
    if (wa.fail && body.type) return new Response(JSON.stringify({ error: wa.fail }), { status: 400 });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out${++n}` }] }), { status: 200 });
  });
}
/** Só as mensagens enviadas ao cliente (sem "lida/digitando"). */
export const outgoing = () => wa.sent.filter((s) => s.body.type);
export const outgoingTexts = () => outgoing().map((s) => (s.body.text as { body: string } | undefined)?.body ?? `[template ${(s.body.template as { name: string }).name}]`);

// ---------- Dados ----------

export async function makeBusiness(over: Partial<typeof businesses.$inferInsert> = {}) {
  const [b] = await db
    .insert(businesses)
    .values({ name: "March Company", segment: "agencia", whatsappPhoneNumberId: `pn${++seq}`, bookingMode: "request", ...over })
    .returning();
  return b;
}

export async function enableRule(businessId: string, kind: AutomationKind, over: Partial<typeof automationRules.$inferInsert> = {}) {
  await db.insert(automationRules).values({ businessId, kind, enabled: true, delay: 20, message: "Oi{, nome}! Ficou alguma dúvida?", ...over });
}

let waSeq = 0;
export function inbound(phoneNumberId: string, from: string, text: string | null, opts: { id?: string; type?: string; name?: string } = {}) {
  const id = opts.id ?? `wamid.in${++waSeq}`;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name: opts.name ?? "" } }],
              messages: [
                text === null
                  ? { from, id, type: opts.type ?? "audio", timestamp: String(Math.floor(Date.now() / 1000)) }
                  : { from, id, type: "text", text: { body: text }, timestamp: String(Math.floor(Date.now() / 1000)) },
              ],
            },
          },
        ],
      },
    ],
  };
}

export async function conversationOf(businessId: string, phone: string) {
  const [c] = await db.select().from(customers).where(sql`${customers.businessId} = ${businessId} and ${customers.phone} = ${phone}`);
  const [conv] = await db.select().from(conversations).where(sql`${conversations.customerId} = ${c.id}`);
  return { customer: c, conversation: conv };
}
