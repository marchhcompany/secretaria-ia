import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessMembers, user } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { addMember, removeMember, switchBusiness } from "../actions";
import { PageHeader } from "../ui";

export default async function EquipePage({ searchParams }: PageProps<"/painel/equipe">) {
  const { business, role, memberships, user: me } = await requireBusiness();
  const erro = (await searchParams).erro;
  const members = await db
    .select({ id: user.id, name: user.name, email: user.email, role: businessMembers.role })
    .from(businessMembers)
    .innerJoin(user, eq(user.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, business.id));

  return (
    <>
      <PageHeader title="Empresas e equipe">
        Cada empresa tem dados, WhatsApp, base de conhecimento e custos separados. Donos configuram; equipe atende as conversas.
      </PageHeader>

      {memberships.length > 1 && (
        <section className="card mb-6 grid gap-2">
          <h2 className="font-semibold">Trocar de empresa</h2>
          {memberships.map((m) => (
            <form key={m.business.id} action={switchBusiness} className="flex items-center justify-between gap-2 text-sm">
              <input type="hidden" name="id" value={m.business.id} />
              <span>
                {m.business.name} · {m.role === "owner" ? "dono" : "equipe"}
              </span>
              {m.business.id === business.id ? <b className="text-accent">atual</b> : <button className="btn-ghost">Abrir</button>}
            </form>
          ))}
        </section>
      )}

      <section className="card grid gap-3">
        <h2 className="font-semibold">Pessoas com acesso a {business.name}</h2>
        {typeof erro === "string" && <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">{erro}</p>}
        <ul className="grid divide-y divide-line text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {m.name} · {m.email} · {m.role === "owner" ? "dono" : "equipe"}
              </span>
              {role === "owner" && m.id !== me.id && (
                <form action={removeMember}>
                  <input type="hidden" name="user_id" value={m.id} />
                  <button className="btn-danger">Remover</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {role === "owner" && (
          <form action={addMember} className="flex flex-wrap items-end gap-2">
            <label className="label">
              E-mail (a pessoa precisa ter conta)
              <input name="email" type="email" required className="input" />
            </label>
            <label className="label">
              Papel
              <select name="role" className="input">
                <option value="staff">Equipe (atende conversas)</option>
                <option value="owner">Dono (configura tudo)</option>
              </select>
            </label>
            <button className="btn">Adicionar</button>
          </form>
        )}
      </section>
    </>
  );
}
