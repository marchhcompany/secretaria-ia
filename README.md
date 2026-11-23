# Secretária IA

Assistente de atendimento com IA no WhatsApp para pequenos negócios (clínicas, salões, estúdios). Ela responde clientes 24h, consulta horários livres, agenda, cancela e passa a conversa para uma pessoa da equipe quando não sabe responder.

Produto da [March Company](https://marchcompany.com.br), em operação para clientes reais.

## O que faz

- **Atendimento no WhatsApp** pela Cloud API oficial da Meta, com webhook validado por assinatura HMAC (`x-hub-signature-256`) e deduplicação de mensagens recebidas.
- **Agente com ferramentas (tool calling):** o modelo de linguagem não inventa horário. Ele chama funções do sistema:
  - `ver_horarios_livres` — consulta a agenda real no banco
  - `agendar`, `meus_agendamentos`, `cancelar_agendamento`
  - `chamar_atendente` — escala para um humano quando a IA não tem a resposta
- **Painel do negócio:** conversas, agenda, serviços, profissionais, horários de funcionamento, perguntas frequentes e um simulador para testar a assistente antes de ligar no WhatsApp.
- **Multiempresa:** cada negócio tem os próprios dados, equipe e configuração (base para SaaS).
- **Autenticação** com cadastro, login e recuperação de senha.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end e back-end | Next.js (App Router, Server Actions), React, TypeScript |
| Estilo | Tailwind CSS |
| Banco de dados | PostgreSQL com Drizzle ORM (migrations versionadas em `web/drizzle/`) |
| Autenticação | Better Auth |
| IA | Anthropic API (Claude) com tool calling |
| Mensageria | WhatsApp Cloud API (Meta) |
| Deploy | Vercel |

## Arquitetura

```
WhatsApp ──webhook──▶ /api/whatsapp (valida assinatura, deduplica)
                          │
                          ▼
                 engine.ts (loop do agente)
                   │            ▲
         tool_use  ▼            │ tool_result
                 tools.ts ──▶ PostgreSQL (agenda, clientes, conversas)
                          │
                          ▼
                 resposta enviada pelo WhatsApp
```

Principais arquivos em `web/src/`:

- `app/api/whatsapp/route.ts` — webhook de entrada
- `lib/assistant/engine.ts` — loop do agente (chamada ao modelo, execução das ferramentas, escalonamento)
- `lib/assistant/tools.ts` — definição e execução das ferramentas
- `lib/scheduling.ts` — cálculo de horários livres e criação de agendamentos
- `db/schema.ts` — modelo de dados
- `app/painel/` — painel do negócio

## Rodando localmente

```bash
cd web
cp .env.example .env.local   # preencha as variáveis
npm install
npm run db:migrate
npm run dev
```

Variáveis necessárias estão em `web/.env.example` (banco, autenticação, chave da Anthropic e credenciais do WhatsApp). Nenhuma chave real é versionada.

## Autores

Desenvolvido por Davi Barros e Kauã Morais, sócios da March Company.
