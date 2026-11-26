import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessMembers, user, type Business } from "@/db/schema";
import { appURL } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

/** Avisa a equipe por e-mail que uma conversa precisa de uma pessoa. O painel também mostra o alerta. */
export async function notifyTeam(business: Business, conversationId: string, reason: string) {
  try {
    let to = business.notifyEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => /.+@.+\..+/.test(e));
    if (!to.length) {
      const owners = await db
        .select({ email: user.email })
        .from(businessMembers)
        .innerJoin(user, eq(user.id, businessMembers.userId))
        .where(eq(businessMembers.businessId, business.id));
      to = owners.map((o) => o.email);
    }
    const url = `${appURL}/painel/conversas/${conversationId}`;
    const text = `Uma conversa de ${business.name} precisa da equipe.\n\nMotivo: ${reason}\n\nAbrir: ${url}`;
    const html = `<p>Uma conversa de <b>${escapeHtml(business.name)}</b> precisa da equipe.</p><p>Motivo: ${escapeHtml(reason)}</p><p><a href="${url}">Abrir a conversa</a></p>`;
    await Promise.all(to.map((email) => sendEmail(email, `Atendimento humano necessário · ${business.name}`, html, text)));
  } catch (err) {
    console.error("[notify] falha ao avisar a equipe", err);
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
