import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifra segredos guardados no banco (ex.: token de WhatsApp de cada cliente).
// A chave vem de DATA_ENCRYPTION_KEY (qualquer texto longo e aleatório); nunca fica no banco.

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) throw new Error("DATA_ENCRYPTION_KEY ausente ou curta (mínimo 32 caracteres).");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato desconhecido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
