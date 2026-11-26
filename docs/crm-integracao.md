# Integração futura com o CRM March

Regra: o CRM continua sendo a fonte oficial das informações comerciais da March. A March Assistente **não escreve no banco do CRM**
(nada foi alterado nele nesta sessão). O projeto Supabase `shellsea` parece ser o CRM (tabelas `leads`, `opportunities`, `meetings`,
`interactions`), mas isso precisa ser confirmado.

## Desenho proposto

Integração por eventos, com o CRM decidindo o que gravar:

1. A March Assistente envia eventos assinados (HMAC SHA-256, mesmo padrão do webhook da Meta) para uma URL do CRM
   (`CRM_WEBHOOK_URL`, segredo `CRM_WEBHOOK_SECRET`), só para empresas com a integração ligada:
   - `lead.updated`: telefone, nome, tipo de negócio, necessidade, interesse, etapa, resumo, link da conversa.
   - `handoff.requested`: motivo e link da conversa.
   - `meeting.requested`: assunto e preferência de horário (ferramenta `solicitar_horario`).
   - `contact.opted_out`: descadastro (o CRM deve respeitar).
2. O CRM tem um endpoint (Edge Function no Supabase ou rota do próprio CRM) que valida a assinatura e grava em `leads`/`interactions`
   com as regras dele (deduplicação por telefone, dono do lead etc.).
3. Leitura na direção contrária (opcional): a assistente consulta o CRM por uma API somente leitura para saber se o contato já é cliente.

## Pontos no código

- Os eventos nascem em `web/src/lib/assistant/tools.ts` (`atualizar_lead`, `solicitar_horario`, `chamar_atendente`, `registrar_descadastro`).
- Sugestão: criar `web/src/lib/crm.ts` com `emit(event, payload)` que grava numa tabela `outbound_events` (fila com reenvio) e um cron que
  entrega. Assim uma queda do CRM não afeta o atendimento.

Não implementado ainda: depende da confirmação da estrutura do CRM e de quem é o dono dos dados de cada cliente da March.
