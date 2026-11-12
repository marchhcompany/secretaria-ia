import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, customers, messages } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { localTime } from "@/lib/time";
import { sendStaffMessage, setConversationMode } from "../../actions";
import { Bubble } from "../../simulador/bubble";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversaPage({ params }: PageProps<"/painel/conversas/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { business } = await requireBusiness();

  const [conv] = await db
    .select({
      id: conversations.id,
      mode: conversations.mode,
      needsAttention: conversations.needsAttention,
      channel: conversations.channel,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .where(and(eq(conversations.id, id), eq(conversations.businessId, business.id)));
  if (!conv) notFound();

  const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));

  return (
    <div className="grid gap-4">
      <Link href="/painel/conversas" className="text-sm font-semibold text-accent">
        ← Conversas
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">{conv.customerName || (conv.channel === "simulator" ? "Teste no simulador" : conv.customerPhone)}</h1>
          <p className="text-sm text-muted">{conv.channel === "simulator" ? "Conversa de teste" : conv.customerPhone}</p>
        </div>
        <form action={setConversationMode}>
          <input type="hidden" name="id" value={conv.id} />
          <input type="hidden" name="mode" value={conv.mode === "human" ? "assistant" : "human"} />
          <button className="btn-ghost">{conv.mode === "human" ? "Devolver para a assistente" : "Assumir a conversa"}</button>
        </form>
      </div>

      {conv.needsAttention && (
        <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">
          A assistente passou esta conversa para a equipe e parou de responder. Responda abaixo ou devolva para a assistente.
        </p>
      )}

      <div className="flex flex-col gap-1.5 rounded-xl bg-chat p-4">
        {rows.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} time={localTime(m.createdAt, business.timezone)} />
        ))}
      </div>

      <form action={sendStaffMessage} className="flex gap-2">
        <input type="hidden" name="id" value={conv.id} />
        <input id="staff-msg" name="content" required placeholder="Responder como equipe" className="input" aria-label="Mensagem" />
        <button className="btn">Enviar</button>
      </form>
      {conv.channel !== "simulator" && (
        <p className="text-xs text-muted">
          A mensagem vai pelo WhatsApp e a assistente para de responder nesta conversa até você devolver para ela.
        </p>
      )}
    </div>
  );
}
