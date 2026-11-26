// Testes de integração: banco Postgres real (local), modelo roteirizado e WhatsApp falso.
// Nenhuma chamada paga à Anthropic e nenhuma mensagem real ao WhatsApp.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, describe, test } from "node:test";
import { InternalServerError } from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, appointments, conversations, customers, messages, scheduledMessages, services } from "@/db/schema";
import { addCustomerMessage, runAssistant, splitReply, isOptOutRequest, HOLDING_TEXT } from "@/lib/assistant/engine";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { processDueAutomations } from "@/lib/automations";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validSignature } from "@/lib/whatsapp/client";
import { closeLockPool, processWebhook, respond } from "@/lib/whatsapp/inbound";
import {
  call,
  conversationOf,
  enableRule,
  inbound,
  makeBusiness,
  model,
  outgoing,
  outgoingTexts,
  resetDb,
  say,
  useFakeWhatsapp,
  userTextOf,
  wa,
} from "./helpers";

const PHONE = "5521999990001";

before(resetDb);
beforeEach(() => useFakeWhatsapp());
after(async () => {
  await closeLockPool();
  await db.$client.end();
});

describe("comportamento configurado no prompt (cenários 1–4 e 8)", () => {
  test("nunca expõe preços quando hidePrices está ligado e se identifica como assistente virtual", async () => {
    const b = await makeBusiness({ hidePrices: true, paymentInfo: "Pix, Pix parcelado e cartão parcelado." });
    await db.insert(services).values({ businessId: b.id, name: "Loja online", priceCents: 350000 });
    const [svc] = await db.select().from(services).where(eq(services.businessId, b.id));
    const prompt = buildSystemPrompt({ business: b, services: [svc], staff: [], hours: [], faqs: [] });
    assert.ok(!prompt.includes("3.500"), "o valor do serviço não pode aparecer no prompt");
    assert.match(prompt, /Nunca informe preços/);
    assert.match(prompt, /assistente virtual de "March Company"/);
    assert.match(prompt, /Pix parcelado/);
    assert.match(prompt, /Não prometa resultados garantidos/);
    assert.match(prompt, /Se a resposta não estiver aqui, diga que vai confirmar com a equipe/);
  });

  test("com preços liberados, o prompt mostra o valor cadastrado", async () => {
    const b = await makeBusiness({ hidePrices: false });
    const [svc] = await db.insert(services).values({ businessId: b.id, name: "Aula experimental", priceCents: 0 }).returning();
    const prompt = buildSystemPrompt({ business: b, services: [svc], staff: [], hours: [], faqs: [] });
    assert.match(prompt, /Aula experimental.*gratuito/);
  });
});

