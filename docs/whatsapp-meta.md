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

## Preços: CONFIRMADO na página oficial da Meta (lida em 26/11/2026)

Fonte: developers.facebook.com/documentation/business-messaging/whatsapp/pricing e .../pricing/non-template-messages.

- Desde **01/10/2026**, a Meta cobra **cada mensagem de atendimento** (texto livre respondendo ao cliente dentro da janela de 24 h),
  inclusive as geradas por IA de terceiros como a nossa. Antes, eram grátis desde 01/11/2024.
- **1.000 mensagens de atendimento grátis por número por mês** (não acumulam; renovam todo mês). Cobra a partir da 1.001ª.
- A tarifa de atendimento é **igual à de utilidade/autenticação** de cada país. A Meta cita **US$ 0,0068 por mensagem no Brasil**
  (tarifa de utilidade em vigor em 01/07/2026). Os valores de 01/10/2026 estão nas planilhas CSV/PDF da página (há tabela em **BRL**),
  que não consegui extrair: **confirmar o valor exato em reais** lá ou no Gerenciador do WhatsApp.
- Utilidade enviada dentro da janela também passou a ser cobrada (desde 01/10/2026).
- Só cobra mensagem **entregue**. Conversas iniciadas por anúncio "clique para WhatsApp" abrem uma janela gratuita (Free Entry Point).
- **Atenção:** sem **forma de pagamento cadastrada** na conta, a Meta **para de entregar mensagens de atendimento**. Cadastrar antes
  da validação real (Business Settings → Billing → Payment methods).
- Marketing: não extraí o valor oficial do Brasil (o número R$ 0,3217 da versão anterior deste documento vem de fonte secundária).

## Política de IA da Meta

Desde 15/01/2026, os termos do WhatsApp Business proíbem **assistentes de IA de uso geral** (ex.: ChatGPT no WhatsApp) na API. Assistentes
de **atendimento de uma empresa** (suporte, vendas, agendamento) continuam permitidos: é o caso da March Assistente. O prompt já restringe a
assistente ao negócio de cada cliente. Há investigações de órgãos de concorrência (inclusive no Brasil) sobre essa regra.

## Limites

- Envio iniciado pelo negócio (templates): limite por **portfolio** de 250 → 2.000 → 10.000 → 100.000 → ilimitado contatos únicos por 24 h.
  Portfolio novo começa em 250; a verificação empresarial libera 2.000. Respostas dentro da janela não contam.
- Vazão: ~80 mensagens/segundo por número (coexistência: menor, 5–20 msg/s, **confirmar**).
- Sem verificação empresarial: até 2 números por portfolio.

## Opção A · Número de teste da Meta (guia prático)

> Sequência e rótulos conferidos no guia oficial "Get started" da Cloud API (26/11/2026). A interface pode estar em português; os nomes
> em inglês entre aspas são os da documentação. Na documentação nova, a "WABA" aparece como **Messaging account**.

### Credenciais: teste x produção

| Credencial | Para que serve | Teste (hoje) | Produção |
|---|---|---|---|
| Token de acesso | Enviar mensagens | **Token temporário** ("Generate access token" em *API Setup*; a Meta diz que "expira rápido") | **Token de usuário do sistema**, com `business_management`, `whatsapp_business_messaging` e `whatsapp_business_management` |
| Phone Number ID | Saber de qual número é cada mensagem | ID do número de teste | ID do número definitivo |
| WABA ID | Templates e cobrança | WABA de teste criada pela Meta | WABA definitiva |
| App Secret | Conferir a assinatura dos webhooks | O mesmo nos dois | O mesmo |
| Verify token | Confirmar o webhook | Você inventa | Você inventa |

O token temporário serve para o primeiro teste. Para a demonstração à WS, troque pelo token de usuário do sistema (passo 11).

### Passos

1. **Conta**: use o Facebook pessoal que é administrador do portfolio da March em business.facebook.com.
2. Abra **developers.facebook.com** → *Meus apps* → **Criar app**.
3. Caso de uso: **"Conectar-se com clientes pelo WhatsApp"** (em inglês, "Connect with customers through WhatsApp"). Se pedir o tipo,
   escolha **Empresa / Business**. Nome do app: "March Assistente". Portfolio: **March Company**.
4. No painel do app, abra **WhatsApp → Configuração da API** ("API Setup"). A Meta cria um **número de teste** e uma WABA de teste.
   Aparecem: o número de teste (campo *De/From*), o **Phone Number ID** e o **WhatsApp Business Account ID**.
