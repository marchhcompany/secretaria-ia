import { asc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { businesses, businessMembers } from "@/db/schema";
import { auth } from "@/lib/auth";

export const BUSINESS_COOKIE = "march_business";

export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function membershipsOf(userId: string) {
  return db
    .select({ business: businesses, role: businessMembers.role })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(eq(businessMembers.userId, userId))
    .orderBy(asc(businessMembers.createdAt));
}

/**
 * Usuário logado e o negócio ativo dele (escolhido no seletor; padrão: o primeiro).
 * Isolamento entre empresas: o banco é acessado só pelo servidor, sem RLS, então toda consulta
 * do painel precisa filtrar por `business.id` vindo daqui. `owner: true` exige papel de dono.
 */
export async function requireBusiness(opts: { owner?: boolean } = {}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const rows = await membershipsOf(user.id);
  if (!rows.length) redirect("/comecar");
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  const row = rows.find((r) => r.business.id === chosen) ?? rows[0];
  if (opts.owner && row.role !== "owner") throw new Error("Apenas o dono do negócio pode alterar esta configuração.");

  return { user, business: row.business, role: row.role, memberships: rows };
}
