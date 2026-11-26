# WhatsApp oficial (Cloud API) · o que fazer no caso da March

> **Fontes e limitações desta pesquisa.** O domínio `developers.facebook.com` estava bloqueado na rede deste ambiente,
> então as informações vieram de buscas que retornam trechos da documentação oficial da Meta e de documentação de parceiros
> oficiais (360dialog, Twilio, Telnyx, Infobip). Itens marcados com **(confirmar)** devem ser conferidos na documentação da
> Meta antes de decisões contratuais. Links no fim.

## Resumo e recomendação

| Opção | Risco para o número atual da March | Custo/tempo | Recomendação |
|---|---|---|---|
| **A. Número de teste da Meta** | Nenhum | Grátis, ~1 hora | **Fazer já**: valida tudo de ponta a ponta com até 5 celulares cadastrados |
| **B. Número novo dedicado** (chip novo) direto na Cloud API | Nenhum | Chip + verificação do nome de exibição | **Para a demonstração e para os primeiros leads reais** |
| **C. Coexistência** do número comercial atual (app + API no mesmo número) | Baixo, mas não zero (ver limitações) | Exige Embedded Signup (Tech Provider ou parceiro BSP) | **Depois**, quando o produto estiver validado |

Nada foi conectado, migrado ou desconectado. Nenhuma das opções acima exige mexer no número comercial atual, exceto a C,
que só deve ser feita com sua autorização explícita.

## Conceitos

- **Business Portfolio** (antigo Business Manager, em business.facebook.com): a "empresa" na Meta. Dono das contas de WhatsApp.
- **App** (developers.facebook.com): o aplicativo da March que usa a API. Fornece o **App Secret** (assina os webhooks).
- **WABA** (WhatsApp Business Account): conta de WhatsApp dentro do portfolio. Tem o **WABA ID** (Business Account ID), templates e cobrança.
- **Phone Number ID**: identificador do número dentro da WABA. É por ele que a March Assistente descobre de qual empresa é cada mensagem.
- **Token de acesso**: o temporário do painel dura 24 h. Para produção, usar token de **System User** (usuário do sistema) com as permissões
  `whatsapp_business_messaging` e `whatsapp_business_management`.
- **Webhook**: a Meta chama `https://SEU-DOMINIO/api/whatsapp`. Na configuração, a Meta faz um GET com o *verify token*; depois, cada POST
  vem assinado com HMAC SHA-256 do App Secret (`x-hub-signature-256`). A March Assistente valida as duas coisas.
- **Janela de atendimento (24 h)**: depois de cada mensagem do cliente, o negócio pode responder com texto livre por 24 h. Fora dela, só
  **templates aprovados** (marketing, utilidade ou autenticação). A March Assistente bloqueia texto livre fora da janela.

## Preços (Brasil) **(confirmar)**

Segundo a página de preços da Meta (via busca) e parceiros, a partir de **01/10/2026**:

- Marketing: **R$ 0,3217** por mensagem entregue.
- Utilidade e autenticação: **R$ 0,035**.
- Atendimento (respostas de texto livre dentro da janela): **R$ 0,035**, com **1.000 grátis por número por mês**. Antes de out/2026 eram grátis.
- Utilidade dentro da janela, que era grátis, também passou a ser cobrada.
- Conversas iniciadas por anúncio "clique para WhatsApp" ou botão de chamada (Free Entry Point) abrem uma janela gratuita de 72 h.
- Cobrança em reais disponível para o Brasil; empresas elegíveis migram para BRL até 30/06/2027.

Este é o item que mais afeta a margem (ver `custos.md`). A página de marketing do WhatsApp ainda diz que atendimento é grátis: está
desatualizada em relação à documentação de desenvolvedores, por isso **confirme no Gerenciador do WhatsApp** antes de fechar preço com clientes.

## Política de IA da Meta

Desde 15/01/2026, os termos do WhatsApp Business proíbem **assistentes de IA de uso geral** (ex.: ChatGPT no WhatsApp) na API. Assistentes
de **atendimento de uma empresa** (suporte, vendas, agendamento) continuam permitidos: é o caso da March Assistente. O prompt já restringe a
assistente ao negócio de cada cliente. Há investigações de órgãos de concorrência (inclusive no Brasil) sobre essa regra.

