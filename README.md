# March Assistente (Secretária IA)

Assistente de atendimento e pré-venda com IA no WhatsApp para negócios locais. Ela responde clientes 24h, qualifica interessados, segue as regras comerciais de cada empresa, agenda (ou registra pedidos de horário), faz follow-up e passa a conversa para uma pessoa da equipe quando precisa.

Documentação do estado atual e próximos passos:

- [Auditoria técnica e o que foi feito](docs/auditoria.md)
- [WhatsApp oficial: passo a passo na Meta, coexistência e Embedded Signup](docs/whatsapp-meta.md)
- [Custos por cliente e viabilidade do plano de R$ 500](docs/custos.md)
- [Provedores de IA: comparação e arquitetura](docs/provedores-ia.md)
- [Checklist de deploy, backup e rollback](docs/deploy-checklist.md)
- [Plano de testes](docs/plano-de-testes.md)
- [Demonstração WS Training Studio](docs/demo-ws-training-studio.md)
- [Integração futura com o CRM March](docs/crm-integracao.md)

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
| IA | Independente de provedor: Anthropic (padrão), OpenAI, Gemini, Groq ou OpenRouter, com tool calling |
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

Testes (Postgres local com o banco `secretaria_test`, usuário/senha `app`; nenhuma chamada paga, nenhum WhatsApp real):

```bash
cd web
npm test
```

Configurar a March Company como primeira empresa (depois de criar a conta em `/criar-conta`):

```bash
cd web
npm run seed:march -- seu@email.com
```

Avaliar a IA com o modelo real (sem `--confirmar` só mostra a estimativa de custo):

```bash
cd web
npm run eval -- "March Company" anthropic:claude-haiku-5-5 --confirmar
```

Variáveis necessárias estão em `web/.env.example` (banco, autenticação, chave da Anthropic e credenciais do WhatsApp). Nenhuma chave real é versionada.

## Autores

Desenvolvido por Davi Barros e Kauã Morais, sócios da March Company.