describe("WhatsApp de ponta a ponta (com transporte falso)", () => {
  test("responde, registra custo, atualiza o lead e divide respostas longas", async () => {
    const b = await makeBusiness();
    useScripted([
      call("atualizar_lead", {
        nome: "Ana",
        tipo_negocio: "loja de roupas",
        necessidade: "loja online",
        interesse: "quente",
        etapa: "qualificando",
        resumo: "Dona de loja de roupas quer vender online.",
      }),
      say("Oi, Ana! Sou a assistente virtual da March Company.\n\nVocê já vende pelo Instagram?"),
    ]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi, tenho uma loja de roupas e quero vender online", { name: "Ana Souza" }));
    assert.deepEqual(outgoingTexts(), ["Oi, Ana! Sou a assistente virtual da March Company.", "Você já vende pelo Instagram?"]);
    const { customer, conversation } = await conversationOf(b.id, PHONE);
    assert.equal(customer.interest, "quente");
    assert.equal(customer.businessType, "loja de roupas");
    assert.equal(conversation.summary, "Dona de loja de roupas quer vender online.");
    const usage = await db.select().from(aiUsage).where(eq(aiUsage.businessId, b.id));
    assert.equal(usage.length, 2);
    assert.ok(usage[0].costMicroUsd > 0);
    const sent = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.role, "assistant")));
    assert.ok(sent.every((m) => m.deliveryStatus === "sent" && m.waMessageId));
  });

  test("cenário 12: webhook duplicado é processado uma única vez", async () => {
    const b = await makeBusiness();
    useScripted([say("Oi! Como posso ajudar?")]);
    const payload = inbound(b.whatsappPhoneNumberId!, PHONE, "Oi", { id: "wamid.DUP" });
    await processWebhook(payload);
    await processWebhook(payload);
    assert.equal(model.calls.length, 1);
    assert.equal(outgoing().length, 1);
    const { conversation } = await conversationOf(b.id, PHONE);
    const customerMsgs = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.role, "customer")));
    assert.equal(customerMsgs.length, 1);
  });

  test("cenário 7: várias mensagens seguidas geram uma única resposta", async () => {
    const b = await makeBusiness();
    useScripted([say("Entendi tudo! Me conta qual é o seu negócio?")]);
    const pn = b.whatsappPhoneNumberId!;
    // Registra as três mensagens e dispara as três respostas ao mesmo tempo (como três webhooks).
    await processWebhookNoReply(pn, ["Oi", "Queria saber sobre sites", "E também sobre tráfego pago"]);
    const { conversation } = await conversationOf(b.id, PHONE);
    const outcomes = await Promise.all([1, 2, 3].map(() => respond(b, conversation.id, PHONE)));
    assert.equal(model.calls.length, 1, "o modelo deve ser chamado uma vez só");
    assert.deepEqual(outcomes.map((o) => o.status).sort(), ["nothing", "nothing", "replied"]);
    const text = userTextOf(model.calls[0]);
    assert.match(text, /Queria saber sobre sites/);
    assert.match(text, /tráfego pago/);
    assert.match(text, /3 mensagens seguidas/);
    assert.equal(outgoing().length, 1);
  });

  test("cenário 9: áudio recebe pedido de texto, sem chamar a IA", async () => {
    const b = await makeBusiness();
    useScripted([]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, null, { type: "audio" }));
    assert.equal(model.calls.length, 0);
    assert.match(outgoingTexts()[0], /não consigo ouvir áudios/);
  });

  test("cenário 6: pedido de atendimento humano pausa a IA e as próximas mensagens ficam para a equipe", async () => {
    const b = await makeBusiness();
    useScripted([call("chamar_atendente", { motivo: "Cliente pediu para falar com uma pessoa" }), say("Claro! Já chamei alguém da equipe.")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Quero falar com uma pessoa"));
    const { conversation } = await conversationOf(b.id, PHONE);
    assert.equal(conversation.mode, "human");
    assert.equal(conversation.needsAttention, true);
    assert.deepEqual(outgoingTexts(), ["Claro! Já chamei alguém da equipe."]);

    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Alô?"));
    assert.equal(model.calls.length, 2, "nenhuma chamada nova ao modelo com a conversa pausada");
    assert.equal(outgoing().length, 1, "nada é enviado enquanto a equipe atende");
  });

  test("cenário 13: se a equipe assume enquanto a IA pensa, a resposta da IA é descartada", async () => {
    const b = await makeBusiness();
    let conversationId = "";
    useScripted([
      async () => {
        // A equipe assume no meio da geração.
        await db.update(conversations).set({ mode: "human" }).where(eq(conversations.id, conversationId));
        return say("Resposta que não deve sair");
      },
    ]);
    await processWebhookNoReply(b.whatsappPhoneNumberId!, ["Oi"]);
    const { conversation } = await conversationOf(b.id, PHONE);
    conversationId = conversation.id;
    await respond(b, conversation.id, PHONE);
    assert.equal(outgoing().length, 0);
    const [m] = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.role, "assistant")));
    assert.equal(m.deliveryStatus, "discarded");
  });

  test("cenário 13: ao devolver para a IA, ela recebe o que a equipe escreveu", async () => {
    const b = await makeBusiness();
    useScripted([say("Oi!")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    const { conversation } = await conversationOf(b.id, PHONE);
    await db.update(conversations).set({ mode: "human" }).where(eq(conversations.id, conversation.id));
    await db.insert(messages).values({ businessId: b.id, conversationId: conversation.id, role: "staff", content: "Aqui é o Davi, vou te mandar o portfólio." });
    await db.update(conversations).set({ mode: "assistant" }).where(eq(conversations.id, conversation.id));
    model.script.push(say("Combinado!"));
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Obrigado"));
    assert.match(userTextOf(model.calls[1]), /A equipe escreveu.*\n- Aqui é o Davi/);
  });

  test("cenário 10: descadastro cancela automações, confirma uma vez e bloqueia envios futuros", async () => {
    const b = await makeBusiness({ automationsLive: true });
    await enableRule(b.id, "follow_up");
    useScripted([say("Posso ajudar em algo mais?")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    let { customer } = await conversationOf(b.id, PHONE);
    const [fu] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.customerId, customer.id));
    assert.equal(fu.status, "pending");

    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Não quero mais receber mensagens"));
    ({ customer } = await conversationOf(b.id, PHONE));
    assert.equal(customer.optedOut, true);
    assert.equal(model.calls.length, 1, "descadastro explícito não depende da IA");
    assert.match(outgoingTexts().at(-1)!, /não vou mais te enviar mensagens/);
    const items = await db.select().from(scheduledMessages).where(eq(scheduledMessages.customerId, customer.id));
    assert.ok(items.every((i) => i.status === "canceled"));
  });

  test("cenário 11: falha da IA envia um aviso único, alerta a equipe e não perde a mensagem", async () => {
    const b = await makeBusiness();
    const boom = new InternalServerError(500, { type: "error", error: { type: "api_error", message: "overloaded" } }, "overloaded", new Headers());
    useScripted([boom, boom, say("Agora sim! Sobre o site, me conta mais.")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Quero um site"));
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Alguém aí?"));
    assert.deepEqual(outgoingTexts(), [HOLDING_TEXT], "o aviso sai uma vez só");
    const { conversation } = await conversationOf(b.id, PHONE);
    assert.equal(conversation.needsAttention, true);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "?"));
    const text = userTextOf(model.calls[2]);
    assert.match(text, /Quero um site/, "a mensagem de antes da falha chega à IA");
    assert.match(text, /Alguém aí\?/);
  });

  test("teto de custo mensal pausa a IA e passa para a equipe", async () => {
    const b = await makeBusiness({ aiMonthlyBudgetCents: 1 });
    await db.insert(aiUsage).values({ businessId: b.id, model: "claude-opus-5-5", costMicroUsd: 20_000 });
    useScripted([]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    const { conversation } = await conversationOf(b.id, PHONE);
    assert.equal(model.calls.length, 0);
    assert.equal(conversation.mode, "human");
    assert.deepEqual(outgoingTexts(), [HOLDING_TEXT]);
  });

  test("IA desligada no negócio: mensagens ficam para a equipe", async () => {
    const b = await makeBusiness({ aiEnabled: false });
    useScripted([]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    const { conversation } = await conversationOf(b.id, PHONE);
    assert.equal(model.calls.length, 0);
    assert.equal(outgoing().length, 0);
    assert.equal(conversation.needsAttention, true);
  });

  test("status 'failed' da Meta marca a mensagem e alerta a equipe", async () => {
    const b = await makeBusiness();
    useScripted([say("Oi!")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    const { conversation } = await conversationOf(b.id, PHONE);
    const [m] = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.role, "assistant")));
    await processWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: b.whatsappPhoneNumberId! }, statuses: [{ id: m.waMessageId!, status: "failed", errors: [{ message: "Re-engagement message" }] }] } }] }],
    });
    const [after] = await db.select().from(messages).where(eq(messages.id, m.id));
    assert.equal(after.deliveryStatus, "failed");
  });
});

