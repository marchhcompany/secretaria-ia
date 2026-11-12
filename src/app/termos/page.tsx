import { COMPANY, LegalPage } from "@/components/legal-page";

export const metadata = { title: "Termos de uso · Assistente March" };

export default function TermosPage() {
  return (
    <LegalPage title="Termos de uso">
      <p>
        Estes termos regulam o uso da Assistente March, serviço oferecido pela {COMPANY.name}, inscrita no CNPJ {COMPANY.cnpj}. Ao criar uma
        conta, você declara que leu e concorda com estes termos e com a nossa Política de privacidade.
      </p>

      <h2>1. O serviço</h2>
      <p>
        A Assistente March é uma assistente virtual com inteligência artificial que atende os clientes do seu negócio pelo WhatsApp: responde
        dúvidas com base nas informações que você cadastra, consulta horários livres, agenda, remarca e cancela atendimentos e passa a
        conversa para a sua equipe quando necessário. O serviço inclui um painel para acompanhar a agenda e as conversas.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Você é responsável pelas informações da conta e por manter sua senha em segredo.</li>
        <li>Você deve ter poderes para representar o negócio cadastrado.</li>
        <li>Avise-nos imediatamente se suspeitar de acesso indevido à sua conta.</li>
      </ul>

      <h2>3. Responsabilidades do negócio</h2>
      <ul>
        <li>Manter atualizadas as informações de serviços, preços, horários e regras usadas pela assistente.</li>
        <li>Usar o serviço de acordo com a lei, com as políticas do WhatsApp e com as normas da sua profissão.</li>
        <li>Informar seus clientes de que o atendimento pode ser feito por uma assistente virtual.</li>
        <li>Revisar os atendimentos que a assistente passar para a equipe.</li>
      </ul>

      <h2>4. Limites da inteligência artificial</h2>
      <p>
        A assistente responde com base nas informações cadastradas e pode cometer erros. Ela não presta orientação médica, odontológica,
        jurídica ou de qualquer natureza profissional, e é configurada para encaminhar à equipe os assuntos que exigem uma pessoa. A decisão
        final sobre atendimentos, preços e condições é sempre do negócio.
      </p>

      <h2>5. Planos, pagamento e cancelamento</h2>
      <p>
        Os valores e condições do plano contratado são informados antes da contratação. Você pode cancelar a qualquer momento; o acesso
        continua até o fim do período já pago. Em períodos de teste ou piloto, as condições combinadas por escrito prevalecem.
      </p>

      <h2>6. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o serviço disponível o tempo todo, mas ele depende de fornecedores como o WhatsApp e provedores de nuvem e
        pode passar por interrupções. Avisaremos com antecedência sobre manutenções programadas sempre que possível.
      </p>

      <h2>7. Propriedade e dados</h2>
      <p>
        Os dados do seu negócio e dos seus clientes pertencem a você. O software, a marca e o conteúdo da Assistente March pertencem à{" "}
        {COMPANY.name}. O tratamento de dados pessoais segue a nossa Política de privacidade e a Lei Geral de Proteção de Dados (Lei
        13.709/2018).
      </p>

      <h2>8. Suspensão</h2>
      <p>
        Podemos suspender contas usadas para spam, fraude, conteúdo ilegal ou em violação das políticas do WhatsApp, ou em caso de falta de
        pagamento, sempre com aviso prévio quando a situação permitir.
      </p>

      <h2>9. Alterações e contato</h2>
      <p>
        Podemos atualizar estes termos. Mudanças relevantes serão comunicadas por e-mail ou no painel. Dúvidas: {COMPANY.email}. Fica eleito o
        foro do domicílio do contratante para resolver eventuais questões.
      </p>
    </LegalPage>
  );
}
