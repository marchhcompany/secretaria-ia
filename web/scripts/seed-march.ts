// Configura a March Company como primeira empresa (ambiente de validação).
// Usa somente informações fornecidas pela March. Itens que a March ainda não informou
// (endereço, horários, prazos, cases) ficam de fora de propósito: a assistente encaminha para a equipe.
//
// Uso: npm run seed:march -- dono@email.com
//   O e-mail precisa ser de uma conta já criada no painel (/criar-conta). Pode rodar de novo: atualiza.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRules, businessMembers, businesses, faqs, services, user } from "@/db/schema";

const NAME = "March Company";

const ABOUT = `A March Company é uma empresa de tecnologia, automação e presença digital para negócios locais de Niterói e São Gonçalo.
Slogan: "Tecnologia que move negócios."
Site: https://marchcompany.com.br
Instagram: @marchcompanybr
A March não trabalha só com Google e Instagram: atua com sites, lojas online, sistemas, automações, inteligência artificial no WhatsApp e marketing digital, de acordo com o que cada negócio precisa.`;

const SERVICES = [
  ["Sites e landing pages", "Sites institucionais e páginas de venda para apresentar o negócio e captar clientes."],
  ["Lojas online", "Loja virtual para vender produtos pela internet."],
  ["Sistemas de pedidos", "Sistemas para receber e organizar pedidos (por exemplo, de delivery)."],
  ["Sistemas personalizados", "Sistemas feitos sob medida para a rotina do negócio."],
  ["CRM e automações comerciais", "Organização de contatos, funil de vendas e automações do atendimento comercial."],
  ["Assistentes de inteligência artificial pelo WhatsApp", "Assistente virtual que atende clientes no WhatsApp, tira dúvidas, qualifica interessados e passa para a equipe quando precisa."],
  ["Plaquinhas NFC para avaliações do Google", "Plaquinhas que o cliente aproxima do celular para abrir a página de avaliação do negócio no Google."],
  ["Google Meu Negócio", "Configuração e cuidado do perfil da empresa no Google (Google Business Profile)."],
  ["Gestão de redes sociais", "Gestão do Instagram e de outras redes do negócio."],
  ["Tráfego pago", "Anúncios pagos para atrair clientes."],
  ["Automação de recuperação e relacionamento com clientes", "Mensagens automáticas para recuperar interessados e reativar clientes antigos, respeitando consentimento."],
] as const;

const KNOWLEDGE: [string, string][] = [
  ["Quais serviços a March oferece?", SERVICES.map(([n]) => n).join("; ") + "."],
  ["Onde a March atende?", "Negócios locais de Niterói e São Gonçalo. Para outras cidades, a equipe confirma."],
  [
    "Quanto custa?",
    "Os valores não são passados por mensagem: dependem do que o negócio precisa. A equipe apresenta a proposta depois de entender o caso, de preferência em uma reunião.",
  ],
  ["Formas de pagamento", "Pix, Pix parcelado e cartão de crédito parcelado. As condições de cada proposta são definidas pela equipe."],
  [
    "Vocês garantem resultado?",
    "Não prometemos resultados garantidos (vendas, posição no Google, seguidores). Trabalhamos com estratégia e acompanhamento, e a equipe explica o que esperar em cada caso.",
  ],
  ["Site e Instagram", "Site: https://marchcompany.com.br · Instagram: @marchcompanybr"],
];

const QUALIFICATION = `Qual é o seu negócio e em que bairro/cidade ele fica?
Como os clientes encontram vocês hoje (indicação, Instagram, Google, WhatsApp)?
O que você gostaria de melhorar agora (vender mais, organizar o atendimento, aparecer no Google, vender online...)?
Já tem site, loja online ou algum sistema?
Quem decide sobre esse projeto?
Qual o melhor dia e período para uma conversa com a equipe?`;

const INSTRUCTIONS = `Entenda o negócio do interessado antes de sugerir qualquer serviço. Sugira no máximo um ou dois serviços que façam sentido para o que ele contou.
Convide para uma reunião com a equipe, de preferência presencial (Niterói ou São Gonçalo); online também é possível. Use solicitar_horario para registrar o pedido: a equipe confirma.
Endereço, prazos de entrega, exemplos de clientes e condições de proposta não estão cadastrados: diga que a equipe informa.
Se o interessado perguntar sobre a própria assistente, pode dizer que ela é um exemplo do serviço de assistentes de IA pelo WhatsApp que a March oferece.`;

async function main() {
  const ownerEmail = process.argv[2];
  if (!ownerEmail) throw new Error("Informe o e-mail do dono: npm run seed:march -- dono@email.com");
  const [owner] = await db.select().from(user).where(eq(user.email, ownerEmail.toLowerCase()));
  if (!owner) throw new Error(`Nenhuma conta com o e-mail ${ownerEmail}. Crie a conta em /criar-conta primeiro.`);

  const fields = {
    name: NAME,
    segment: "servicos",
    assistantName: "Assistente March",
    tone: "natural, objetivo e profissional, próximo de quem atende um empresário local; trata pelo nome quando souber",
    about: ABOUT,
    instructions: INSTRUCTIONS,
    paymentInfo: "Pix, Pix parcelado e cartão de crédito parcelado. Mencione quando for pertinente; valores e condições só com a equipe.",
    conversionGoal:
      "Entender o negócio do interessado, identificar a necessidade e levá-lo a marcar uma reunião com a equipe da March, de preferência presencial.",
    qualificationQuestions: QUALIFICATION,
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

  const businessId = await db.transaction(async (tx) => {
    let id = existing?.id;
    if (id) await tx.update(businesses).set(fields).where(eq(businesses.id, id));
    else {
      [{ id }] = await tx.insert(businesses).values(fields).returning({ id: businesses.id });
      await tx.insert(businessMembers).values({ businessId: id, userId: owner.id, role: "owner" });
    }
    await tx.delete(services).where(eq(services.businessId, id!));
    await tx.insert(services).values(SERVICES.map(([name, description]) => ({ businessId: id!, name, description, priceCents: null })));
    await tx.delete(faqs).where(eq(faqs.businessId, id!));
    await tx.insert(faqs).values(KNOWLEDGE.map(([question, answer]) => ({ businessId: id!, question, answer })));
    // Follow-up preparado, mas desligado e em simulação até a March aprovar.
    await tx
      .insert(automationRules)
      .values({
        businessId: id!,
        kind: "follow_up",
        enabled: false,
        delay: 20,
        message: "Oi{, nome}! Passando para saber se ficou alguma dúvida sobre o que conversamos. Posso ajudar em algo?",
      })
      .onConflictDoNothing();
    return id!;
  });

  console.log(`March Company configurada (id ${businessId}) para ${owner.email}.`);
  console.log("Próximos passos: revisar em /painel/assistente, testar em /painel/simulador e só então conectar o WhatsApp.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
