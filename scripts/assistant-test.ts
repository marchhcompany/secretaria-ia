// Conversa de teste com a assistente, usando o negócio da conta de teste.
// Uso: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/assistant-test.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessMembers, conversations, customers, user } from "@/db/schema";
import { handleCustomerMessage } from "@/lib/assistant/engine";

const SCRIPT = [
  "Oi, boa noite! Quanto custa o botox?",
  "Quero agendar uma avaliação amanhã à tarde",
  "Pode ser o primeiro horário que você falou. Meu nome é Juliana",
  "Na verdade quero falar com uma pessoa sobre desconto",
];

async function main() {
  const [u] = await db.select().from(user).where(eq(user.email, "teste@secretaria-ia.test"));
  const [member] = await db.select().from(businessMembers).where(eq(businessMembers.userId, u.id));
  const [customer] = await db
    .insert(customers)
    .values({ businessId: member.businessId, phone: `teste-ia-${Date.now()}` })
    .returning();
  const [conv] = await db
    .insert(conversations)
    .values({ businessId: member.businessId, customerId: customer.id, channel: "simulator" })
    .returning();

  for (const text of SCRIPT) {
    console.log(`\nCLIENTE: ${text}`);
    const t0 = Date.now();
    const out = await handleCustomerMessage(conv.id, text);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (out.status === "replied") console.log(`ASSISTENTE (${secs}s${out.handoff ? ", passou para a equipe" : ""}): ${out.text}`);
    else console.log(`[${out.status}]`, "message" in out ? out.message : "");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
