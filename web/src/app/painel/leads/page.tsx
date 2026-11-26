import Link from "next/link";
import { and, desc, eq, not, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { LEAD_STAGES, conversations, customers } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { formatLong } from "@/lib/time";
import { saveLead } from "../actions";
import { Empty, PageHeader } from "../ui";
import { INTEREST, STAGE } from "./labels";

const INTEREST_CLS: Record<string, string> = {
  quente: "bg-warm-soft text-warm",
  morno: "bg-accent-soft text-accent",
  frio: "bg-bg text-muted",
  desconhecido: "bg-bg text-muted",
};

export default async function LeadsPage({ searchParams }: PageProps<"/painel/leads">) {
  const { business } = await requireBusiness();
  const sp = await searchParams;
  const stage = LEAD_STAGES.find((s) => s === sp.etapa);
  const open = typeof sp.c === "string" ? sp.c : "";

  const rows = await db
    .select({
      c: customers,
      lastConversation: sql<string | null>`(select id from ${conversations} where ${conversations.customerId} = ${customers.id} order by ${conversations.lastMessageAt} desc limit 1)`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, business.id),
        not(like(customers.phone, "simulador-%")),
        stage ? eq(customers.leadStage, stage) : undefined,
      ),
    )
    .orderBy(desc(sql`coalesce(${customers.lastInboundAt}, ${customers.createdAt})`))
    .limit(200);

  return (
    <>
      <PageHeader title="Leads">
        Contatos que falaram com o negócio. Etapa, interesse e resumo são preenchidos pela assistente durante a conversa e podem ser ajustados aqui.
      </PageHeader>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/painel/leads" className={`rounded-full px-3 py-1 ${!stage ? "bg-accent-soft font-semibold" : "bg-bg"}`}>
          Todos
        </Link>
        {LEAD_STAGES.map((s) => (
          <Link key={s} href={`/painel/leads?etapa=${s}`} className={`rounded-full px-3 py-1 ${stage === s ? "bg-accent-soft font-semibold" : "bg-bg"}`}>
            {STAGE[s]}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <ul className="card grid divide-y divide-line p-0">
          {rows.map(({ c, lastConversation }) => (
            <li key={c.id} className="px-5 py-3">
              <details open={open === c.id}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="block">{c.name || c.phone}</strong>
                    <span className="text-sm text-muted">
                      {c.businessType ? `${c.businessType} · ` : ""}
                      {c.lastInboundAt ? `última mensagem ${formatLong(c.lastInboundAt, business.timezone)}` : "sem mensagens"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-bg px-2.5 py-0.5">{STAGE[c.leadStage]}</span>
                    <span className={`rounded-full px-2.5 py-0.5 ${INTEREST_CLS[c.interest]}`}>{INTEREST[c.interest]}</span>
                    {c.optedOut && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-danger">descadastrado</span>}
                  </div>
                </summary>
                <div className="mt-3 grid gap-3 text-sm">
                  {c.need && <p><b>Necessidade:</b> {c.need}</p>}
                  {c.summary && <p><b>Resumo:</b> {c.summary}</p>}
                  {lastConversation && (
                    <Link href={`/painel/conversas/${lastConversation}`} className="font-semibold text-accent">
                      Abrir conversa
                    </Link>
                  )}
                  <form action={saveLead} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} />
                    <label className="label">
                      Nome
                      <input name="name" defaultValue={c.name} className="input" />
                    </label>
                    <label className="label">
                      Etapa
                      <select name="lead_stage" defaultValue={c.leadStage} className="input">
                        {LEAD_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="label sm:col-span-2">
                      Anotações da equipe
                      <textarea name="notes" rows={2} defaultValue={c.notes} className="input" />
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" name="marketing_consent" defaultChecked={c.marketingConsent} className="mt-1" />
                      <span>Aceitou receber mensagens de marketing (necessário para reativação)</span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" name="opted_out" defaultChecked={c.optedOut} className="mt-1" />
                      <span>Pediu para não receber mensagens (cancela automações)</span>
                    </label>
                    <div>
                      <button className="btn">Salvar</button>
                    </div>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nenhum lead ainda. Eles aparecem aqui quando alguém escreve no WhatsApp.</Empty>
      )}
    </>
  );
}
