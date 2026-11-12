import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { businesses, businessMembers } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Usuário logado e o negócio dele. Redireciona para login ou cadastro quando falta algum.
 * Sem RLS no banco: toda consulta do painel precisa filtrar por `business.id`.
 */
export async function requireBusiness() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const [row] = await db
    .select({ business: businesses })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(eq(businessMembers.userId, user.id))
    .orderBy(asc(businessMembers.createdAt))
    .limit(1);
  if (!row) redirect("/comecar");

  return { user, business: row.business };
}
