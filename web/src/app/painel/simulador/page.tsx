import { modelSpecFor, providerFor } from "@/lib/ai";
import { requireBusiness } from "@/lib/business";
import { loadSimulator } from "../actions";
import { PageHeader } from "../ui";
import { Chat } from "./chat";

export default async function SimuladorPage() {
  const { business } = await requireBusiness();
  const initial = await loadSimulator();
  const configured = providerFor(modelSpecFor(business)).provider.configured();

  return (
    <>
      <PageHeader title="Testar assistente">
        Converse como se fosse um cliente no WhatsApp. Os agendamentos feitos aqui entram de verdade na agenda, então cancele os testes depois.
      </PageHeader>
      {!configured && (
        <p className="mb-4 rounded-lg bg-warm-soft px-4 py-3 text-sm">
          A inteligência artificial ainda não está ativada: falta a chave do provedor do modelo escolhido (ex.: ANTHROPIC_API_KEY,
          OPENAI_API_KEY, GEMINI_API_KEY) nas variáveis do servidor. As mensagens ficam salvas, mas a assistente não responde.
        </p>
      )}
      <Chat
        businessName={business.name}
        timeZone={business.timezone}
        initialConversationId={initial.conversationId}
        initialMessages={initial.messages}
      />
    </>
  );
}
