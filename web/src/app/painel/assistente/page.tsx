import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { faqs as faqTable } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { addFaq, removeFaq, saveAssistant, saveWhatsapp } from "../actions";
import { PageHeader } from "../ui";

export default async function AssistentePage({ searchParams }: PageProps<"/painel/assistente">) {
  const { business } = await requireBusiness();
  const status = (await searchParams).whatsapp;
  const faqs = await db.select().from(faqTable).where(eq(faqTable.businessId, business.id)).orderBy(asc(faqTable.createdAt));

  return (
    <>
      <PageHeader title="Assistente">
        Tudo o que a assistente sabe sobre o negócio vem daqui, dos serviços e dos horários. Quanto mais completo, melhor ela responde.
      </PageHeader>

      <form action={saveAssistant} className="card mb-6 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Nome do negócio
            <input id="biz-name" name="name" defaultValue={business.name} className="input" />
          </label>
          <label className="label">
            Nome da assistente
            <input id="assistant-name" name="assistant_name" defaultValue={business.assistantName} className="input" />
          </label>
        </div>
        <label className="label">
          Jeito de falar
          <input
            id="tone"
            name="tone"
            defaultValue={business.tone}
            placeholder="Ex.: acolhedor e próximo, trata a cliente pelo nome"
            className="input"
          />
        </label>
        <label className="label">
          Sobre o negócio
          <textarea
            id="about"
            name="about"
            rows={5}
            defaultValue={business.about}
            placeholder="Endereço, como chegar, estacionamento, formas de pagamento, convênios, quem são os profissionais, diferenciais."
            className="input"
          />
        </label>
        <label className="label">
          Instruções extras
          <textarea
            id="instructions"
            name="instructions"
            rows={4}
            defaultValue={business.instructions}
            placeholder='Ex.: "Não informar preço de harmonização, só na avaliação." "Pedir sinal de R$ 50 via Pix para confirmar."'
            className="input"
          />
        </label>
        <div>
          <button className="btn">Salvar</button>
        </div>
      </form>

      <section className="card mb-6 grid gap-3">
        <h2 className="font-semibold">Perguntas frequentes</h2>
        <ul className="grid divide-y divide-line">
          {faqs?.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <strong className="block text-sm">{f.question}</strong>
                <p className="text-sm text-muted">{f.answer}</p>
              </div>
              <form action={removeFaq}>
                <input type="hidden" name="id" value={f.id} />
                <button className="btn-danger">Remover</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addFaq} className="grid gap-2">
          <input id="faq-q" name="question" required placeholder="Pergunta. Ex.: Vocês aceitam cartão?" className="input" aria-label="Pergunta" />
          <textarea id="faq-a" name="answer" required rows={2} placeholder="Resposta" className="input" aria-label="Resposta" />
          <div>
            <button className="btn">Adicionar pergunta</button>
          </div>
        </form>
      </section>

      <section id="whatsapp" className="card grid gap-3">
        <h2 className="font-semibold">WhatsApp</h2>
        <p className="text-sm text-muted">
          {business.whatsappPhoneNumberId
            ? `Conectado${business.whatsappNumber ? ` ao número ${business.whatsappNumber}` : ""}. A assistente responde as mensagens que chegam nele.`
            : "Ainda não conectado. Enquanto isso, use “Testar assistente” para conversar com ela."}
        </p>
        {status === "salvo" && <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">WhatsApp salvo.</p>}
        {status === "em-uso" && (
          <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">
            Essa identificação já está ligada a outro negócio. Confira o número copiado da Meta.
          </p>
        )}
        <form action={saveWhatsapp} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Número do WhatsApp
              <input
                id="wa-number"
                name="whatsapp_number"
                defaultValue={business.whatsappNumber ?? ""}
                placeholder="Ex.: (21) 99999-9999"
                className="input"
              />
            </label>
            <label className="label">
              Identificação do número na Meta
              <input
                id="wa-phone-id"
                name="phone_number_id"
                inputMode="numeric"
                defaultValue={business.whatsappPhoneNumberId ?? ""}
                placeholder="Só números. A equipe da March preenche."
                className="input"
              />
            </label>
          </div>
          <div>
            <button className="btn">Salvar WhatsApp</button>
          </div>
        </form>
      </section>
    </>
  );
}
