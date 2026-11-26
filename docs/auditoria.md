# Auditoria técnica · March Assistente (nov/2026)

Escopo: repositório `marchhcompany/secretaria-ia` (branch `main` em `7c40bc7`), banco, integrações e deploy.
Esta auditoria foi feita a partir do código e de testes locais. Não houve acesso à Vercel, ao banco de produção nem à conta da Meta.

## 1. O que existia antes desta sessão

| Item | Situação encontrada |
|---|---|
| Stack | Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind 4, Drizzle ORM + PostgreSQL, Better Auth, SDK da Anthropic, WhatsApp Cloud API. Deploy na Vercel (pasta `web/`). |
| Git | 4 commits, sem alterações pendentes. Código "importado do deploy de produção na Vercel". Sem CI, sem testes automatizados. |
| Banco | Postgres via `DATABASE_URL`. Os comentários do código citam Neon. **Não é Supabase**: os dois projetos Supabase da conta são `point-saudavel` e `shellsea` (este último parece ser o CRM: `opportunities`, `leads`, `meetings`). Nenhum dos dois foi alterado. |
| RLS | Não se aplica: o app acessa o banco só pelo servidor com uma conexão única; o isolamento entre empresas é feito no código (`business_id` em toda consulta). |
| Migrations | `0000_init` e `0001_whatsapp` (Drizzle). |
| IA | Claude (padrão `claude-opus-5-5`, esforço `low`) com ferramentas de agenda e `chamar_atendente`. Prompt voltado a clínicas/salões (agendamento). |
| WhatsApp | Cloud API oficial: webhook com verificação HMAC, deduplicação por `wamid`, trava por conversa, envio de texto, "digitando…". Um único token global para todos os negócios. |
| Painel | Visão geral, agenda, conversas (assumir/devolver), simulador, serviços, horários, assistente (FAQ), conexão de WhatsApp por Phone Number ID. |

### Classificação das funcionalidades (antes)

| Funcionalidade | Classificação |
|---|---|
| Cadastro, login, recuperação de senha | Implementada, não validada em produção nesta sessão |
| Multiempresa (dados por `business_id`) | Parcial: um usuário só via a primeira empresa; sem papéis efetivos |
| Webhook WhatsApp (assinatura, deduplicação) | Implementada, não validada com número real |
| Agente com agenda (horários livres, agendar, cancelar) | Implementada, validada só por script manual |
| Passar para humano / devolver para IA | Parcial: a IA podia responder depois que a equipe assumisse (corrida), a equipe não via o que a IA pausada deixou de responder |
| Várias mensagens seguidas | Parcial: respostas em fila, uma para cada mensagem |
| Falha do provedor de IA | Parcial: cliente ficava sem resposta; a mensagem do cliente se perdia do contexto da IA |
| Áudio | Simulado: resposta fixa pedindo texto (sem transcrição) |
| Base de conhecimento | Parcial (FAQ) |
| Regras comerciais (não informar preço etc.) | Não implementada (só texto livre em "instruções"; o prompt sempre listava preços) |
| Leads (classificação, resumo) | Não implementada |
| Follow-up, lembretes, reativação, agendamento de mensagens | Não implementada |
| Opt-out / consentimento | Não implementada |
| Templates da Meta | Não implementada |
| Controle de custos | Não implementada |
| Notificação para a equipe | Parcial (só contador no painel) |
| Métricas | Parcial (3 contadores) |
| Integração com CRM | Não implementada |

### Vulnerabilidades e riscos encontrados

1. **Token único do WhatsApp para todas as empresas** (`WHATSAPP_ACCESS_TOKEN`): inviável para clientes com números próprios. Corrigido: token por empresa, cifrado (AES-256-GCM).
2. **IA podia falar junto com o atendente**: se a equipe assumisse enquanto a IA gerava a resposta, a resposta saía mesmo assim. Corrigido e testado.
3. **Sem limite de custo**: um contato insistente ou um loop podia gerar custo ilimitado. Corrigido: teto mensal por empresa e limite de 40 respostas automáticas por conversa em 24 h.
4. **Prompt listava preços sempre**: contrariava a regra comercial da March. Corrigido: opção "nunca informar preços" (os preços nem entram no prompt).
5. **Membro "staff" podia alterar tudo** (papéis não eram checados). Corrigido: configurações exigem papel de dono.
6. **Status de entrega ignorados**: mensagem não entregue não gerava alerta. Corrigido.
7. Pendente (não corrigido): o painel não tem limite de tentativas de login além do que o Better Auth oferece por padrão; e-mails dependem de `RESEND_API_KEY` (sem ela, links de senha vão só para o log).
8. Pendente: a deduplicação grava o `wamid` antes de processar; se o servidor cair no meio, aquela mensagem não é reprocessada (a conversa fica marcada para a equipe só se a falha for da IA).

