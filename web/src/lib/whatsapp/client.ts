import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret } from "@/lib/crypto";

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

/** Número do negócio: de onde sai a mensagem e com qual token. */
export type Sender = { phoneNumberId: string; accessTokenEnc?: string | null };

export type SendResult = { ok: true; messageId: string | null } | { ok: false; reason: string; code?: number };

// Transporte trocável: em testes nenhuma requisição sai para a Meta.
type Transport = (url: string, init: RequestInit) => Promise<Response>;
let transport: Transport = (url, init) => fetch(url, init);
export function setWhatsappTransport(t: Transport | null) {
  transport = t ?? ((url, init) => fetch(url, init));
}

function tokenFor(sender: Sender): string | null {
  if (sender.accessTokenEnc) {
    try {
      return decryptSecret(sender.accessTokenEnc);
    } catch {
      return null;
    }
  }
  return process.env.WHATSAPP_ACCESS_TOKEN || null;
}

async function post(sender: Sender, body: Record<string, unknown>): Promise<SendResult> {
  const token = tokenFor(sender);
  if (!token) return { ok: false, reason: "WhatsApp não configurado (falta o token de acesso)." };
  try {
    const res = await transport(`${GRAPH}/${sender.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const data = (await res.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { code?: number; message?: string };
    } | null;
    if (res.ok) return { ok: true, messageId: data?.messages?.[0]?.id ?? null };
    const code = data?.error?.code;
    return { ok: false, code, reason: explainError(code, data?.error?.message ?? `HTTP ${res.status}`) };
  } catch (err) {
    return { ok: false, reason: `Sem conexão com a Meta: ${(err as Error).message}` };
  }
}

function explainError(code: number | undefined, message: string): string {
  switch (code) {
    case 131047:
      return "Passaram mais de 24 horas desde a última mensagem do cliente. Nesse caso o WhatsApp só deixa enviar modelos (templates) aprovados pela Meta.";
    case 131030:
      return "Este número ainda não está na lista de números de teste do app na Meta.";
    case 131026:
      return "A mensagem não pôde ser entregue (o número pode não ter WhatsApp ou bloqueou o negócio).";
    case 132001:
      return "O template não existe ou não está aprovado neste idioma.";
    case 190:
      return "O token de acesso do WhatsApp expirou ou é inválido.";
    default:
      return `Erro da Meta${code ? ` (${code})` : ""}: ${message}`;
  }
}

export function sendText(sender: Sender, to: string, text: string): Promise<SendResult> {
  return post(sender, {
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text.slice(0, MAX_TEXT) },
  });
}

/** Envia um template aprovado. Obrigatório para iniciar conversa ou falar fora da janela de 24 horas. */
export function sendTemplate(
  sender: Sender,
  to: string,
  template: { name: string; language: string; bodyParams?: string[] },
): Promise<SendResult> {
  const components = template.bodyParams?.length
    ? [{ type: "body", parameters: template.bodyParams.map((text) => ({ type: "text", text })) }]
    : undefined;
  return post(sender, {
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: template.name, language: { code: template.language }, ...(components ? { components } : {}) },
  });
}

/** Marca a mensagem como lida e mostra "digitando..." para o cliente enquanto a assistente pensa. */
export function markReadAndTyping(sender: Sender, messageId: string): Promise<SendResult> {
  return post(sender, { status: "read", message_id: messageId, typing_indicator: { type: "text" } });
}

/** A janela de atendimento do WhatsApp: 24 horas desde a última mensagem do cliente. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
export function insideServiceWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

// ---------- Formato do webhook ----------

export type InboundMessage = {
  from: string;
  id: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

export type StatusUpdate = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string }[];
};

export type WebhookValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
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
