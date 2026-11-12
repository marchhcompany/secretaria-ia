import { and, asc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { appointments, customers, services, staff } from "@/db/schema";

/** Agendamentos com nome do cliente, serviço e profissional. */
export async function appointmentList(businessId: string, filters: { from?: Date; to?: Date; active?: boolean; limit?: number }) {
  const where: SQL[] = [eq(appointments.businessId, businessId)];
  if (filters.from) where.push(gte(appointments.startsAt, filters.from));
  if (filters.to) where.push(lt(appointments.startsAt, filters.to));
  if (filters.active) where.push(inArray(appointments.status, ["scheduled", "confirmed"]));

  const query = db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      source: appointments.source,
      notes: appointments.notes,
      customerName: customers.name,
      customerPhone: customers.phone,
      serviceName: services.name,
      staffName: staff.name,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .leftJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(staff, eq(staff.id, appointments.staffId))
    .where(and(...where))
    .orderBy(asc(appointments.startsAt));
  return filters.limit ? query.limit(filters.limit) : query;
}