## 2. O que foi feito nesta sessão

Fases 1–3 e a parte de software das fases 5–6. Tudo coberto por testes automatizados (seção 4).

**Motor da assistente** (`web/src/lib/assistant/`, `web/src/lib/whatsapp/`)
- Fila por conversa: mensagens seguidas viram **uma** resposta (espera de 4 s + trava no Postgres).
- IA nunca responde com a conversa pausada; resposta gerada durante a troca é descartada (marcada "descartada" no painel).
- Ao retomar a IA, ela recebe o que a equipe escreveu enquanto estava pausada.
- Falha da IA: o cliente recebe um único aviso ("já já alguém da equipe te responde"), a equipe é avisada por e-mail e no painel, e a mensagem do cliente entra no contexto da próxima resposta. O SDK repete automaticamente erros temporários (429/5xx) até 3 vezes.
- Descadastro: pedidos explícitos ("não quero mais receber", "parar"…) são tratados sem IA; a IA também tem a ferramenta `registrar_descadastro` para pedidos indiretos.
- Ferramenta `atualizar_lead`: a própria IA registra nome, tipo de negócio, necessidade, interesse (frio/morno/quente), etapa e resumo.
- Modo de agenda por empresa: agenda direto, só registra pedido (equipe confirma) ou desligado.
- Custo por chamada gravado em `ai_usage` (tokens reais × preço oficial); cache do prompt e do histórico.
- Recusa do modelo: fallback automático do servidor (Opus/Sonnet) e passagem para a equipe.

**Automações** (`web/src/lib/automations.ts`, `/api/cron/automations`)
- Follow-up (cancelado se o cliente responder), lembrete de compromisso (cancelado se o agendamento for cancelado), campanha de reativação (só com consentimento de marketing).
- Trava de segurança: **por padrão nada é enviado** (modo simulação). Ligar exige digitar "ENVIAR DE VERDADE".
- Respeita a janela de 24 h: fora dela, só template aprovado; sem template, não envia e explica o motivo.

**Painel** (`web/src/app/painel/`)
- Assistente: identidade, regras comerciais (preços, pagamento, objetivo, perguntas de qualificação, instruções), modo de agenda, IA ligada/desligada, modelo, teto de custo, e-mails de alerta, divisão de respostas, base de conhecimento, WhatsApp (Phone Number ID, WABA ID, token próprio).
- Conversas: rótulos "Assistente (IA)", "Equipe", "Automação"; status de entrega; pausar/retomar IA; janela de 24 h; painel do lead com resumo e custo da conversa.
- Leads (filtro por etapa, edição, consentimento, descadastro), Automações, Custos, Empresas e equipe (troca de empresa, convidar membro, papéis).

**Banco**: migrations `0002_commercial` e `0003_split_replies` (apenas colunas e tabelas novas; nada é apagado).

### Classificação atual

| Funcionalidade | Classificação |
|---|---|
| Atendimento por IA com regras comerciais configuráveis | Implementada e validada por testes automatizados; comportamento do modelo real **ainda não validado** (falta `ANTHROPIC_API_KEY` neste ambiente; use `npm run eval`) |
| Pausar/retomar IA, assumir conversa, histórico, rótulos | Implementada e validada (testes + navegador local) |
| Mensagens seguidas, duplicidade de webhook, concorrência | Implementada e validada (testes + HTTP local) |
| Falha do provedor de IA | Implementada e validada (teste com erro 500 simulado) |
| Classificação e resumo do lead | Implementada; depende do modelo real para validar a qualidade |
| Notificação da equipe | Implementada (e-mail via Resend + painel); e-mail não validado sem `RESEND_API_KEY` |
| Controle de custos por empresa e conversa | Implementada e validada (testes) |
| Follow-up, lembretes, reativação, opt-out, janela de 24 h | Implementada e validada em modo simulação; **envio real não validado** |
| Templates da Meta | Implementado o envio; nenhum template criado/aprovado ainda |
| WhatsApp real (Cloud API) | Implementada; **não validada com número real** (depende das etapas da Meta, ver `whatsapp-meta.md`) |
| Áudio | Simulada (pede texto). Transcrição não implementada |
| Multiempresa, papéis, isolamento | Implementada e validada (testes de isolamento) |
| Onboarding de clientes por Embedded Signup | Não implementada (requer March como Tech Provider, ver `whatsapp-meta.md`) |
| Integração com CRM March | Não implementada; desenho em `crm-integracao.md` |