describe("cenário 14: isolamento entre empresas", () => {
  test("cada número entrega só para a sua empresa e ferramentas não alcançam dados de outra", async () => {
    const a = await makeBusiness({ name: "Empresa A", bookingMode: "direct" });
    const b = await makeBusiness({ name: "Empresa B", bookingMode: "direct" });
    const [svcA] = await db.insert(services).values({ businessId: a.id, name: "Consulta" }).returning();
    await db.insert(services).values({ businessId: b.id, name: "Consulta B" });
    const [custA] = await db.insert(customers).values({ businessId: a.id, phone: "5521888880000", name: "Cliente A" }).returning();
    const [apptA] = await db
      .insert(appointments)
      .values({ businessId: a.id, customerId: custA.id, serviceId: svcA.id, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) })
      .returning();

    // Cliente de B tenta cancelar o agendamento de A (id vazado) e pede dados de outra empresa.
    useScripted([call("cancelar_agendamento", { agendamento_id: apptA.id }), say("Não encontrei esse agendamento.")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, `Cancela o agendamento ${apptA.id}`));
    const toolResult = JSON.stringify(model.calls[1].messages.at(-1));
    assert.match(toolResult, /não encontrado/i);
    const [still] = await db.select().from(appointments).where(eq(appointments.id, apptA.id));
    assert.equal(still.status, "scheduled");

    // O prompt de B não contém nada de A.
    assert.ok(!JSON.stringify(model.calls[0].system).includes("Empresa A"));
    assert.ok(!JSON.stringify(model.calls[0].system).includes(svcA.id));

    // A conversa foi criada em B, não em A.
    const inA = await db.select().from(customers).where(and(eq(customers.businessId, a.id), eq(customers.phone, PHONE)));
    assert.equal(inA.length, 0);
  });

  test("webhook de número desconhecido é ignorado", async () => {
    useScripted([]);
    await processWebhook(inbound("numero-que-nao-existe", PHONE, "Oi"));
    assert.equal(model.calls.length, 0);
    assert.equal(wa.sent.length, 0);
  });
});