## Limites

- Envio iniciado pelo negócio (templates): limite por **portfolio** de 250 → 2.000 → 10.000 → 100.000 → ilimitado contatos únicos por 24 h.
  Portfolio novo começa em 250; a verificação empresarial libera 2.000. Respostas dentro da janela não contam.
- Vazão: ~80 mensagens/segundo por número (coexistência: menor, 5–20 msg/s, **confirmar**).
- Sem verificação empresarial: até 2 números por portfolio.

## Opção A · Número de teste da Meta (fazer agora)

O que você faz (eu não tenho acesso à sua conta da Meta):

1. Em **business.facebook.com**, confirme que existe o portfolio "March Company" e que você é administrador.
2. Em **developers.facebook.com** → *Meus apps* → *Criar app* → caso de uso **"Conectar-se com clientes pelo WhatsApp"**, ligado ao portfolio da March.
3. No app, **WhatsApp → Configuração da API**: a Meta cria um número de teste e uma WABA de teste.
   - Anote o **Phone Number ID** e o **WhatsApp Business Account ID**.
   - Em *Para*, cadastre até 5 celulares que vão testar (o seu, o do Kauã…). Cada um confirma por código.
4. **Configurações do app → Básico**: copie o **App Secret**.
5. **Token permanente**: Configurações do negócio → *Usuários do sistema* → criar usuário (Admin) → *Adicionar ativos*: o app e a WABA
   (controle total) → *Gerar token* com `whatsapp_business_messaging` e `whatsapp_business_management`.
   **Não cole o token em chats**: coloque direto nas variáveis da Vercel.
6. Na **Vercel** (projeto da March Assistente), defina:
   - `WHATSAPP_APP_SECRET` = App Secret
   - `WHATSAPP_VERIFY_TOKEN` = um texto aleatório que você inventa
   - `WHATSAPP_ACCESS_TOKEN` = token do usuário do sistema
   - `DATA_ENCRYPTION_KEY` = texto aleatório com 40+ caracteres (cifra tokens de clientes)
   - `CRON_SECRET` = texto aleatório (protege o processamento de automações)
   - `ANTHROPIC_API_KEY` (já deve existir) e, opcional, `RESEND_API_KEY` + `EMAIL_FROM` para os alertas por e-mail
7. **Antes do deploy desta versão**, aplique as migrations no banco de produção: `cd web && npm run db:migrate` com o `DATABASE_URL` de produção
   no `.env.local` (apenas adiciona colunas e tabelas). Depois faça o deploy (merge na `main`).
8. No app da Meta, **WhatsApp → Configuração → Webhook**: URL `https://SEU-DOMINIO/api/whatsapp`, token = o mesmo `WHATSAPP_VERIFY_TOKEN`.
   Clique em verificar e **assine o campo `messages`**.
9. No painel da March Assistente: crie sua conta, rode `npm run seed:march -- seu@email` (ou configure pela tela), revise tudo em
   *Assistente*, teste no *Testar assistente* e só então preencha o **Phone Number ID** e o **WABA ID** em *Assistente → WhatsApp*.
10. Do celular cadastrado, mande mensagem para o número de teste e siga o roteiro de `plano-de-testes.md` (parte "ponta a ponta").

Validação de verdade = a resposta chega no celular **e** aparece no painel como "entregue/lida" (status vindo do webhook da Meta), não apenas
um 200 na requisição.

## Opção B · Número novo dedicado (recomendado para a demonstração)

1. Chip novo (nunca usado no WhatsApp, ou com o WhatsApp apagado nele).
2. No app da Meta → *WhatsApp → Configuração da API → Adicionar número*: nome de exibição (ex.: "March Company"), categoria, verificação por SMS/ligação.
3. Defina o PIN de duas etapas quando pedido. O nome de exibição passa por aprovação da Meta.
4. Adicione uma forma de pagamento na WABA (necessária para conversas reais e templates).
5. Inicie a **verificação empresarial** do portfolio (CNPJ, comprovante, domínio marchcompany.com.br). Ela libera limites maiores e é pré-requisito para a opção C e para vender a clientes.
6. Troque o Phone Number ID no painel. O número de teste pode continuar existindo.