## 3. Custos operacionais

Ver `custos.md`. Em resumo: a IA com Opus 5.5 custa cerca de US$ 0,16 por conversa (estimativa), o que inviabiliza R$ 500/mês acima de ~300 conversas. Sonnet 5.5 custa metade e Haiku 5.5 cerca de 1/40. A escolha do modelo é por empresa, no painel, e deve ser decidida depois de rodar `npm run eval` com cada um.

## 4. Testes

`cd web && npm test` roda 23 testes de integração com Postgres real, modelo roteirizado e WhatsApp falso (sem custo e sem envio real). Ver `plano-de-testes.md`.

## 5. Revisão de segurança da PR (26/11/2026)

Revisão do diff completo contra a `main`.

| Área | Verificação | Resultado |
|---|---|---|
| Autenticação | Painel protegido por sessão (`requireBusiness` em toda página e ação); `proxy.ts` só faz o redirecionamento rápido | OK |
| Cadastro | Era aberto: qualquer pessoa podia criar conta e gastar IA no simulador | **Corrigido**: `SIGNUP_ALLOWED_EMAILS` (validado no banco, vale até para chamadas diretas à API; testado via HTTP) e teto inicial de US$ 5/mês para empresas novas |
| Permissões | Configurações, base de conhecimento, WhatsApp, automações e equipe exigem papel de dono; atender conversas e editar leads, papel de equipe | OK |
| Isolamento | Toda consulta do painel filtra pelo `business.id` da sessão; o webhook resolve a empresa pelo Phone Number ID; as ferramentas da IA só alcançam o cliente da conversa; os status de entrega são filtrados por empresa; a troca de empresa valida a participação | OK (testes de isolamento) |
| Webhook | HMAC SHA-256 com comparação em tempo constante sobre o corpo bruto; GET de verificação com token; deduplicação por `wamid` | OK (testado via HTTP: 401 com assinatura inválida, duplicata ignorada) |
| Cron | `Authorization: Bearer CRON_SECRET` com comparação em tempo constante; sem segredo, endpoint desligado | OK |
| Segredos | Tokens de clientes cifrados com AES-256-GCM (`DATA_ENCRYPTION_KEY`); nenhum segredo no repositório (`.env.test` só tem valores falsos) | OK |
| Concorrência | Trava por conversa no Postgres (`pg_advisory_xact_lock`), funciona entre instâncias; resposta descartada se a equipe assumir no meio | OK (testes) |
| Custos | Teto mensal por empresa, limite de 40 respostas por conversa a cada 24 h, custo por chamada registrado | OK (testes) |
| Alertas | Cada mensagem de cliente em conversa já com a equipe gerava um novo e-mail | **Corrigido**: um alerta por transição (testado) |
| Descadastro | A palavra "cancelar" sozinha era tratada como descadastro ("cancelar meu horário") | **Corrigido** (testado) |
| IA sem chave | Mensagens ficavam pendentes e seriam respondidas em bloco dias depois | **Corrigido**: entram no histórico e a conversa vai para a equipe |
| Injeção de prompt | O cliente pode tentar instruir a IA ("ignore as regras") | Risco residual: o prompt não tem dados de outras empresas e as ferramentas só agem no próprio cliente, então o pior caso é uma resposta fora das regras, visível no painel |
| Reprocessamento | Se o servidor cair entre a deduplicação e a resposta, a mensagem não é reprocessada | Risco residual conhecido (baixo volume); a mensagem fica visível no painel |
| Força bruta no login | Limite de tentativas padrão do Better Auth | Não revisado a fundo |