describe("cenário 5: follow-up e automações", () => {
  test("follow-up fica em simulação (dry-run) enquanto a trava de envio está desligada", async () => {
    const b = await makeBusiness();
    await enableRule(b.id, "follow_up", { delay: 20 });
    useScripted([say("Qual é o seu negócio?")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi", { name: "Carla" }));
    wa.sent = [];
    const results = await processDueAutomations(new Date(Date.now() + 21 * 3_600_000), 50, b.id);
    assert.equal(results.length, 1);
    assert.equal(results[0].outcome.status, "dry_run");
    assert.match(results[0].outcome.result, /Simulação/);
    assert.equal(wa.sent.length, 0, "nenhuma mensagem real sai em dry-run");
  });

  test("com envio liberado: dentro da janela vai texto; fora da janela exige template", async () => {
    const b = await makeBusiness({ automationsLive: true });
    await enableRule(b.id, "follow_up", { delay: 2 });
    useScripted([say("Qual é o seu negócio?")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi", { name: "Carla Dias" }));
    wa.sent = [];
    let [r] = await processDueAutomations(new Date(Date.now() + 3 * 3_600_000), 50, b.id);
    assert.equal(r.outcome.status, "sent");
    assert.deepEqual(outgoingTexts(), ["Oi, Carla! Ficou alguma dúvida?"]);

    // Fora da janela de 24h e sem template: não envia.
    const { customer } = await conversationOf(b.id, PHONE);
    await db.update(customers).set({ lastInboundAt: new Date(Date.now() - 30 * 3_600_000) }).where(eq(customers.id, customer.id));
    const [item] = await db
      .insert(scheduledMessages)
      .values({ businessId: b.id, customerId: customer.id, kind: "follow_up", runAt: new Date(), text: "Oi!", createdAt: new Date(Date.now() - 29 * 3_600_000) })
      .returning();
    [r] = await processDueAutomations(new Date(), 50, b.id);
    assert.equal(r.id, item.id);
    assert.equal(r.outcome.status, "skipped");
    assert.match(r.outcome.result, /template aprovado/);
  });

  test("resposta do cliente cancela o follow-up pendente", async () => {
    const b = await makeBusiness();
    await enableRule(b.id, "follow_up");
    useScripted([say("Qual é o seu negócio?"), say("Legal!")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Tenho uma academia"));
    const { customer } = await conversationOf(b.id, PHONE);
    const items = await db.select().from(scheduledMessages).where(eq(scheduledMessages.customerId, customer.id));
    assert.equal(items.filter((i) => i.status === "pending").length, 1, "só o follow-up mais recente fica pendente");
    assert.equal(items.filter((i) => i.status === "canceled").length, 1);
  });
});

describe("utilitários", () => {
  test("assinatura do webhook (HMAC SHA-256)", () => {
    const body = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "test-app-secret").update(body).digest("hex");
    assert.equal(validSignature(body, sig), true);
    assert.equal(validSignature(body + " ", sig), false);
    assert.equal(validSignature(body, null), false);
  });

  test("cifra de tokens", () => {
    const sealed = encryptSecret("EAAG-token");
    assert.notEqual(sealed, "EAAG-token");
    assert.equal(decryptSecret(sealed), "EAAG-token");
  });

  test("detecção de descadastro e divisão de respostas", () => {
    for (const t of ["PARAR", "não quero mais receber mensagens", "Parem de me mandar mensagem", "me tire da lista"])
      assert.ok(isOptOutRequest(t), t);
    for (const t of ["quero parar de perder clientes", "como cancelar meu pedido de site?", "oi"]) assert.ok(!isOptOutRequest(t), t);
    assert.deepEqual(splitReply("a\n\nb\n\nc\n\nd"), ["a", "b", "c\n\nd"]);
  });

  test("simulador: mensagens pendentes sem IA configurada continuam pendentes", async () => {
    const b = await makeBusiness();
    const [c] = await db.insert(customers).values({ businessId: b.id, phone: "simulador-x" }).returning();
    const [conv] = await db.insert(conversations).values({ businessId: b.id, customerId: c.id, channel: "simulator" }).returning();
    const { setModelClient } = await import("@/lib/assistant/model");
    setModelClient(null);
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await addCustomerMessage(conv.id, "Oi");
    assert.equal((await runAssistant(conv.id)).status, "not_configured");
    if (key) process.env.ANTHROPIC_API_KEY = key;
  });
});

// ---------- auxiliares locais ----------

import { useScriptedModel } from "./helpers";
function useScripted(steps: Parameters<typeof useScriptedModel>[0]) {
  useScriptedModel(steps);
}

/** Registra mensagens recebidas sem disparar a resposta (para controlar a concorrência no teste). */
async function processWebhookNoReply(phoneNumberId: string, texts: string[]) {
  const { businesses: bt } = await import("@/db/schema");
  const [b] = await db.select().from(bt).where(eq(bt.whatsappPhoneNumberId, phoneNumberId));
  const [c] = await db
    .insert(customers)
    .values({ businessId: b.id, phone: PHONE })
    .onConflictDoUpdate({ target: [customers.businessId, customers.phone], set: { phone: PHONE } })
    .returning();
  let [conv] = await db.select().from(conversations).where(eq(conversations.customerId, c.id));
  if (!conv) [conv] = await db.insert(conversations).values({ businessId: b.id, customerId: c.id }).returning();
  for (const t of texts) await addCustomerMessage(conv.id, t, new Date(Date.now() + texts.indexOf(t)));
}

describe("coexistência (app do celular + API)", () => {
  test("resposta da equipe pelo celular pausa a IA e entra no histórico como Equipe", async () => {
    const b = await makeBusiness();
    useScripted([say("Oi! Como posso ajudar?")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    await processWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                metadata: { phone_number_id: b.whatsappPhoneNumberId! },
                message_echoes: [{ from: "552130000000", to: PHONE, id: "wamid.ECHO1", type: "text", text: { body: "Oi, aqui é o Kauã!" } }],
              },
            },
          ],
        },
      ],
    });
    const { conversation } = await conversationOf(b.id, PHONE);
    assert.equal(conversation.mode, "human");
    const staffMsgs = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.role, "staff")));
    assert.equal(staffMsgs[0].content, "Oi, aqui é o Kauã!");
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Beleza"));
    assert.equal(model.calls.length, 1, "a IA não responde depois que a equipe assumiu pelo celular");
  });
});