## Opção C · Coexistência com o WhatsApp Business do celular

Permite usar a API e o app **no mesmo número**, mantendo o app e o histórico. O que a Meta e os parceiros documentam:

- É feito pelo **Embedded Signup** com a opção de coexistência (ou seja, por um app de **Tech Provider** ou por um **parceiro BSP**).
  Não há confirmação oficial de que uma empresa consiga fazer isso sozinha com o próprio app sem ser Tech Provider **(confirmar)**.
- App WhatsApp Business **versão 2.24.17 ou superior**. O número precisa estar em uso no app (parceiros pedem 7+ dias).
- Disponibilidade varia por país **(confirmar Brasil)**.
- Sincroniza contatos e até **6 meses** de histórico de conversas individuais (não grupos). A sincronização precisa terminar em 24 h.
- **Aparelhos conectados (WhatsApp Web/Desktop) são desconectados** no processo e precisam ser reconectados.
- O app precisa ser aberto periodicamente (parceiros citam a cada ~13 dias) para manter a conexão.
- Não funcionam pela API: mensagens temporárias, visualização única, localização em tempo real, listas de transmissão, grupos.
- Mensagens enviadas pelo **app** não são cobradas e não abrem janela da API. Vazão menor.
- Mensagens que o atendente envia pelo app chegam na API por webhook (`smb_message_echoes`). A March Assistente já trata esse webhook: registra a
  mensagem como "Equipe" e **pausa a IA** naquela conversa (coberto por teste automatizado; o formato exato do payload deve ser conferido com um
  número real em coexistência). No app da Meta, assine também o campo `smb_message_echoes`.

**Riscos**: desconexão dos aparelhos vinculados durante o processo; dependência de abrir o app; recursos que deixam de funcionar.
Não há relato de perda de conversas no processo, mas faça backup do WhatsApp antes. **Só faremos com sua autorização explícita.**

## Para vender a clientes (WS Training Studio e outros)

O caminho oficial é a March se tornar **Tech Provider** da Meta:

1. Verificação empresarial do portfolio da March (obrigatória antes da revisão do app).
2. Revisão do app (App Review) pedindo acesso avançado a `whatsapp_business_management` e `whatsapp_business_messaging`, com vídeo de tela
   mostrando o uso (ex.: criar um template pelo painel). Prazo típico citado por parceiros: ~24 h depois de enviado.
3. Implementar o **Embedded Signup** (botão "Conectar WhatsApp" no painel): o cliente entra com a conta dele, escolhe/cria a WABA e o número
   (inclusive coexistência), e o app da March recebe acesso. A WABA e o número continuam do cliente.
4. A March Assistente já guarda Phone Number ID, WABA ID e **token por cliente, cifrado**, prontos para esse fluxo. O botão do Embedded Signup
   ainda não foi implementado (depende do app aprovado).

Alternativa mais rápida: usar um BSP (360dialog, Twilio, Infobip…) que já é parceiro e oferece Embedded Signup e coexistência, com custo por número.

## Fontes

- Meta · Preços: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Meta · Mudanças de preço de mensagens de atendimento/utilidade: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
- Meta · Onboarding de usuários do WhatsApp Business app (coexistência): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Meta · Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Meta · App Review: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review
- WhatsApp Business Solution Terms: https://www.whatsapp.com/legal/business-solution-terms
- TechCrunch sobre a política de IA: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform
- 360dialog · Coexistência: https://docs.360dialog.com/docs/hub/embedded-signup/whatsapp-coexistence
- Telnyx · Coexistência: https://developers.telnyx.com/docs/messaging/whatsapp/coexistence
- Twilio · Tech Provider FAQ: https://twilio.com/docs/whatsapp/tech-provider-program/faq
- Preços Brasil out/2026 (secundárias): https://vectalk.com.br/blog/en/whatsapp-api-pricing-brazil/ · https://www.crminer.com.br/en/blog/whatsapp-business-api-cobranca-outubro-2026 · https://www.flowcall.co/blog/whatsapp-business-api-pricing
- Limites de envio (secundárias): https://chatarmin.com/en/blog/whats-app-messaging-limits · https://www.nonito.io/guides/whatsapp-messaging-limits