5. No campo **Para/To**, clique em *Gerenciar lista de números* e **adicione o seu celular** (a Meta permite poucos destinatários no
   número de teste, normalmente 5). Você recebe um código no WhatsApp para confirmar.
6. Ainda nessa tela, clique em **Enviar mensagem**: chega no seu celular o template `hello_world`. Isso prova que o app envia.
7. **Configurações do app → Básico** → *Chave secreta do app* ("App Secret") → *Mostrar*.
8. Na **Vercel**, coloque as variáveis no ambiente **Production** (marcadas como *Sensitive*): `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` e as do `deploy-checklist.md`. **Não cole tokens no chat**, nem os envie para mim.
9. **WhatsApp → Configuração** ("Configuration") → *Webhook* → **Editar**: URL de callback `https://<domínio>/api/whatsapp`, token de
   verificação = o mesmo `WHATSAPP_VERIFY_TOKEN` → **Verificar e salvar**. Depois, em *Campos do webhook*, **assine `messages`**.
10. No painel da March Assistente → *Assistente → WhatsApp*: preencha o Phone Number ID e o WABA ID → *Salvar WhatsApp*.
11. Produção: business.facebook.com → **Configurações do negócio → Usuários do sistema** → *Adicionar* (função Admin) → *Atribuir
    ativos*: o app e a WABA, com controle total → **Gerar novo token** → app "March Assistente", validade *Nunca*, permissões
    `business_management`, `whatsapp_business_messaging` e `whatsapp_business_management` → copie direto para `WHATSAPP_ACCESS_TOKEN` na Vercel e faça redeploy.
12. Do seu celular, mande "Oi" para o número de teste. A resposta da assistente deve chegar e aparecer no painel como *entregue/lida*.

Validação de verdade = a resposta chega no celular **e** o painel mostra o status *entregue/lida* vindo do webhook da Meta. Um 200 na
requisição não basta.

### Não confirmado (documentação oficial inacessível neste ambiente)

- Quantos destinatários o número de teste aceita e se as mensagens dele são cobradas (não consta na página lida).
- O valor exato em reais da tarifa de atendimento/utilidade de 01/10/2026 (está em planilha na página oficial).
- Lista de países da coexistência.

## Opção B · Número novo dedicado (recomendado para a demonstração)

1. Chip novo (nunca usado no WhatsApp, ou com o WhatsApp apagado nele).
2. No app da Meta → *WhatsApp → Configuração da API → Adicionar número*: nome de exibição (ex.: "March Company"), categoria, verificação por SMS/ligação.
3. Defina o PIN de duas etapas quando pedido. O nome de exibição passa por aprovação da Meta.
4. Adicione uma forma de pagamento na WABA (necessária para conversas reais e templates).
5. Inicie a **verificação empresarial** do portfolio (CNPJ, comprovante, domínio marchcompany.com.br). Ela libera limites maiores e é pré-requisito para a opção C e para vender a clientes.
6. Troque o Phone Number ID no painel. O número de teste pode continuar existindo.

## Opção C · Coexistência com o WhatsApp Business do celular

**Confirmado na página oficial** (".../embedded-signup/onboarding-business-app-users", lida em 26/11/2026):

- Só pode ser feito por quem **já é Solution Partner ou Tech Provider** da Meta, via Embedded Signup. A March, hoje, não é: para usar
  coexistência no próprio número precisaria virar Tech Provider ou usar um parceiro.
- App WhatsApp Business **2.24.17** ou superior. Vazão fixa de **20 mensagens/segundo**.
- Sincroniza conversas individuais dos **últimos 6 meses** (se a empresa autorizar); **grupos não sincronizam**. O histórico precisa ser
  sincronizado em até 24 h depois do onboarding.
- **Mensagens temporárias são desligadas** e **listas de transmissão ficam desativadas** (as existentes viram só leitura).
- Todos os **aparelhos vinculados são desconectados** e podem ser reconectados; **WhatsApp para Windows** e WearOS não são suportados.
- Webhooks: `history`, `smb_app_state_sync` e `smb_message_echoes` (mensagens enviadas pelo app do celular).

Não encontrei na página uma lista de países (não confirmado se o Brasil tem alguma restrição). Os itens abaixo vêm de parceiros e
continuam **a confirmar**:

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
