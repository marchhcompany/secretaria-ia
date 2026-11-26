import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, conversations, customers, messages } from "@/db/schema";
import { monthSpendMicroUsd } from "@/lib/assistant/engine";
import { requireBusiness } from "@/lib/business";
import { PageHeader } from "../ui";

// Câmbio só para exibição. Ajuste USD_BRL no servidor.
const USD_BRL = Number(process.env.USD_BRL || 5.4);
// Tabela da Meta para o Brasil (a partir de 01/10/2026): conferir em developers.facebook.com antes de usar em contrato.
const META_BRL = { marketing: 0.3217, utility: 0.035, service: 0.035, freeService: 1000 };

const usd = (micro: number) => `US$ ${(micro / 1e6).toFixed(2)}`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function CustosPage() {
  const { business } = await requireBusiness();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [spent, [stats], byModel, top, [wa]] = await Promise.all([
    monthSpendMicroUsd(business.id, now),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        conversations: sql<number>`count(distinct ${aiUsage.conversationId})::int`,
        input: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::bigint`,
        output: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::bigint`,
        cacheRead: sql<number>`coalesce(sum(${aiUsage.cacheReadTokens}),0)::bigint`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.businessId, business.id), gte(aiUsage.createdAt, start))),
    db
      .select({ model: aiUsage.model, micro: sql<number>`sum(${aiUsage.costMicroUsd})::bigint`, calls: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(and(eq(aiUsage.businessId, business.id), gte(aiUsage.createdAt, start)))
      .groupBy(aiUsage.model),
    db
      .select({
        id: aiUsage.conversationId,
        micro: sql<number>`sum(${aiUsage.costMicroUsd})::bigint`,
        name: sql<string>`max(${customers.name})`,
        phone: sql<string>`max(${customers.phone})`,
      })
      .from(aiUsage)
      .innerJoin(conversations, eq(conversations.id, aiUsage.conversationId))
      .innerJoin(customers, eq(customers.id, conversations.customerId))
      .where(and(eq(aiUsage.businessId, business.id), gte(aiUsage.createdAt, start)))
      .groupBy(aiUsage.conversationId)
      .orderBy(desc(sql`sum(${aiUsage.costMicroUsd})`))
      .limit(10),
    db
      .select({
        service: sql<number>`count(*) filter (where ${messages.source} not like 'automation:%')::int`,
        automation: sql<number>`count(*) filter (where ${messages.source} like 'automation:%')::int`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.businessId, business.id),
          gte(messages.createdAt, start),
          sql`${messages.role} in ('assistant','staff')`,
          sql`${messages.deliveryStatus} in ('sent','delivered','read')`,
        ),
      ),
  ]);

  const avg = stats.conversations ? spent / stats.conversations : 0;
  const metaService = Math.max(0, (wa?.service ?? 0) - META_BRL.freeService) * META_BRL.service;
  const budget = business.aiMonthlyBudgetCents * 10_000;

  return (
    <>
      <PageHeader title="Custos">
        Custo de IA medido a cada chamada (tokens reais × preço oficial da Anthropic). O custo da Meta é uma estimativa a partir das mensagens
        enviadas: a cobrança oficial está no Gerenciador do WhatsApp.
      </PageHeader>
      <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Stat value={usd(spent)} label={`IA no mês (≈ ${brl((spent / 1e6) * USD_BRL)})`} />
        <Stat value={String(stats.conversations)} label="conversas com IA no mês" />
        <Stat value={usd(avg)} label="custo médio de IA por conversa" />
        <Stat value={budget ? `${Math.round((spent / budget) * 100)}%` : "sem teto"} label={budget ? `do teto de ${usd(budget)}` : "teto mensal de IA"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card grid content-start gap-2 text-sm">
          <h2 className="font-semibold">IA por modelo</h2>
          {byModel.map((m) => (
            <p key={m.model} className="flex justify-between">
              <span>{m.model} · {m.calls} chamadas</span>
              <b>{usd(Number(m.micro))}</b>
            </p>
          ))}
          <p className="text-muted">
            Tokens: {Number(stats.input).toLocaleString("pt-BR")} de entrada, {Number(stats.cacheRead).toLocaleString("pt-BR")} lidos do cache,{" "}
            {Number(stats.output).toLocaleString("pt-BR")} de saída.
          </p>
        </section>

        <section className="card grid content-start gap-2 text-sm">
          <h2 className="font-semibold">WhatsApp (estimativa)</h2>
          <p className="flex justify-between">
            <span>Mensagens de atendimento enviadas</span>
            <b>{wa?.service ?? 0}</b>
          </p>
          <p className="flex justify-between">
            <span>Mensagens de automação enviadas</span>
            <b>{wa?.automation ?? 0}</b>
          </p>
          <p className="flex justify-between">
            <span>Atendimento acima das {META_BRL.freeService} gratuitas</span>
            <b>{brl(metaService)}</b>
          </p>
          <p className="text-muted">
            Templates de marketing: {brl(META_BRL.marketing)} cada; utilidade: {brl(META_BRL.utility)} (tabela Brasil, out/2026, a confirmar no painel da
            Meta).
          </p>
        </section>

        <section className="card grid content-start gap-2 text-sm lg:col-span-2">
          <h2 className="font-semibold">Conversas que mais custaram no mês</h2>
          {top.map((t) => (
            <a key={t.id} href={`/painel/conversas/${t.id}`} className="flex justify-between hover:text-accent">
              <span>{t.name || t.phone}</span>
              <b>{usd(Number(t.micro))}</b>
            </a>
          ))}
          {!top.length && <p className="text-muted">Nenhum uso de IA neste mês.</p>}
        </section>
      </div>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid gap-1 bg-surface p-4">
      <b className="font-display text-2xl tabular-nums">{value}</b>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
