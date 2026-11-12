import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, customers } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { formatLong } from "@/lib/time";
import { Empty, PageHeader } from "../ui";

export default async function ConversasPage() {
  const { business } = await requireBusiness();
  const rows = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      mode: conversations.mode,
      needsAttention: conversations.needsAttention,
      lastMessageAt: conversations.lastMessageAt,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .where(eq(conversations.businessId, business.id))
    .orderBy(desc(conversations.needsAttention), desc(conversations.lastMessageAt))
    .limit(100);

  return (
    <>
      <PageHeader title="Conversas">
        Tudo o que a assistente conversou. As que ela passou para a equipe aparecem primeiro.
      </PageHeader>
      {rows.length ? (
        <ul className="card grid divide-y divide-line p-0">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/painel/conversas/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-bg">
                <div className="min-w-0">
                  <strong className="block">
                    {c.customerName || (c.channel === "simulator" ? "Teste no simulador" : c.customerPhone)}
                  </strong>
                  <span className="text-sm text-muted">{formatLong(c.lastMessageAt, business.timezone)}</span>
                </div>
                <div className="flex gap-2">
                  {c.channel === "simulator" && <span className="rounded-full bg-bg px-2.5 py-0.5 text-xs text-muted">teste</span>}
                  {c.needsAttention ? (
                    <span className="rounded-full bg-warm-soft px-2.5 py-0.5 text-xs font-semibold text-warm">precisa da equipe</span>
                  ) : c.mode === "human" ? (
                    <span className="rounded-full bg-bg px-2.5 py-0.5 text-xs font-semibold text-ink">com a equipe</span>
                  ) : (
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">assistente</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nenhuma conversa ainda.</Empty>
      )}
    </>
  );
}
