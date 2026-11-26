import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { processDueAutomations } from "@/lib/automations";

// Processa follow-ups, lembretes e reativações vencidos.
// Chamado por um agendador (Vercel Cron, Supabase pg_cron, GitHub Actions...) com
// o cabeçalho "Authorization: Bearer <CRON_SECRET>". Sem CRON_SECRET configurado, fica desligado.
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const results = await processDueAutomations();
  const summary = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome.status]: (acc[r.outcome.status] ?? 0) + 1 }), {});
  return Response.json({ processed: results.length, summary });
}
