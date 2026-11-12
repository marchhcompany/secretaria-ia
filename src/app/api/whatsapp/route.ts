import { after, type NextRequest } from "next/server";
import { validSignature, type WebhookPayload } from "@/lib/whatsapp/client";
import { processWebhook } from "@/lib/whatsapp/inbound";

// Endereço que a Meta chama a cada mensagem recebida no WhatsApp: /api/whatsapp

// Tempo para a assistente pensar e responder depois que a Meta já recebeu o "ok".
export const maxDuration = 120;

/** Verificação feita uma vez pela Meta ao cadastrar o webhook. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (params.get("hub.mode") === "subscribe" && token && params.get("hub.verify_token") === token) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // A Meta espera a resposta em poucos segundos e reenvia se demorar.
  // Respondemos "ok" na hora e a assistente trabalha em seguida.
  after(() => processWebhook(payload).catch((err) => console.error("[whatsapp] webhook", err)));
  return new Response("OK", { status: 200 });
}
