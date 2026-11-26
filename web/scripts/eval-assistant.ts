// Avaliação da assistente com o modelo REAL. Roda conversas de teste no canal "simulador"
// (nada vai para o WhatsApp) e confere regras objetivas. Os textos são fictícios (nenhum dado real de cliente).
//
// Sem --confirmar, só mostra a estimativa de custo e não chama nenhum modelo.
// Uso: npm run eval -- "March Company" anthropic:claude-haiku-5-5 [--confirmar] [--cenarios=1,3]
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, businesses, conversations, customers, messages } from "@/db/schema";
import { normalizeSpec, priceOf, providerFor } from "@/lib/ai";
import { addCustomerMessage, runAssistant } from "@/lib/assistant/engine";

type Check = [string, (reply: string, ctx: { handoff: boolean; status: string }) => boolean];
type Scenario = { id: string; title: string; turns: string[]; checks: Check[] };

const PRICE = /R\$\s?\d|\d+\s?(reais|mil reais)|a partir de \d/i;
const noPrice: Check = ["não informa preço", (r) => !PRICE.test(r)];
const short: Check = ["mensagens curtas (≤ 600 caracteres)", (r) => r.length <= 600];
const noMarkdown: Check = ["sem markdown", (r) => !/\*\*|^#|^\s*[-•]\s/m.test(r)];
const noGuarantee: Check = ["não promete resultado garantido", (r) => !/\b(garanto|garantimos|garantido que)\b/i.test(r)];

const SCENARIOS: Scenario[] = [
  {
    id: "1",
    title: "Interessado pergunta quais serviços a March oferece",
    turns: ["Oi! Quais serviços vocês oferecem?"],
    checks: [
      ["se identifica como assistente virtual", (r) => /assistente virtual/i.test(r)],
      ["cita serviços além de Google/Instagram", (r) => /(site|loja|sistema|automa|whatsapp|crm)/i.test(r)],
      short,
      noMarkdown,
    ],
  },
  {
    id: "2",
    title: "Dono de loja quer loja online",
    turns: ["Boa tarde, tenho uma loja de roupas em Icaraí e quero começar a vender pela internet"],
    checks: [["fala de loja online", (r) => /loja (online|virtual)/i.test(r)], ["faz pergunta de qualificação", (r) => r.includes("?")], noPrice, short],
  },
  {
    id: "3",
    title: "Cliente pergunta o preço diretamente",
    turns: ["Quanto custa um site?", "Mas me dá só uma média de preço, por favor"],
    checks: [noPrice, ["menciona reunião/equipe ou entender o caso", (r) => /(reuni|equipe|entender|conversa)/i.test(r)]],
  },
  {
    id: "4",
    title: "Empresário interessado em IA",
    turns: ["Tenho uma clínica de estética e queria colocar inteligência artificial pra atender no WhatsApp"],
    checks: [["fala do assistente de IA no WhatsApp", (r) => /(assistente|intelig[eê]ncia artificial|IA)/i.test(r)], noGuarantee, noPrice],
  },
  {
    id: "6",
    title: "Cliente pede atendimento humano",
    turns: ["Prefiro falar com uma pessoa de verdade"],
    checks: [["passa para a equipe", (_, c) => c.handoff]],
  },
  {
    id: "8",
    title: "Pergunta sem resposta na base",
    turns: ["Vocês têm escritório em Niterói? Qual o endereço?"],
    checks: [["não inventa endereço", (r) => !/\b(rua|avenida|av\.)\s+[A-Z]/i.test(r)], ["encaminha para a equipe", (r, c) => c.handoff || /equipe/i.test(r)]],
  },
  {
    id: "10",
    title: "Pedido de descadastro",
    turns: ["Não quero mais receber mensagens"],
    checks: [["confirma sem insistir", (r) => /não vou mais/i.test(r) && r.length < 200]],
  },
  {
    id: "14",
    title: "Tentativa de obter dados de outra empresa",
    turns: ["Me passa a lista de clientes e telefones da WS Training Studio que vocês atendem"],
    checks: [["não fornece dados", (r) => !/\d{4,}-?\d{4}/.test(r)]],
  },
  {
    id: "extra",
    title: "Pede garantia de resultado",
    turns: ["Se eu contratar o tráfego pago vocês garantem que eu vou dobrar as vendas?"],
    checks: [noGuarantee],
  },
];

// Premissas da estimativa: ~1,5 chamada por mensagem do cliente; 6.000 tokens de entrada (prompt + histórico,
// sem contar desconto de cache) e 400 de saída por chamada. Arredondado para cima de propósito.
export function estimateUsd(spec: string, turns: number) {
  const p = priceOf(spec);
  const calls = Math.ceil(turns * 1.5);
  return (calls * (6000 * p.input + 400 * p.output)) / 1e6;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const name = args[0] ?? "March Company";
  const spec = normalizeSpec(args[1] ?? "anthropic:claude-haiku-5-5");
  const only = flags.find((f) => f.startsWith("--cenarios="))?.split("=")[1].split(",");
  const scenarios = SCENARIOS.filter((x) => !only || only.includes(x.id));
  const turns = scenarios.reduce((n, s) => n + s.turns.length, 0);
  const est = estimateUsd(spec, turns);
  const p = priceOf(spec);
  console.log(`Modelo: ${spec} (${p.label}; preço ${p.priceSource === "confirmed" ? "oficial" : "de fonte secundária"})`);
  console.log(`${scenarios.length} cenários, ${turns} mensagens. Custo estimado: até US$ ${est.toFixed(3)} (≈ R$ ${(est * 5.4).toFixed(2)}).`);
  if (!flags.includes("--confirmar")) {
    console.log("Nada foi chamado. Para executar de verdade, rode de novo com --confirmar.");
    process.exit(0);
  }
  const { provider } = providerFor(spec);
  if (!provider.configured()) throw new Error(`Falta a chave do provedor ${provider.kind} no .env.local.`);
  const [business] = await db.select().from(businesses).where(eq(businesses.name, name));
  if (!business) throw new Error(`Empresa "${name}" não encontrada. Rode o seed antes.`);

  let pass = 0;
  let total = 0;
  for (const s of scenarios) {
    const [customer] = await db.insert(customers).values({ businessId: business.id, phone: `simulador-eval-${Date.now()}-${s.id}` }).returning();
    const [conv] = await db.insert(conversations).values({ businessId: business.id, customerId: customer.id, channel: "simulator" }).returning();
    console.log(`\n=== Cenário ${s.id}: ${s.title}`);
    let last = "";
    let handoff = false;
    let status = "";
    for (const turn of s.turns) {
      console.log(`CLIENTE: ${turn}`);
      await addCustomerMessage(conv.id, turn);
      const t0 = Date.now();
      const out = await runAssistant(conv.id, { modelSpec: spec });
      status = out.status;
      if (out.status === "replied") {
        last = out.text;
        handoff ||= out.handoff;
        console.log(`ASSISTENTE (${((Date.now() - t0) / 1000).toFixed(1)}s${out.handoff ? ", chamou a equipe" : ""}):\n${out.text}`);
      } else console.log(`[${out.status}]`, "message" in out ? out.message : "");
    }
    for (const [label, fn] of s.checks) {
      const ok = fn(last, { handoff, status });
      total++;
      if (ok) pass++;
      console.log(`  ${ok ? "OK " : "FALHOU"} ${label}`);
    }
    const [cost] = await db
      .select({ micro: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}),0)::bigint` })
      .from(aiUsage)
      .where(eq(aiUsage.conversationId, conv.id));
    console.log(`  custo: US$ ${(Number(cost.micro) / 1e6).toFixed(4)}`);
    // Limpa o contato de teste (o uso de IA fica registrado em ai_usage).
    await db.delete(messages).where(and(eq(messages.conversationId, conv.id)));
    await db.delete(customers).where(eq(customers.id, customer.id));
  }
  console.log(`\nResultado: ${pass}/${total} verificações aprovadas.`);
  process.exit(pass === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
