import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { appointments, businessHours, services, staff, type Appointment, type Business } from "@/db/schema";
import { addDays, fromMinutes, toMinutes, weekdayOf, zonedToUtc } from "@/lib/time";

const SLOT_STEP_MIN = 30;
const MIN_NOTICE_MIN = 30;

export type Slot = { time: string; staffIds: string[] };

/**
 * Horários livres de um serviço numa data local.
 * Sem profissionais cadastrados, o negócio atende um cliente por vez.
 * Com profissionais, um horário está livre se pelo menos um deles estiver livre.
 */
export async function freeSlots(
  business: Business,
  serviceId: string,
  date: string,
  staffId?: string | null,
): Promise<Slot[]> {
  const tz = business.timezone;
  const [[service], hours, team] = await Promise.all([
    db.select().from(services).where(and(eq(services.id, serviceId), eq(services.businessId, business.id))),
    db
      .select()
      .from(businessHours)
      .where(and(eq(businessHours.businessId, business.id), eq(businessHours.weekday, weekdayOf(date)))),
    db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, business.id), eq(staff.active, true))),
  ]);
  if (!service || !service.active || !hours.length) return [];
  if (staffId && !team.some((s) => s.id === staffId)) return [];

  const dayStart = zonedToUtc(date, "00:00", tz);
  const dayEnd = zonedToUtc(addDays(date, 1), "00:00", tz);
  const appts = await db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, staffId: appointments.staffId })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, business.id),
        ne(appointments.status, "canceled"),
        lt(appointments.startsAt, dayEnd),
        gt(appointments.endsAt, dayStart),
      ),
    );

  const busy = appts.map((a) => ({ start: a.startsAt.getTime(), end: a.endsAt.getTime(), staffId: a.staffId }));
  const pool: (string | null)[] = staffId ? [staffId] : team.length ? team.map((s) => s.id) : [null];

  const earliest = Date.now() + MIN_NOTICE_MIN * 60_000;
  const duration = service.durationMin;
  const slots: Slot[] = [];

  for (const h of hours.sort((a, b) => a.opens.localeCompare(b.opens))) {
    const open = toMinutes(h.opens);
    const close = toMinutes(h.closes);
    for (let m = open; m + duration <= close; m += SLOT_STEP_MIN) {
      const start = zonedToUtc(date, fromMinutes(m), tz).getTime();
      const end = start + duration * 60_000;
      if (start < earliest) continue;
      const freeStaff = pool.filter(
        (sid) =>
          !busy.some(
            (b) => (sid === null || b.staffId === null || b.staffId === sid) && b.start < end && b.end > start,
          ),
      );
      if (freeStaff.length) slots.push({ time: fromMinutes(m), staffIds: freeStaff.filter((s): s is string => !!s) });
    }
  }
  return slots;
}

export type BookResult = { ok: true; appointment: Appointment } | { ok: false; reason: string };

export async function book(
  business: Business,
  args: {
    customerId: string;
    serviceId: string;
    date: string;
    time: string;
    staffId?: string | null;
    source: "assistant" | "manual";
    notes?: string;
  },
): Promise<BookResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || !/^\d{2}:\d{2}$/.test(args.time))
    return { ok: false, reason: "Data ou hora inválida." };

  const slots = await freeSlots(business, args.serviceId, args.date, args.staffId);
  const slot = slots.find((s) => s.time === args.time);
  if (!slot) return { ok: false, reason: "Esse horário não está disponível." };

  const [service] = await db.select({ durationMin: services.durationMin }).from(services).where(eq(services.id, args.serviceId));
  const startsAt = zonedToUtc(args.date, args.time, business.timezone);
  const endsAt = new Date(startsAt.getTime() + (service?.durationMin ?? 60) * 60_000);

  const [appointment] = await db
    .insert(appointments)
    .values({
      businessId: business.id,
      customerId: args.customerId,
      serviceId: args.serviceId,
      staffId: args.staffId ?? slot.staffIds[0] ?? null,
      startsAt,
      endsAt,
      source: args.source,
      notes: args.notes ?? "",
    })
    .returning();
  return { ok: true, appointment };
}
