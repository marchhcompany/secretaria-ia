// Demonstração para a WS Training Studio (Itaipu, Niterói).
// Só contém o que a March já sabe com certeza. Preços, horários, modalidades e endereço exato
// precisam ser confirmados com o proprietário: veja docs/demo-ws-training-studio.md.
// Enquanto não forem cadastrados, a assistente diz que a equipe confirma (não inventa).
//
// Uso: npm run seed:demo-academia -- dono@email.com
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessMembers, businesses, faqs, user } from "@/db/schema";

const NAME = "WS Training Studio (demonstração)";

async function main() {
  const ownerEmail = process.argv[2];
  if (!ownerEmail) throw new Error("Informe o e-mail: npm run seed:demo-academia -- dono@email.com");
  const [owner] = await db.select().from(user).where(eq(user.email, ownerEmail.toLowerCase()));
  if (!owner) throw new Error(`Nenhuma conta com o e-mail ${ownerEmail}.`);

  const fields = {
    name: NAME,
    segment: "fitness",
    assistantName: "Assistente WS",
    tone: "animado, acolhedor e direto; trata pelo nome; motiva sem exagerar",
    about: "A WS Training Studio é uma academia em Itaipu, Niterói (RJ).",
    instructions: `Entenda o objetivo da pessoa (emagrecimento, ganho de massa, condicionamento, saúde, reabilitação) e a rotina dela antes de falar de planos.
Convide para conhecer o estúdio ou fazer uma aula experimental. Use solicitar_horario para registrar o pedido: a equipe confirma.
Não dê orientação de treino, dieta ou saúde. Para dores, lesões ou condições médicas, recomende avaliação profissional.
Se a pessoa já foi aluna e quer voltar, trate como prioridade e use chamar_atendente depois de entender o que ela procura.`,
    paymentInfo: "",
    conversionGoal: "Qualificar o interessado e levá-lo a agendar uma visita ou aula experimental no estúdio.",
    qualificationQuestions: `Qual é o seu objetivo com o treino?
Já treina ou está parado(a) há quanto tempo?
Mora ou trabalha perto de Itaipu?
Qual período fica melhor para treinar (manhã, tarde, noite)?`,
    hidePrices: true,
    bookingMode: "request" as const,
    aiEnabled: true,
    automationsLive: false,
  };

  const [existing] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .innerJoin(businessMembers, eq(businessMembers.businessId, businesses.id))
    .where(and(eq(businesses.name, NAME), eq(businessMembers.userId, owner.id)));
  let id = existing?.id;
  if (id) await db.update(businesses).set(fields).where(eq(businesses.id, id));
  else {
    [{ id }] = await db.insert(businesses).values(fields).returning({ id: businesses.id });
    await db.insert(businessMembers).values({ businessId: id, userId: owner.id, role: "owner" });
  }
  await db.delete(faqs).where(eq(faqs.businessId, id!));
  await db.insert(faqs).values({
    businessId: id!,
    question: "Onde fica?",
    answer: "Em Itaipu, Niterói (RJ). O endereço completo a equipe envia na confirmação da visita.",
  });
  console.log(`Demonstração criada (id ${id}). Preencha preços/horários/modalidades com o proprietário antes da reunião.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
