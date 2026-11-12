import { createHmac, timingSafeEqual } from "node:crypto";

// Conversa com a API oficial do WhatsApp (Cloud API da Meta).
// As chaves ficam no .env.local e na Vercel: nunca no código.

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}`;
const MAX_TEXT = 4096; // limite da Meta para uma mensagem de texto

/** Confere se o webhook veio mesmo da Meta: ela assina o corpo com o "Segredo do app". */
export function validSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(header.slice("sha256=".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type SendResult = { ok: true } | { ok: false; reason: string };

async function post(phoneNumberId: string, body: Record<string, unknown>): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "WhatsApp não configurado (falta WHATSAPP_ACCESS_TOKEN)." };
  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
    return { ok: false, reason: explainError(data?.error?.code, data?.error?.message ?? `HTTP ${res.status}`) };
  } catch (err) {
    return { ok: false, reason: `Sem conexão com a Meta: ${(err as Error).message}` };
  }
}

function explainError(code: number | undefined, message: string): string {
  switch (code) {
    case 131047:
      return "Passaram mais de 24 horas desde a última mensagem do cliente. Nesse caso o WhatsApp só deixa enviar modelos aprovados pela Meta.";
    case 131030:
      return "Este número ainda não está na lista de números de teste do app na Meta.";
    case 190:
      return "O token de acesso do WhatsApp expirou ou é inválido.";
    default:
      return `Erro da Meta${code ? ` (${code})` : ""}: ${message}`;
  }
}

export function sendText(phoneNumberId: string, to: string, text: string): Promise<SendResult> {
  return post(phoneNumberId, {
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text.slice(0, MAX_TEXT) },
  });
}

/** Marca a mensagem como lida e mostra "digitando..." para o cliente enquanto a assistente pensa. */
export function markReadAndTyping(phoneNumberId: string, messageId: string): Promise<SendResult> {
  return post(phoneNumberId, { status: "read", message_id: messageId, typing_indicator: { type: "text" } });
}

// ---------- Formato do webhook ----------

export type InboundMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

export type WebhookValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: InboundMessage[];
};

export type WebhookPayload = {
  object?: string;
  entry?: { changes?: { field?: string; value?: WebhookValue }[] }[];
};

/** Texto que o cliente mandou, ou null quando não é texto (áudio, foto, figurinha...). */
export function messageText(m: InboundMessage): string | null {
  const t =
    m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
  return t?.trim() || null;
}

const KIND: Record<string, string> = {
  audio: "um áudio",
  image: "uma foto",
  video: "um vídeo",
  document: "um documento",
  sticker: "uma figurinha",
  location: "uma localização",
  contacts: "um contato",
};
export const describeKind = (type: string) => KIND[type] ?? "uma mensagem que não é texto";
