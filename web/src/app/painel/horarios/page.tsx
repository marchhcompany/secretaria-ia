import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours, staff as staffTable } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { WEEKDAYS } from "@/lib/time";
import { addStaff, removeStaff, saveHours } from "../actions";
import { PageHeader } from "../ui";

export default async function HorariosPage() {
  const { business } = await requireBusiness();
  const [hours, staff] = await Promise.all([
    db.select().from(businessHours).where(eq(businessHours.businessId, business.id)).orderBy(asc(businessHours.opens)),
    db.select().from(staffTable).where(eq(staffTable.businessId, business.id)).orderBy(asc(staffTable.name)),
  ]);

  // Ordem de segunda a domingo, como a maioria dos negócios pensa a semana.
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <>
      <PageHeader title="Horários e profissionais">
        A assistente só oferece horários dentro do funcionamento. Use o segundo intervalo para quem fecha no almoço.
      </PageHeader>

      <form action={saveHours} className="card mb-6 grid gap-3">
        <h2 className="font-semibold">Funcionamento</h2>
        <div className="grid gap-2">
          {order.map((d) => {
            const ranges = (hours ?? []).filter((h) => h.weekday === d);
            const [a, b] = ranges;
            return (
              <div key={d} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 border-t border-line pt-2 first:border-0 first:pt-0">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input id={`open-${d}`} name={`open_${d}`} type="checkbox" defaultChecked={ranges.length > 0} />
                  {WEEKDAYS[d]}
                </label>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <input id={`o-${d}-a`} name={`opens_${d}_a`} type="time" defaultValue={a?.opens.slice(0, 5) ?? "09:00"} className="input w-auto py-1" aria-label={`${WEEKDAYS[d]} abre`} />
                  até
                  <input id={`c-${d}-a`} name={`closes_${d}_a`} type="time" defaultValue={a?.closes.slice(0, 5) ?? "18:00"} className="input w-auto py-1" aria-label={`${WEEKDAYS[d]} fecha`} />
                  <span className="px-1">e</span>
                  <input id={`o-${d}-b`} name={`opens_${d}_b`} type="time" defaultValue={b?.opens.slice(0, 5) ?? ""} className="input w-auto py-1" aria-label={`${WEEKDAYS[d]} abre de novo`} />
                  até
                  <input id={`c-${d}-b`} name={`closes_${d}_b`} type="time" defaultValue={b?.closes.slice(0, 5) ?? ""} className="input w-auto py-1" aria-label={`${WEEKDAYS[d]} fecha de novo`} />
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <button className="btn">Salvar horários</button>
        </div>
      </form>

      <section className="card grid gap-3">
        <h2 className="font-semibold">Profissionais</h2>
        <p className="text-sm text-muted">
          Opcional. Com profissionais cadastrados, cada um tem a própria agenda e o cliente pode escolher com quem quer ser atendido. Sem
          profissionais, o negócio atende um cliente por vez.
        </p>
        <ul className="grid divide-y divide-line">
          {staff?.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              {s.name}
              <form action={removeStaff}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn-danger">Remover</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addStaff} className="flex gap-2">
          <input id="staff-name" name="name" required placeholder="Ex.: Dra. Ana" className="input" aria-label="Nome do profissional" />
          <button className="btn">Adicionar</button>
        </form>
      </section>
    </>
  );
}
