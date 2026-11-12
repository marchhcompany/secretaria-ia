// Teste rápido de ponta a ponta no banco: cria o negócio da conta de teste, consulta horários e agenda.
// Uso: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/smoke-test.ts
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours, businessMembers, businesses, customers, services, user } from "@/db/schema";
import { book, freeSlots } from "@/lib/scheduling";
import { DEFAULT_HOURS, SERVICE_TEMPLATES } from "@/lib/templates";
import { addDays, localDate, formatLong } from "@/lib/time";

async function main() {
  const [u] = await db.select().from(user).where(eq(user.email, "teste@secretaria-ia.test"));
  if (!u) throw new Error("Conta de teste não encontrada");

  let [member] = await db.select().from(businessMembers).where(eq(businessMembers.userId, u.id));
  if (!member) {
    await db.transaction(async (tx) => {
      const [b] = await tx.insert(businesses).values({ name: "Clínica Teste", segment: "estetica" }).returning();
      await tx.insert(businessMembers).values({ businessId: b.id, userId: u.id });
      await tx.insert(services).values(SERVICE_TEMPLATES.estetica.map((s) => ({ ...s, businessId: b.id })));
      await tx.insert(businessHours).values(DEFAULT_HOURS.map((h) => ({ ...h, businessId: b.id })));
    });
    [member] = await db.select().from(businessMembers).where(eq(businessMembers.userId, u.id));
  }
  const [business] = await db.select().from(businesses).where(eq(businesses.id, member.businessId));
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.businessId, business.id), eq(services.name, "Avaliação")));

  // Próximo dia útil (seg a sex)
  let day = addDays(localDate(new Date(), business.timezone), 1);
  while ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) day = addDays(day, 1);

  const before = await freeSlots(business, service.id, day);
  console.log(`Horários livres em ${day}:`, before.map((s) => s.time).join(" "));

  const [customer] = await db
    .insert(customers)
    .values({ businessId: business.id, phone: "5521999990000", name: "Cliente Teste" })
    .onConflictDoUpdate({ target: [customers.businessId, customers.phone], set: { name: "Cliente Teste" } })
    .returning();

  const time = before[2]?.time ?? before[0]?.time;
  const r1 = await book(business, { customerId: customer.id, serviceId: service.id, date: day, time, source: "manual" });
  console.log("Agendar", time, "->", r1.ok ? `ok (${formatLong(r1.appointment.startsAt, business.timezone)})` : r1.reason);

  const r2 = await book(business, { customerId: customer.id, serviceId: service.id, date: day, time, source: "manual" });
  console.log("Agendar de novo no mesmo horário ->", r2.ok ? "ERRO: deixou agendar duas vezes" : `bloqueado: ${r2.reason}`);

  const after = await freeSlots(business, service.id, day);
  console.log("Horário some da lista depois de agendado:", !after.some((s) => s.time === time));

  const sunday = (() => {
    let d = day;
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) d = addDays(d, 1);
    return d;
  })();
  console.log(`Domingo ${sunday} (fechado) tem horários:`, (await freeSlots(business, service.id, sunday)).length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
