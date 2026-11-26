# Checklist de deploy · banco, backup e rollback

Nada desta lista foi executado em produção. Cada passo marcado **(você)** depende de acesso à Vercel ou ao Neon.

## 1. Confirmar o banco de produção (você)

Evidências no código de que é **Neon** (região São Paulo): a página de privacidade (`web/src/app/privacidade/page.tsx`) diz
"banco de dados (Neon, com servidores em São Paulo)", e há comentários sobre o pooler do Neon. **Não confirmado**: este ambiente não
tem acesso à Vercel nem ao Neon. Para confirmar:

1. Vercel → projeto da March Assistente → *Settings → Environment Variables* → `DATABASE_URL`: o host termina em `neon.tech`?
2. Veja também se *Preview* e *Production* usam o **mesmo** `DATABASE_URL`. Se for o mesmo, a branch desta PR já pode ter gerado um
   deploy de pré-visualização apontando para o banco de produção sem as migrations: ele daria erro nas telas novas, mas não altera dados.

## 2. Migrations desta versão

| Arquivo | O que faz | Destrutivo? |
|---|---|---|
| `0002_commercial.sql` | Cria `ai_usage`, `automation_rules`, `scheduled_messages`; adiciona colunas com valor padrão em `businesses`, `customers`, `conversations`, `messages` | Não |
| `0003_split_replies.sql` | Adiciona `businesses.split_replies` (padrão true) | Não |
| `0004_transcript_provider.sql` | Adiciona `conversations.transcript_provider` (padrão 'anthropic') | Não |

Conferido: nenhum `DROP`, `RENAME`, `DELETE` ou mudança de tipo. A versão atual em produção continua funcionando depois das migrations
(ela só lê as colunas que conhece). Por isso a ordem segura é: **backup → migrations → deploy**.

## 3. Backup antes das migrations (você)

No Neon: *Branches → Create branch* a partir de `main` com o nome `backup-antes-0002` (cópia instantânea do banco inteiro). Opcional:
anotar o horário, porque o Neon também permite restaurar para um momento anterior dentro do período de histórico do plano
(**confirmar** o período no seu plano).

## 4. Aplicar as migrations (você, ou eu se me passar acesso)

```bash
cd web
DATABASE_URL="<url de produção>" node node_modules/drizzle-kit/bin.cjs migrate
```

O Drizzle registra o que já foi aplicado na tabela `drizzle.__drizzle_migrations`; aplicar duas vezes não repete nada.

## 5. Variáveis na Vercel (Production)

Obrigatórias para esta versão: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AI_MODEL`, a chave do provedor de IA escolhido,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `DATA_ENCRYPTION_KEY`.
Recomendadas: `SIGNUP_ALLOWED_EMAILS` (fecha o cadastro durante a validação), `CRON_SECRET`, `RESEND_API_KEY` e `EMAIL_FROM`.
**Remover ou atualizar `ANTHROPIC_MODEL`**: se estiver `claude-opus-5-5`, continua valendo como padrão enquanto `AI_MODEL` não for definido.

## 6. Deploy e rollback

- Deploy: merge da PR na `main` (a Vercel publica sozinha).
- Rollback do código: Vercel → *Deployments* → deploy anterior → *Promote to Production* (instantâneo). Não precisa mexer no banco,
  porque as migrations são compatíveis com a versão anterior.
- Rollback do banco (só se algo der muito errado, e com sua autorização): restaurar a branch `backup-antes-0002` no Neon.

## 7. Depois do deploy

1. Abrir `/entrar` e o painel; conferir *Assistente* e *Custos*.
2. Testar o webhook: `https://<domínio>/api/whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=ok` deve responder `ok`.
3. Seguir o guia do WhatsApp (`whatsapp-meta.md`).
