import { COMPANY, LegalPage } from "@/components/legal-page";

export const metadata = { title: "Política de privacidade · Assistente March" };

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de privacidade">
      <p>
        Esta política explica como a {COMPANY.name} (CNPJ {COMPANY.cnpj}) trata dados pessoais na Assistente March, de acordo com a Lei Geral
        de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <h2>1. Papéis de cada um</h2>
      <ul>
        <li>
          <strong>Dados da sua conta</strong> (nome, e-mail, dados do negócio): a {COMPANY.name} é a controladora.
        </li>
        <li>
          <strong>Dados dos clientes do seu negócio</strong> (nome, telefone, mensagens e agendamentos): o seu negócio é o controlador e a{" "}
          {COMPANY.name} atua como operadora, tratando esses dados apenas para prestar o serviço, conforme suas instruções.
        </li>
      </ul>

      <h2>2. Dados que tratamos</h2>
      <ul>
        <li>Cadastro: nome, e-mail e senha (guardada de forma criptografada).</li>
        <li>Negócio: nome, serviços, preços, horários, profissionais e informações cadastradas para a assistente.</li>
        <li>Atendimento: nome e telefone dos clientes do negócio, conteúdo das conversas e agendamentos.</li>
        <li>Dados técnicos: endereço IP, navegador e registros de acesso, para segurança e funcionamento do serviço.</li>
      </ul>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Prestar o serviço: responder clientes, agendar e mostrar as informações no painel.</li>
        <li>Manter a conta segura, prevenir fraudes e cumprir obrigações legais.</li>
        <li>Dar suporte e comunicar mudanças importantes no serviço.</li>
      </ul>
      <p>Não vendemos dados pessoais e não usamos as conversas dos seus clientes para publicidade.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Apenas com fornecedores necessários para o serviço funcionar, sob obrigações de confidencialidade e segurança:</p>
      <ul>
        <li>Hospedagem do sistema (Vercel) e banco de dados (Neon, com servidores em São Paulo).</li>
        <li>Processamento de inteligência artificial (Anthropic), para gerar as respostas da assistente.</li>
        <li>WhatsApp (Meta), para enviar e receber as mensagens.</li>
        <li>Serviço de envio de e-mails, para mensagens como a recuperação de senha.</li>
      </ul>
      <p>
        Alguns desses fornecedores processam dados fora do Brasil. Nesses casos, a transferência segue o que a LGPD permite, com garantias
        contratuais de proteção.
      </p>

      <h2>5. Por quanto tempo guardamos</h2>
      <p>
        Enquanto a conta estiver ativa. Após o cancelamento, os dados são excluídos em até 90 dias, exceto o que precisarmos guardar por
        obrigação legal. O negócio pode pedir a exclusão de conversas e clientes a qualquer momento.
      </p>

      <h2>6. Segurança</h2>
      <p>
        Usamos conexões criptografadas, senhas protegidas por hash, separação dos dados de cada negócio e acesso restrito à equipe que
        precisa deles para dar suporte.
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode pedir confirmação, acesso, correção, portabilidade e exclusão dos seus dados, além de informações sobre compartilhamento.
        Clientes de um negócio devem fazer pedidos sobre seus dados diretamente ao negócio, que contará com o nosso apoio.
      </p>

      <h2>8. Contato</h2>
      <p>Para assuntos de privacidade e proteção de dados, fale com o nosso encarregado pelo e-mail {COMPANY.email}.</p>
    </LegalPage>
  );
}