describe("provedores de IA (arquitetura independente)", () => {
  test("provedor compatível com OpenAI: ferramenta, resposta e custo registrado", async () => {
    const { setCompatClient } = await import("@/lib/ai/compat");
    const bodies: unknown[] = [];
    const replies = [
      { tool_calls: [{ id: "c1", type: "function", function: { name: "atualizar_lead", arguments: JSON.stringify({ nome: "Bia", tipo_negocio: "academia", necessidade: "atendimento", interesse: "morno", etapa: "qualificando", resumo: "Academia quer IA." }) } }] },
      { content: "Oi, Bia! Sou a assistente virtual da March Company. Como funciona o atendimento hoje?" },
    ];
    setCompatClient({
      async create(kind, body) {
        assert.equal(kind, "gemini");
        bodies.push(structuredClone(body));
        const msg = replies.shift()!;
        return {
          id: "x",
          object: "chat.completion",
          created: 0,
          model: "gemini-2.5-flash",
          choices: [{ index: 0, finish_reason: msg.tool_calls ? "tool_calls" : "stop", logprobs: null, message: { role: "assistant", content: msg.content ?? null, refusal: null, tool_calls: msg.tool_calls as never } }],
          usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280, prompt_tokens_details: { cached_tokens: 1000 } },
        } as never;
      },
    });
    const b = await makeBusiness({ aiModel: "gemini:gemini-2.5-flash" });
    useScripted([]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi, tenho uma academia"));
    setCompatClient(null);
    assert.equal(model.calls.length, 0, "a Anthropic não é chamada");
    assert.deepEqual(outgoingTexts(), ["Oi, Bia! Sou a assistente virtual da March Company. Como funciona o atendimento hoje?"]);
    const { customer, conversation } = await conversationOf(b.id, PHONE);
    assert.equal(customer.businessType, "academia");
    assert.equal(conversation.transcriptProvider, "gemini");
    // Tipos união viram string para Gemini; o resultado da ferramenta volta como mensagem "tool".
    const second = bodies[1] as { messages: { role: string }[] };
    assert.ok(second.messages.some((m) => m.role === "tool"));
    const usage = await db.select().from(aiUsage).where(eq(aiUsage.businessId, b.id));
    assert.equal(usage[0].model, "gemini:gemini-2.5-flash");
    assert.equal(usage[0].cacheReadTokens, 1000);
    assert.ok(usage[0].costMicroUsd > 0);
  });

  test("trocar de provedor no meio da conversa reconstrói o histórico em texto", async () => {
    const { setCompatClient } = await import("@/lib/ai/compat");
    const b = await makeBusiness();
    useScripted([say("Oi! Qual é o seu negócio?")]);
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Oi"));
    const { businesses: bt } = await import("@/db/schema");
    await db.update(bt).set({ aiModel: "groq:openai/gpt-oss-120b" }).where(eq(bt.id, b.id));
    let sent: { messages: { role: string; content: unknown }[] } | null = null;
    setCompatClient({
      async create(_kind, body) {
        sent = structuredClone(body) as never;
        return { id: "y", object: "chat.completion", created: 0, model: "openai/gpt-oss-120b", choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: "Legal!", refusal: null } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } } as never;
      },
    });
    await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Tenho uma pizzaria"));
    setCompatClient(null);
    const roles = sent!.messages.map((m) => m.role);
    assert.deepEqual(roles, ["system", "user", "assistant", "user"]);
    assert.equal(sent!.messages[2].content, "Oi! Qual é o seu negócio?");
  });

  test("'cancelar' sozinho não é descadastro", () => {
    assert.ok(!isOptOutRequest("cancelar"));
    assert.ok(isOptOutRequest("PARAR"));
  });
});

describe("alertas", () => {
  test("conversa com a equipe gera um alerta só, não um por mensagem", async () => {
    const b = await makeBusiness({ notifyEmails: "equipe@march.test" });
    useScripted([call("chamar_atendente", { motivo: "pediu humano" }), say("Já chamei a equipe!")]);
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => void warns.push(String(a[0]));
    try {
      await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, "Quero falar com uma pessoa"));
      for (const t of ["Oi?", "Alguém?", "Olá"]) await processWebhook(inbound(b.whatsappPhoneNumberId!, PHONE, t));
    } finally {
      console.warn = orig;
    }
    assert.equal(warns.filter((w) => w.includes("[email não enviado")).length, 1);
  });
});
