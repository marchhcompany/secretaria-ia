import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { faqs as faqTable } from "@/db/schema";
import { DEFAULT_MODEL } from "@/lib/assistant/model";
import { requireBusiness } from "@/lib/business";
import { addFaq, removeFaq, saveAssistant, saveWhatsapp } from "../actions";
import { PageHeader } from "../ui";

const MODELS = [
  { value: "", label: `Padrão do servidor (${DEFAULT_MODEL})` },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 · melhor qualidade" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 · equilíbrio" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 · mais barato (testar antes)" },
];

export default async function AssistentePage({ searchParams }: PageProps<"/painel/assistente">) {
  const { business, role } = await requireBusiness();
  const owner = role === "owner";
  const status = (await searchParams).whatsapp;
  const faqs = await db.select().from(faqTable).where(eq(faqTable.businessId, business.id)).orderBy(asc(faqTable.createdAt));

  return (
    <>
      <PageHeader title="Assistente">
        Tudo o que a assistente sabe e como ela se comporta vem daqui, dos serviços e dos horários. Mudanças valem na próxima mensagem.
        Teste no simulador antes de ligar no WhatsApp.
      </PageHeader>
      {!owner && <p className="mb-4 rounded-lg bg-warm-soft px-4 py-3 text-sm">Somente o dono do negócio pode alterar estas configurações.</p>}

      <form action={saveAssistant} className="card mb-6 grid gap-4">
        <h2 className="font-semibold">Identidade</h2>
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
          <input id="tone" name="tone" defaultValue={business.tone} placeholder="Ex.: natural, objetivo e profissional" className="input" />
        </label>
        <label className="label">
          Sobre o negócio
          <textarea
            id="about"
            name="about"
            rows={6}
            defaultValue={business.about}
            placeholder="O que o negócio faz, para quem, onde fica, diferenciais. Só informações verdadeiras: a assistente usa exatamente isto."
            className="input"
          />
        </label>

        <h2 className="mt-2 font-semibold">Regras comerciais</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="hide_prices" defaultChecked={business.hidePrices} className="mt-1" />
          <span>
            <b>Nunca informar preços por mensagem.</b> A assistente explica que o valor depende do caso e conduz para a conversa com a equipe.
          </span>
        </label>
        <label className="label">
          Formas de pagamento
          <input
            id="payment"
            name="payment_info"
            defaultValue={business.paymentInfo}
            placeholder="Ex.: Pix, Pix parcelado e cartão de crédito parcelado."
            className="input"
          />
        </label>
        <label className="label">
          Objetivo da conversa
          <textarea
            id="goal"
            name="conversion_goal"
            rows={2}
            defaultValue={business.conversionGoal}
            placeholder="Ex.: entender o negócio do interessado e convidá-lo para uma reunião, de preferência presencial."
            className="input"
          />
        </label>
        <label className="label">
          Perguntas de qualificação
          <textarea
            id="qualification"
            name="qualification_questions"
            rows={4}
            defaultValue={business.qualificationQuestions}
            placeholder={"Uma por linha. Ex.:\nQual é o seu negócio e onde fica?\nComo os clientes chegam até você hoje?"}
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
            placeholder='Ex.: "Se perguntarem por prazo, diga que depende do projeto e que a equipe informa na reunião."'
            className="input"
          />
        </label>
        <label className="label">
          Agendamentos
          <select id="booking" name="booking_mode" defaultValue={business.bookingMode} className="input">
            <option value="direct">A assistente agenda sozinha na agenda (serviços e horários cadastrados)</option>
            <option value="request">A assistente só registra o pedido; a equipe confirma o horário</option>
            <option value="off">A assistente não trata de horários</option>
          </select>
        </label>

        <h2 className="mt-2 font-semibold">Operação e custos</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ai_enabled" defaultChecked={business.aiEnabled} className="mt-1" />
          <span>
            <b>IA ligada.</b> Desligada, as mensagens chegam no painel e só a equipe responde.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="split_replies" defaultChecked={business.splitReplies} className="mt-1" />
          <span>
            <b>Dividir respostas em até 3 mensagens.</b> Fica mais natural, mas cada mensagem enviada pode ser cobrada pela Meta.
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Modelo de IA
            <select id="model" name="ai_model" defaultValue={business.aiModel} className="input">
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Teto mensal de IA (US$, 0 = sem teto)
            <input
              id="budget"
              name="ai_budget_usd"
              inputMode="decimal"
              defaultValue={(business.aiMonthlyBudgetCents / 100).toString()}
              className="input"
            />
          </label>
        </div>
        <label className="label">
          E-mails para avisos de atendimento humano
          <input
            id="notify"
            name="notify_emails"
            defaultValue={business.notifyEmails}
            placeholder="Separados por vírgula. Vazio: e-mail dos donos da conta."
            className="input"
          />
        </label>
        {owner && (
          <div>
            <button className="btn">Salvar</button>
          </div>
        )}
      </form>

      <section className="card mb-6 grid gap-3">
        <h2 className="font-semibold">Base de conhecimento</h2>
        <p className="text-sm text-muted">
          Perguntas e informações que a assistente pode usar. O que não estiver aqui ela não inventa: diz que vai confirmar com a equipe.
        </p>
        <ul className="grid divide-y divide-line">
          {faqs.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <strong className="block text-sm">{f.question}</strong>
                <p className="whitespace-pre-line text-sm text-muted">{f.answer}</p>
              </div>
              {owner && (
                <form action={removeFaq}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn-danger">Remover</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <form action={addFaq} className="grid gap-2">
            <input id="faq-q" name="question" required placeholder="Tema ou pergunta. Ex.: Vocês atendem fora de Niterói?" className="input" aria-label="Pergunta" />
            <textarea id="faq-a" name="answer" required rows={3} placeholder="Resposta ou informação" className="input" aria-label="Resposta" />
            <div>
              <button className="btn">Adicionar</button>
            </div>
          </form>
        )}
      </section>

      <section id="whatsapp" className="card grid gap-3">
        <h2 className="font-semibold">WhatsApp (Cloud API oficial da Meta)</h2>
        <p className="text-sm text-muted">
          {business.whatsappPhoneNumberId
            ? `Conectado${business.whatsappNumber ? ` ao número ${business.whatsappNumber}` : ""}. A assistente responde as mensagens que chegam nele.`
            : "Ainda não conectado. Enquanto isso, use “Testar assistente” para conversar com ela."}
          {business.whatsappAccessTokenEnc ? " Usa token próprio (cifrado)." : business.whatsappPhoneNumberId ? " Usa o token global do servidor." : ""}
        </p>
        {status === "salvo" && <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">WhatsApp salvo.</p>}
        {status === "em-uso" && (
          <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">Essa identificação já está ligada a outro negócio. Confira o número copiado da Meta.</p>
        )}
        {status === "sem-chave" && (
          <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">O servidor não tem DATA_ENCRYPTION_KEY: o token não foi salvo.</p>
        )}
        {owner && (
          <form action={saveWhatsapp} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label">
                Número do WhatsApp
                <input id="wa-number" name="whatsapp_number" defaultValue={business.whatsappNumber ?? ""} placeholder="Ex.: (21) 99999-9999" className="input" />
              </label>
              <label className="label">
                Phone Number ID (Meta)
                <input id="wa-phone-id" name="phone_number_id" inputMode="numeric" defaultValue={business.whatsappPhoneNumberId ?? ""} placeholder="Só números" className="input" />
              </label>
              <label className="label">
                WhatsApp Business Account ID (WABA)
                <input id="wa-waba" name="waba_id" inputMode="numeric" defaultValue={business.whatsappWabaId ?? ""} placeholder="Só números" className="input" />
              </label>
              <label className="label">
                Token de acesso do negócio (opcional)
                <input id="wa-token" name="access_token" type="password" autoComplete="off" placeholder={business.whatsappAccessTokenEnc ? "•••• salvo (deixe vazio para manter)" : "Vazio: usa o token global"} className="input" />
              </label>
            </div>
            {business.whatsappAccessTokenEnc && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="clear_token" /> Remover token próprio
              </label>
            )}
            <div>
              <button className="btn">Salvar WhatsApp</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
