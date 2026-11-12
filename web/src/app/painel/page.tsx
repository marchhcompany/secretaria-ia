import Link from "next/link";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { appointments, businessHours, conversations, services } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { appointmentList } from "@/lib/queries";
import { daysAgo, formatLong } from "@/lib/time";
import { Empty, PageHeader, StatusPill } from "./ui";

export default async function VisaoGeral() {
  const { business } = await requireBusiness();
  const tz = business.timezone;
  const since = daysAgo(30);
  const now = daysAgo(0);
  const total = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);

  const [upcoming, convCount, assistantCount, attention, serviceCount, hourCount] = await Promise.all([
    appointmentList(business.id, { from: now, active: true, limit: 8 }),
    total(
      db
        .select({ n: count() })
        .from(conversations)
        .where(and(eq(conversations.businessId, business.id), gte(conversations.createdAt, since))),
    ),
    total(
      db
        .select({ n: count() })
        .from(appointments)
        .where(
          and(eq(appointments.businessId, business.id), eq(appointments.source, "assistant"), gte(appointments.createdAt, since)),
        ),
    ),
    total(
      db
        .select({ n: count() })
        .from(conversations)
        .where(and(eq(conversations.businessId, business.id), eq(conversations.needsAttention, true))),
    ),
    total(
      db
        .select({ n: count() })
        .from(services)
        .where(and(eq(services.businessId, business.id), eq(services.active, true))),
    ),
    total(db.select({ n: count() }).from(businessHours).where(eq(businessHours.businessId, business.id))),
  ]);

  const stats = [
    { value: convCount, label: "conversas (30 dias)" },
    { value: assistantCount, label: "agendamentos feitos pela assistente (30 dias)" },
    { value: attention, label: "conversas esperando a equipe" },
  ];

  const setup = [
    { done: serviceCount > 0, label: "Cadastrar serviços e preços", href: "/painel/servicos" },
    { done: hourCount > 0, label: "Definir horários de funcionamento", href: "/painel/horarios" },
    { done: !!business.about, label: "Descrever o negócio para a assistente", href: "/painel/assistente" },
    { done: !!process.env.ANTHROPIC_API_KEY, label: "Ativar a inteligência artificial (chave da API)", href: "/painel/simulador" },
    { done: !!business.whatsappPhoneNumberId, label: "Conectar o WhatsApp", href: "/painel/assistente" },
  ];

  return (
    <>
      <PageHeader title="Visão geral" />

      <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="grid gap-1 bg-surface p-4">
            <b className="font-display text-3xl tabular-nums">{s.value}</b>
            <span className="text-sm text-muted">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card grid content-start gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Próximos agendamentos</h2>
            <Link href="/painel/agenda" className="text-sm font-semibold text-accent">
              Ver agenda
            </Link>
          </div>
          {upcoming.length ? (
            <ul className="grid divide-y divide-line">
              {upcoming.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <strong className="block">{a.customerName || a.customerPhone}</strong>
                    <span className="text-sm text-muted">
                      {a.serviceName ?? "Serviço"} · {formatLong(a.startsAt, tz)}
                      {a.staffName ? ` · ${a.staffName}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.source === "assistant" && <span className="text-xs font-semibold text-accent">pela assistente</span>}
                    <StatusPill status={a.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum agendamento futuro. Teste a assistente para ver um aparecer aqui.</Empty>
          )}
        </section>

        <section className="card grid content-start gap-3">
          <h2 className="font-semibold">Configuração</h2>
          <ul className="grid gap-2">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border text-[10px] ${
                      s.done ? "border-accent bg-accent text-on-accent" : "border-line"
                    }`}
                  >
                    {s.done ? "✓" : ""}
                  </span>
                  <span className={s.done ? "text-muted line-through" : ""}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
