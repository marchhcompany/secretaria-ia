import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { AUTOMATION_KINDS, customers, scheduledMessages } from "@/db/schema";
import { AUTOMATION_LABELS, DEFAULT_RULES, getRules } from "@/lib/automations";
import { requireBusiness } from "@/lib/business";
import { formatLong } from "@/lib/time";
import { processAutomationsNow, queueReactivationAction, saveAutomationRule, setAutomationsLive } from "../actions";
import { Empty, PageHeader } from "../ui";

const HELP: Record<string, { delay: string; text: string }> = {
  follow_up: {
    delay: "Horas depois da última resposta da assistente sem retorno do cliente",
    text: "Cancelado sozinho se o cliente responder. Até 24 horas depois da última mensagem do cliente pode ser texto livre; depois disso só template aprovado (categoria marketing ou utilidade).",
  },
  appointment_reminder: {
    delay: "Horas antes do horário agendado",
    text: "Criado quando um agendamento é feito (pela assistente ou pelo painel) e cancelado se o agendamento for cancelado. Normalmente precisa de template de utilidade.",
  },
  reactivation: {
    delay: "Dias sem contato para considerar o cliente inativo",
    text: "Só para clientes que aceitaram receber marketing e não pediram descadastro. Sempre exige template de marketing aprovado pela Meta.",
  },
};

const STATUS: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviada",
  dry_run: "Simulada",
  canceled: "Cancelada",
  skipped: "Não enviada",
  failed: "Falhou",
};

export default async function AutomacoesPage({ searchParams }: PageProps<"/painel/automacoes">) {
  const { business, role } = await requireBusiness();
  const owner = role === "owner";
  const notice = (await searchParams).reativacao;
  const rules = await getRules(business.id);
  const queue = await db
    .select({ item: scheduledMessages, name: customers.name, phone: customers.phone })
    .from(scheduledMessages)
    .innerJoin(customers, eq(customers.id, scheduledMessages.customerId))
    .where(eq(scheduledMessages.businessId, business.id))
    .orderBy(desc(scheduledMessages.createdAt))
    .limit(50);

  return (
    <>
      <PageHeader title="Automações">
        Follow-up, lembretes e reativação. Ninguém que pediu descadastro recebe mensagens, e fora da janela de 24 horas só sai template aprovado
        pela Meta.
      </PageHeader>

      <section className={`card mb-6 grid gap-3 ${business.automationsLive ? "border-warm" : ""}`}>
        <h2 className="font-semibold">Envio real: {business.automationsLive ? "LIGADO" : "desligado (modo simulação)"}</h2>
        <p className="text-sm text-muted">
          {business.automationsLive
            ? "As automações vencidas são enviadas de verdade pelo WhatsApp."
            : "As automações são processadas, mas nada é enviado: cada item mostra o que teria sido enviado. Use para validar antes de ligar."}
        </p>
        {owner && (
          <form action={setAutomationsLive} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="live" value={business.automationsLive ? "off" : "on"} />
            {!business.automationsLive && (
              <label className="label">
                Para ligar, digite ENVIAR DE VERDADE
                <input name="confirm" className="input" autoComplete="off" />
              </label>
            )}
            <button className={business.automationsLive ? "btn" : "btn-ghost"}>{business.automationsLive ? "Desligar envio real" : "Ligar envio real"}</button>
          </form>
        )}
      </section>

      <div className="mb-6 grid gap-4">
        {AUTOMATION_KINDS.map((kind) => {
          const r = rules[kind];
          return (
            <form key={kind} action={saveAutomationRule} className="card grid gap-3">
              <input type="hidden" name="kind" value={kind} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{AUTOMATION_LABELS[kind]}</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="enabled" defaultChecked={r?.enabled ?? false} /> Ativa
                </label>
              </div>
              <p className="text-sm text-muted">{HELP[kind].text}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="label">
                  {HELP[kind].delay}
                  <input name="delay" inputMode="numeric" defaultValue={r?.delay ?? DEFAULT_RULES[kind].delay} className="input" />
                </label>
                <label className="label">
                  Template aprovado (nome na Meta)
                  <input name="template_name" defaultValue={r?.templateName ?? ""} placeholder="ex.: retomada_contato" className="input" />
                </label>
                <label className="label">
                  Idioma do template
                  <input name="template_language" defaultValue={r?.templateLanguage ?? "pt_BR"} className="input" />
                </label>
              </div>
              {kind !== "reactivation" && (
                <label className="label">
                  Texto (dentro da janela de 24 horas). Use {"{nome}"}, {"{, nome}"} e {"{quando}"}.
                  <textarea name="message" rows={2} defaultValue={r?.message || DEFAULT_RULES[kind].message} className="input" />
                </label>
              )}
              {owner && (
                <div>
                  <button className="btn">Salvar regra</button>
                </div>
              )}
            </form>
          );
        })}
      </div>

      {owner && (
        <section className="card mb-6 grid gap-3">
          <h2 className="font-semibold">Campanha de reativação</h2>
          {typeof notice === "string" && <p className="rounded-lg bg-warm-soft px-4 py-3 text-sm">{notice}</p>}
          <form action={queueReactivationAction} className="flex flex-wrap items-end gap-2">
            <label className="label">
              Clientes sem contato há (dias)
              <input name="days" inputMode="numeric" defaultValue={rules.reactivation?.delay ?? 60} className="input" />
            </label>
            <button className="btn-ghost">Colocar na fila</button>
          </form>
          <form action={processAutomationsNow}>
            <button className="btn-ghost">Processar fila agora</button>
          </form>
        </section>
      )}

      <section className="card grid gap-3">
        <h2 className="font-semibold">Fila e histórico</h2>
        {queue.length ? (
          <ul className="grid divide-y divide-line text-sm">
            {queue.map(({ item, name, phone }) => (
              <li key={item.id} className="grid gap-1 py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>
                    {AUTOMATION_LABELS[item.kind]} · {name || phone}
                  </strong>
                  <span className="text-muted">
                    {STATUS[item.status]} · {formatLong(item.runAt, business.timezone)}
                  </span>
                </div>
                {item.text && <p className="text-muted">“{item.text}”</p>}
                {item.result && <p className="text-xs text-muted">{item.result}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nada na fila.</Empty>
        )}
      </section>
    </>
  );
}
