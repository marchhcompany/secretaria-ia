import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, conversations, customers, messages } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { localTime } from "@/lib/time";
import { insideServiceWindow } from "@/lib/whatsapp/client";
import { markConversationSeen, sendStaffMessage, setConversationMode } from "../../actions";
import { Bubble } from "../../simulador/bubble";
import { INTEREST, STAGE } from "../../leads/labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversaPage({ params }: PageProps<"/painel/conversas/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { business } = await requireBusiness();

  const [row] = await db
    .select({ conv: conversations, customer: customers })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .where(and(eq(conversations.id, id), eq(conversations.businessId, business.id)));
  if (!row) notFound();
  const { conv, customer } = row;

  const [rows, [cost]] = await Promise.all([
    db.select().from(messages).where(and(eq(messages.conversationId, id), eq(messages.businessId, business.id))).orderBy(asc(messages.createdAt)),
    db
      .select({ micro: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}),0)::bigint`, calls: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(and(eq(aiUsage.conversationId, id), eq(aiUsage.businessId, business.id))),
  ]);
  const human = conv.mode === "human";
  const whatsapp = conv.channel === "whatsapp";
  const windowOpen = insideServiceWindow(customer.lastInboundAt);
  const title = customer.name || (conv.channel === "simulator" ? "Teste no simulador" : customer.phone);

  return (
    <div className="grid gap-4">
      <Link href="/painel/conversas" className="text-sm font-semibold text-accent">
        ← Conversas
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">{title}</h1>
          <p className="text-sm text-muted">{conv.channel === "simulator" ? "Conversa de teste" : customer.phone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {conv.needsAttention && (
            <form action={markConversationSeen}>
              <input type="hidden" name="id" value={conv.id} />
              <button className="btn-ghost">Marcar como vista</button>
            </form>
          )}
          <form action={setConversationMode}>
            <input type="hidden" name="id" value={conv.id} />
            <input type="hidden" name="mode" value={human ? "assistant" : "human"} />
            <button className={human ? "btn" : "btn-ghost"}>{human ? "Retomar a IA" : "Assumir e pausar a IA"}</button>
          </form>
        </div>
      </div>

      <div className={`rounded-lg px-4 py-3 text-sm ${human ? "bg-warm-soft" : "bg-accent-soft"}`}>
        {human
          ? `A IA está pausada nesta conversa${conv.handoffReason ? ` (${conv.handoffReason})` : ""}. Só a equipe responde até você retomar a IA.`
          : "A assistente (IA) está respondendo esta conversa. Ao enviar uma mensagem como equipe, a IA é pausada automaticamente."}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid content-start gap-3">
          <div className="flex flex-col gap-1.5 rounded-xl bg-chat p-4">
            {rows.map((m) => (
              <Bubble
                key={m.id}
                role={m.role}
                content={m.content}
                time={localTime(m.createdAt, business.timezone)}
                status={whatsapp ? m.deliveryStatus : null}
                source={m.source}
              />
            ))}
          </div>
          <form action={sendStaffMessage} className="flex gap-2">
            <input type="hidden" name="id" value={conv.id} />
            <input id="staff-msg" name="content" required placeholder="Responder como equipe" className="input" aria-label="Mensagem" />
            <button className="btn">Enviar</button>
          </form>
          {whatsapp && (
            <p className="text-xs text-muted">
              {windowOpen
                ? "Janela de 24 horas aberta: pode responder com texto livre."
                : "Janela de 24 horas fechada: o WhatsApp só aceita templates aprovados até o cliente escrever de novo."}
            </p>
          )}
        </div>

        <aside className="card grid content-start gap-3 text-sm">
          <h2 className="font-semibold">Lead</h2>
          <dl className="grid gap-2">
            <Info k="Etapa" v={STAGE[customer.leadStage]} />
            <Info k="Interesse" v={INTEREST[customer.interest]} />
            <Info k="Negócio" v={customer.businessType || "—"} />
            <Info k="Necessidade" v={customer.need || "—"} />
            <Info k="Resumo" v={conv.summary || customer.summary || "—"} />
            <Info k="Mensagens" v={customer.optedOut ? "Pediu para não receber" : customer.marketingConsent ? "Aceita marketing" : "Sem consentimento de marketing"} />
            <Info k="Custo de IA" v={`US$ ${(Number(cost?.micro ?? 0) / 1e6).toFixed(4)} em ${cost?.calls ?? 0} chamadas`} />
          </dl>
          <Link href={`/painel/leads?c=${customer.id}`} className="font-semibold text-accent">
            Editar lead
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
      <dd className="whitespace-pre-line">{v}</dd>
    </div>
  );
}
