import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { services, type Service } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { deleteService, saveService } from "../actions";
import { PageHeader } from "../ui";

function ServiceForm({ s }: { s?: Service }) {
  const key = s?.id ?? "new";
  return (
    <form action={saveService} className="card grid gap-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_110px]">
        <label className="label">
          Nome do serviço
          <input id={`name-${key}`} name="name" required defaultValue={s?.name} className="input" />
        </label>
        <label className="label">
          Duração (min)
          <input id={`dur-${key}`} name="duration_min" type="number" min={5} step={5} defaultValue={s?.durationMin ?? 60} className="input" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <label className="label">
          Preço (R$)
          <input
            id={`price-${key}`}
            name="price"
            inputMode="decimal"
            defaultValue={s?.priceCents != null ? (s.priceCents / 100).toFixed(2).replace(".", ",") : ""}
            placeholder="vazio = sob consulta"
            className="input"
          />
        </label>
        <label className="label">
          Observação do preço
          <input id={`note-${key}`} name="price_note" defaultValue={s?.priceNote} placeholder='Ex.: "a partir de"' className="input" />
        </label>
      </div>
      <label className="label">
        Descrição para a assistente
        <textarea
          id={`desc-${key}`}
          name="description"
          rows={2}
          defaultValue={s?.description}
          placeholder="O que é, para quem é indicado, cuidados antes e depois"
          className="input"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input id={`active-${key}`} name="active" type="checkbox" defaultChecked={s?.active ?? true} />
          Disponível para agendamento
        </label>
        <div className="flex gap-2">
          {s && (
            <button formAction={deleteService} className="btn-danger">
              Excluir
            </button>
          )}
          <button className="btn">{s ? "Salvar" : "Adicionar serviço"}</button>
        </div>
      </div>
    </form>
  );
}

export default async function ServicosPage() {
  const { business } = await requireBusiness();
  const rows = await db.select().from(services).where(eq(services.businessId, business.id)).orderBy(asc(services.createdAt));

  return (
    <>
      <PageHeader title="Serviços">
        A assistente só oferece o que está aqui, com os preços e durações cadastrados. A duração define o tamanho de cada horário na agenda.
      </PageHeader>
      <div className="grid gap-4">
        {rows.map((s) => <ServiceForm key={s.id} s={s} />)}
        <h2 className="mt-4 font-semibold">Novo serviço</h2>
        <ServiceForm />
      </div>
    </>
  );
}
