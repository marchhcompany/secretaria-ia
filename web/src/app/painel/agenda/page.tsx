import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { services, staff } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { appointmentList } from "@/lib/queries";
import { addDays, localDate, localTime, zonedToUtc } from "@/lib/time";
import { setAppointmentStatus } from "../actions";
import { Empty, PageHeader, StatusPill } from "../ui";
import { ManualBooking } from "./manual-booking";

const ACTIONS = [
  ["confirmed", "Confirmar"],
  ["done", "Atendido"],
  ["no_show", "Faltou"],
  ["canceled", "Cancelar"],
] as const;

export default async function AgendaPage({ searchParams }: PageProps<"/painel/agenda">) {
  const { business } = await requireBusiness();
  const tz = business.timezone;
  const params = await searchParams;
  const today = localDate(new Date(), tz);
  const day = typeof params.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.dia) ? params.dia : today;

  const [appts, serviceRows, staffRows] = await Promise.all([
    appointmentList(business.id, { from: zonedToUtc(day, "00:00", tz), to: zonedToUtc(addDays(day, 1), "00:00", tz) }),
    db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(and(eq(services.businessId, business.id), eq(services.active, true)))
      .orderBy(asc(services.name)),
    db
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(and(eq(staff.businessId, business.id), eq(staff.active, true)))
      .orderBy(asc(staff.name)),
  ]);

  const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" }).format(
    new Date(`${day}T12:00:00Z`),
  );

  return (
    <>
      <PageHeader title="Agenda" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className="btn-ghost" href={`/painel/agenda?dia=${addDays(day, -1)}`} aria-label="Dia anterior">
          ←
        </Link>
        <Link className="btn-ghost" href="/painel/agenda">
          Hoje
        </Link>
        <Link className="btn-ghost" href={`/painel/agenda?dia=${addDays(day, 1)}`} aria-label="Próximo dia">
          →
        </Link>
        <form className="flex gap-2">
          <input type="date" name="dia" defaultValue={day} className="input w-auto py-1.5" aria-label="Escolher dia" />
          <button className="btn-ghost">Ir</button>
        </form>
        <h2 className="ml-auto font-semibold capitalize">{label}</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card">
          {appts.length ? (
            <ul className="grid divide-y divide-line">
              {appts.map((a) => (
                <li key={a.id} className="grid gap-2 py-3 sm:grid-cols-[90px_minmax(0,1fr)_auto] sm:items-center">
                  <span className="font-mono text-sm tabular-nums text-muted">
                    {localTime(a.startsAt, tz)}–{localTime(a.endsAt, tz)}
                  </span>
                  <div className="min-w-0">
                    <strong className="block">{a.customerName || "Cliente sem nome"}</strong>
                    <span className="text-sm text-muted">
                      {a.serviceName ?? "Serviço"}
                      {a.staffName ? ` · ${a.staffName}` : ""} · {a.customerPhone}
                      {a.source === "assistant" ? " · pela assistente" : ""}
                    </span>
                    {a.notes && <p className="text-sm">{a.notes}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill status={a.status} />
                    {a.status !== "canceled" &&
                      ACTIONS.filter(([s]) => s !== a.status).map(([s, l]) => (
                        <form key={s} action={setAppointmentStatus}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value={s} />
                          <button className={s === "canceled" ? "btn-danger" : "btn-ghost"}>{l}</button>
                        </form>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum agendamento neste dia.</Empty>
          )}
        </section>

        <ManualBooking day={day} services={serviceRows} staff={staffRows} />
      </div>
    </>
  );
}
