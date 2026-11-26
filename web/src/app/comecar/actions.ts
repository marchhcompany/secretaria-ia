"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { businessHours, businessMembers, businesses, services } from "@/db/schema";
import { currentUser } from "@/lib/business";
import { DEFAULT_HOURS, SEGMENTS, SERVICE_TEMPLATES } from "@/lib/templates";

export type CreateState = { error?: string };

export async function createBusiness(_: CreateState, form: FormData): Promise<CreateState> {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const name = String(form.get("name") ?? "").trim();
  const raw = String(form.get("segment") ?? "outro");
  const segment = SEGMENTS.some((s) => s.value === raw) ? raw : "outro";
  if (!name) return { error: "Informe o nome do negócio." };

  await db.transaction(async (tx) => {
    // Teto inicial de IA (US$ 5/mês) para conta nova: evita custo surpresa. O dono ajusta em Assistente.
    const [business] = await tx.insert(businesses).values({ name, segment, aiMonthlyBudgetCents: 500 }).returning({ id: businesses.id });
    await tx.insert(businessMembers).values({ businessId: business.id, userId: user.id, role: "owner" });
    await tx.insert(services).values(SERVICE_TEMPLATES[segment].map((s) => ({ ...s, businessId: business.id })));
    await tx.insert(businessHours).values(DEFAULT_HOURS.map((h) => ({ ...h, businessId: business.id })));
  });

  redirect("/painel");
}
